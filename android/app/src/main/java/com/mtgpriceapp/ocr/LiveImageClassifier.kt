package com.mtgpriceapp.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mtgpriceapp.ocr.ImageClassifier
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import android.hardware.camera2.CameraCharacteristics
import android.util.Size
import com.facebook.react.module.annotations.ReactModule
import android.net.Uri
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.ByteArrayOutputStream

@ReactModule(name = LiveImageClassifier.NAME)
class LiveImageClassifier(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), PreviewModule {

    companion object {
        const val NAME = "LiveImageClassifier"
        private const val TAG = "LiveImageClassifier"
        private const val MAX_IMAGES = 2
        private const val AOI_LEFT_PERCENT = 0.1f
        private const val AOI_TOP_PERCENT = 0.3f
        private const val AOI_WIDTH_PERCENT = 0.8f
        private const val AOI_HEIGHT_PERCENT = 0.4f
        private val NUM_CLASSES = 31609  // Update this if the model truly outputs 31609 classes.
    }

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundHandler: Handler? = null
    private var backgroundThread: HandlerThread? = null
    private val cameraOpenCloseLock = Semaphore(1)
    private var processingImage = false
    private var previewSurface: Surface? = null
    private var isSessionActive = false
    private var classifier: ImageClassifier? = null
    private var previewSize: Size? = null
    private var lastClassificationTime: Long = 0
    private val CLASSIFICATION_COOLDOWN_MS = 1000L // Adjust cooldown (e.g. 1 second) as needed

    init {
        try {
            classifier = ImageClassifier(reactContext)
            if (classifier == null) {
                Log.e(TAG, "Failed to initialize ImageClassifier")
            }
            startBackgroundThread()
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing classifier", e)
            classifier = null
        }
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun startClassificationSession(promise: Promise) {
        try {
            if (!isSessionActive) {
                isSessionActive = true
                setupCameraPreview()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLASSIFICATION_ERROR", "Failed to start classification session", e)
        }
    }

    @ReactMethod
    fun stopClassificationSession(promise: Promise) {
        try {
            isSessionActive = false
            closeCamera()
            classifier?.close()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CLASSIFICATION_ERROR", "Failed to stop classification session", e)
        }
    }

    @ReactMethod
    fun getPreviewSize(promise: Promise) {
        val currentPreviewSize = previewSize
        if (currentPreviewSize == null) {
            promise.reject("NO_PREVIEW", "Preview not initialized")
            return
        }
        val map = Arguments.createMap().apply {
            putInt("width", currentPreviewSize.width)
            putInt("height", currentPreviewSize.height)
        }
        promise.resolve(map)
    }

    override fun setPreviewSurface(surface: Surface?) {
        previewSurface = surface
        if (surface != null && isSessionActive) {
            setupCameraPreview()
        } else {
            closeCamera()
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupCameraPreview() {
        val manager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = findBackCamera(manager) ?: throw RuntimeException("Back camera not found")
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw RuntimeException("Timeout waiting to lock camera opening.")
            }

            val characteristics = manager.getCameraCharacteristics(cameraId)
            val streamConfigurationMap = characteristics.get(android.hardware.camera2.CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?: throw RuntimeException("Cannot get available preview sizes")

            val previewSizes = streamConfigurationMap.getOutputSizes(SurfaceHolder::class.java)
            val displayMetrics = reactContext.resources.displayMetrics
            val screenAspectRatio = displayMetrics.widthPixels.toFloat() / displayMetrics.heightPixels.toFloat()
            previewSize = previewSizes
                .filter { it.height >= 1080 || it.width >= 1920 }
                .minByOrNull {
                    val ratio = it.width.toFloat() / it.height.toFloat()
                    abs(ratio - screenAspectRatio)
                } ?: previewSizes.first()

            sendPreviewSizeToReact(previewSize!!.width, previewSize!!.height)

            imageReader = ImageReader.newInstance(
                previewSize!!.width,
                previewSize!!.height,
                ImageFormat.YUV_420_888,
                MAX_IMAGES
            ).apply {
                setOnImageAvailableListener({ reader ->
                    if (!isSessionActive || previewSurface == null) {
                        reader.acquireLatestImage()?.close()
                        return@setOnImageAvailableListener
                    }
                    if (processingImage) {
                        drainExtraImages(reader)
                        return@setOnImageAvailableListener
                    }
                    processingImage = true
                    val image = reader.acquireLatestImage()
                    drainExtraImages(reader)

                    if (image != null) {
                        try {
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastClassificationTime < CLASSIFICATION_COOLDOWN_MS) {
                                image.close()
                                return@setOnImageAvailableListener
                            }
                            lastClassificationTime = currentTime

                            // Log that a new image is processed with a unique timestamp
                            Log.d(TAG, "Processing image at time: $currentTime")
                            
                            val width = image.width
                            val height = image.height

                            // Define the AOI dimensions based on a Magic card's aspect ratio (2.5:3.5)
                            val CARD_WIDTH_PERCENT = 0.3f  // Adjust this value as needed
                            val cardWidth = (width * CARD_WIDTH_PERCENT).toInt()
                            val cardHeight = (cardWidth * (3.5f / 2.5f)).toInt()

                            // Center the AOI in the image
                            val left = (width - cardWidth) / 2
                            val top = (height - cardHeight) / 2

                            val cropWidth = cardWidth
                            val cropHeight = cardHeight

                            val bitmap = cropImage(image, left, top, cropWidth, cropHeight)
                            val prediction = classifier?.classify(bitmap) ?: "Unknown"
                            Log.d(TAG, "Prediction: $prediction")

                            val params = Arguments.createMap().apply {
                                putString("label", prediction)
                            }
                            reactContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("LiveImageClassification", params)
                        } catch (e: Exception) {
                            Log.e(TAG, "Error during image classification", e)
                        } finally {
                            image.close()
                            processingImage = false
                        }
                    } else {
                        processingImage = false
                    }
                }, backgroundHandler)
            }

            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraOpenCloseLock.release()
                    cameraDevice = camera
                    createCameraPreviewSession()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    cameraOpenCloseLock.release()
                    camera.close()
                    cameraDevice = null
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    cameraOpenCloseLock.release()
                    camera.close()
                    cameraDevice = null
                    Log.e(TAG, "Camera device error: $error")
                }
            }, backgroundHandler)

        } catch (e: Exception) {
            Log.e(TAG, "Error setting up camera preview", e)
            cameraOpenCloseLock.release()
        }
    }

    private fun createCameraPreviewSession() {
        try {
            val surface = previewSurface ?: run {
                Log.e(TAG, "Preview surface is null")
                return
            }
            val previewRequestBuilder = cameraDevice?.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
                ?: run {
                    Log.e(TAG, "Camera device is null")
                    return
                }
            previewRequestBuilder.apply {
                addTarget(surface)
                imageReader?.surface?.let { addTarget(it) }
                set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
                set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE, CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)
            }
            val surfaces = mutableListOf(surface).apply { imageReader?.surface?.let { add(it) } }
            cameraDevice?.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        session.setRepeatingRequest(previewRequestBuilder.build(), null, backgroundHandler)
                    } catch (e: CameraAccessException) {
                        Log.e(TAG, "Failed to start camera preview: ${e.message}")
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "Failed to configure camera session")
                }
            }, backgroundHandler)
        } catch (e: Exception) {
            Log.e(TAG, "Error creating preview session", e)
        }
    }

    private fun drainExtraImages(reader: ImageReader) {
        while (true) {
            val extraImage = reader.acquireLatestImage() ?: break
            extraImage.close()
        }
    }

    private fun cropImage(image: Image, left: Int, top: Int, width: Int, height: Int): Bitmap {
        val yBuffer = image.planes[0].buffer
        val uBuffer = image.planes[1].buffer
        val vBuffer = image.planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        // Note: U and V are swapped in NV21.
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
        val out = ByteArrayOutputStream()
        val cropRect = Rect(left, top, left + width, top + height)
        yuvImage.compressToJpeg(cropRect, 100, out)
        return BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
    }

    private fun closeCamera() {
        try {
            cameraOpenCloseLock.acquire()
            processingImage = false
            captureSession?.stopRepeating()
            captureSession?.abortCaptures()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping preview session", e)
        } finally {
            captureSession?.close()
            captureSession = null
            cameraDevice?.close()
            cameraDevice = null
            imageReader?.close()
            imageReader = null
            cameraOpenCloseLock.release()
        }
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("CameraBackground").also { thread ->
            thread.start()
            backgroundHandler = Handler(thread.looper)
        }
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join()
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {
            Log.e(TAG, "Error stopping background thread", e)
        }
    }

    private fun findBackCamera(manager: CameraManager): String? {
        manager.cameraIdList.forEach { id ->
            val characteristics = manager.getCameraCharacteristics(id)
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            Log.d(TAG, "Camera $id facing: $facing")
        }
        return manager.cameraIdList.find { id ->
            manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }?.also { Log.d(TAG, "Selected back camera: $it") }
    }

    private fun sendPreviewSizeToReact(width: Int, height: Int) {
        val currentPreviewSize = previewSize
        if (currentPreviewSize == null) {
            Log.e(TAG, "Preview size is null")
            return
        }
        val params = Arguments.createMap().apply {
            putInt("width", currentPreviewSize.width)
            putInt("height", currentPreviewSize.height)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PreviewSize", params)
    }

    override fun onCatalystInstanceDestroy() {
        stopBackgroundThread()
        closeCamera()
        classifier?.close()
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun classifyImageForTesting(imagePath: String, promise: Promise) {
        try {
            // Handle both file:// URIs and direct paths
            val path = if (imagePath.startsWith("file://")) {
                Uri.parse(imagePath).path ?: throw IOException("Invalid file URI")
            } else {
                imagePath
            }
            
            // Verify file exists before decoding
            val file = File(path)
            if (!file.exists()) {
                throw FileNotFoundException("File not found: $path")
            }
            if (!file.canRead()) {
                throw SecurityException("No read permissions for file: $path")
            }

            // Check if file is actually an image
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(path, options)
            if (options.outWidth == -1 || options.outHeight == -1) {
                throw IOException("Invalid image file: $path")
            }

            // Actual decoding with error handling
            val bitmap = BitmapFactory.decodeFile(path) ?: throw IOException("Failed to decode bitmap")
            
            classifier?.let { 
                val results = it.classify(bitmap)
                if (results != null) {
                    promise.resolve(results)
                } else {
                    promise.reject("CLASSIFICATION_ERROR", "Null results from classifier")
                }
            } ?: promise.reject("CLASSIFICATION_ERROR", "Classifier not initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Classification error: ${e.javaClass.simpleName}", e)
            promise.reject("CLASSIFICATION_ERROR", e)
        }
    }
} 