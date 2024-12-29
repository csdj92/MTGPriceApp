package com.mtgpriceapp.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.Surface
import android.view.SurfaceHolder
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.abs

@ReactModule(name = LiveOcr.NAME)
class LiveOcr(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundHandler: Handler? = null
    private var backgroundThread: HandlerThread? = null
    private val cameraOpenCloseLock = Semaphore(1)
    private var previewSurface: Surface? = null
    private var isSessionActive = false
    private var processingImage = false
    private var lastDetectedName: String? = null
    private val executor: Executor = Executors.newSingleThreadExecutor()
    private val textRecognizer: TextRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    companion object {
        private const val TAG = "LiveOcr"
        const val NAME = "LiveOcr"
        private const val TARGET_PREVIEW_WIDTH = 1920
        private const val TARGET_PREVIEW_HEIGHT = 1080
        private const val MAX_PREVIEW_WIDTH = 1920
        private const val MAX_PREVIEW_HEIGHT = 1080
    }

    override fun getName() = NAME

    override fun initialize() {
        super.initialize()
        startBackgroundThread()
    }

    override fun onCatalystInstanceDestroy() {
        stopBackgroundThread()
        closeCamera()
        textRecognizer.close()
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun startOcrSession(promise: Promise) {
        try {
            if (!isSessionActive) {
                isSessionActive = true
                setupCameraPreview()
                promise.resolve(null)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("OCR_ERROR", "Failed to start OCR session", e)
        }
    }

    @ReactMethod
    fun stopOcrSession(promise: Promise) {
        try {
            isSessionActive = false
            closeCamera()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OCR_ERROR", "Failed to stop OCR session", e)
        }
    }

    fun setPreviewSurface(surface: Surface?) {
        previewSurface = surface
        if (surface != null && isSessionActive) {
            setupCameraPreview()
        } else {
            closeCamera()
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupCameraPreview() {
        val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = findBackCamera(manager) ?: manager.cameraIdList[0]
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw RuntimeException("Time out waiting to lock camera opening.")
            }

            val characteristics = manager.getCameraCharacteristics(cameraId)
            val streamConfigurationMap = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?: throw RuntimeException("Cannot get available preview/video sizes")

            // Find the best preview size
            val previewSize = streamConfigurationMap.getOutputSizes(ImageFormat.YUV_420_888)
                .filter { it.width <= MAX_PREVIEW_WIDTH && it.height <= MAX_PREVIEW_HEIGHT }
                .maxByOrNull { it.width * it.height }
                ?: Size(TARGET_PREVIEW_WIDTH, TARGET_PREVIEW_HEIGHT)

            // Setup image reader for OCR
            imageReader = ImageReader.newInstance(
                previewSize.width,
                previewSize.height,
                ImageFormat.YUV_420_888,
                3
            ).apply {
                setOnImageAvailableListener({ reader ->
                    if (!processingImage && isSessionActive) {
                        processingImage = true
                        val image = reader.acquireLatestImage()
                        
                        // Clear any pending images first
                        while (reader.acquireLatestImage()?.also { it.close() } != null) {
                            // Keep clearing until no more images
                        }
                        
                        if (image != null) {
                            try {
                                val rotation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
                                val inputImage = InputImage.fromMediaImage(image, rotation)
                                
                                textRecognizer.process(inputImage)
                                    .addOnSuccessListener(executor) { text ->
                                        // Find the most likely card name from the detected text
                                        val cardName = text.textBlocks
                                            .asSequence()
                                            .map { it.text.trim() }
                                            .filter { it.length in 3..50 } // Reasonable length for card names
                                            .filter { !it.contains(Regex("[\\d/]")) } // Filter out power/toughness and set numbers
                                            .filter { !it.matches(Regex(".*(Creature|Instant|Sorcery|Enchantment|Artifact|Land|Planeswalker).*")) } // Filter out type lines
                                            .filter { !it.contains(Regex("(?i)(counter|token|create|whenever|dies|enters|control|flying)")) } // Filter out rules text
                                            .filter { !it.contains(Regex("(?i)(Wizards of the Coast|™|©)")) } // Filter out copyright text
                                            .firstOrNull()

                                        if (!cardName.isNullOrBlank() && cardName != lastDetectedName) {
                                            lastDetectedName = cardName
                                            val params = Arguments.createMap().apply {
                                                putString("text", cardName)
                                            }
                                            // Send event to React Native
                                            reactApplicationContext
                                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                                .emit("LiveOcrResult", params)
                                            
                                            // Log the detected text
                                            Log.d(TAG, "Card name detected: $cardName")
                                        }
                                    }
                                    .addOnFailureListener(executor) { e ->
                                        Log.e(TAG, "OCR failed", e)
                                    }
                                    .addOnCompleteListener(executor) {
                                        image.close()
                                        processingImage = false
                                    }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error processing image", e)
                                image.close()
                                processingImage = false
                            }
                        } else {
                            processingImage = false
                        }
                    } else {
                        // Clear pending images if we're not processing
                        reader.acquireLatestImage()?.close()
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

            val device = cameraDevice ?: run {
                Log.e(TAG, "Camera device is null")
                return
            }

            val imageReaderSurface = imageReader?.surface ?: run {
                Log.e(TAG, "Image reader surface is null")
                return
            }

            // Close existing session first
            captureSession?.close()
            captureSession = null

            // Create preview request with optimal settings
            val previewRequestBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                addTarget(surface)
                addTarget(imageReaderSurface)
                
                // Optimize for OCR
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
                set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, Range(15, 30))
                set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                set(CaptureRequest.JPEG_QUALITY, 100.toByte())
            }

            // Create capture session with proper synchronization
            val surfaces = listOf(surface, imageReaderSurface)
            device.createCaptureSession(
                surfaces,
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(session: CameraCaptureSession) {
                        if (device != cameraDevice || !isSessionActive) {
                            session.close()
                            return
                        }
                        
                        captureSession = session
                        try {
                            session.setRepeatingRequest(
                                previewRequestBuilder.build(),
                                object : CameraCaptureSession.CaptureCallback() {},
                                backgroundHandler
                            )
                        } catch (e: CameraAccessException) {
                            Log.e(TAG, "Failed to start camera preview", e)
                        }
                    }

                    override fun onConfigureFailed(session: CameraCaptureSession) {
                        Log.e(TAG, "Failed to configure camera session")
                        session.close()
                    }
                },
                backgroundHandler
            )

        } catch (e: Exception) {
            Log.e(TAG, "Error creating preview session", e)
        }
    }

    private fun closePreviewSession() {
        try {
            captureSession?.stopRepeating()
            captureSession?.abortCaptures()
        } catch (e: CameraAccessException) {
            Log.e(TAG, "Error stopping preview session", e)
        } finally {
            captureSession?.close()
            captureSession = null
        }
    }

    private fun closeCamera() {
        try {
            cameraOpenCloseLock.acquire()
            processingImage = false
            closePreviewSession()
            cameraDevice?.close()
            cameraDevice = null
            imageReader?.close()
            imageReader = null
        } catch (e: InterruptedException) {
            Log.e(TAG, "Error closing camera", e)
        } finally {
            cameraOpenCloseLock.release()
        }
    }

    private fun startBackgroundThread() {
        backgroundThread?.quitSafely()
        backgroundThread = HandlerThread("CameraBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread?.looper ?: throw IllegalStateException("Background thread not initialized"))
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
        return manager.cameraIdList.find { id ->
            val characteristics = manager.getCameraCharacteristics(id)
            characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }
    }
}