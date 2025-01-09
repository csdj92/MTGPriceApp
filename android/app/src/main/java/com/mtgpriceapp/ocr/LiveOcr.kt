package com.mtgpriceapp.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
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

    companion object {
        private const val TAG = "LiveOcr"
        const val NAME = "LiveOcr"
        private const val MAX_IMAGES = 2  // ML Kit recommendation for backpressure
    }

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

    private fun sendPreviewSizeToReact(width: Int, height: Int) {
        val params = Arguments.createMap().apply {
            putInt("width", width)
            putInt("height", height)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PreviewSize", params)
    }

    /**
     * Set up the camera preview and ImageReader for OCR
     */
    @SuppressLint("MissingPermission")
    private fun setupCameraPreview() {
        val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = findBackCamera(manager) ?: throw RuntimeException("Back camera not found")
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw RuntimeException("Time out waiting to lock camera opening.")
            }

            val characteristics = manager.getCameraCharacteristics(cameraId)
            val streamConfigurationMap = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?: throw RuntimeException("Cannot get available preview/video sizes")

            val previewSizes = streamConfigurationMap.getOutputSizes(SurfaceHolder::class.java)
            Log.d(TAG, "Available preview sizes: ${previewSizes.joinToString { "${it.width}x${it.height}" }}")

            val displayMetrics = reactApplicationContext.resources.displayMetrics
            val screenAspectRatio = displayMetrics.widthPixels.toFloat() / displayMetrics.heightPixels.toFloat()

            // Prefer a larger size around 1920x1080
            val bestPreviewSize = previewSizes
                .filter { it.height >= 1080 || it.width >= 1920 }
                .minByOrNull {
                    val ratio = it.width.toFloat() / it.height.toFloat()
                    abs(ratio - screenAspectRatio)
                } ?: previewSizes.first()

            Log.d(TAG, "Selected preview size: ${bestPreviewSize.width}x${bestPreviewSize.height}")
            sendPreviewSizeToReact(bestPreviewSize.width, bestPreviewSize.height)

            imageReader = ImageReader.newInstance(
                bestPreviewSize.width,
                bestPreviewSize.height,
                ImageFormat.YUV_420_888,
                MAX_IMAGES
            ).apply {
                setOnImageAvailableListener({ reader ->
                    if (!processingImage && isSessionActive && previewSurface != null) {
                        processingImage = true
                        val image = reader.acquireLatestImage()

                        // Drain any extra images to prevent backlog
                        while (reader.acquireLatestImage()?.also { it.close() } != null) { }

                        if (image != null) {
                            try {
                                val rotation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
                                val inputImage = InputImage.fromMediaImage(image, rotation)

                                textRecognizer.process(inputImage)
                                    .addOnSuccessListener(executor) { text ->
                                        if (isSessionActive && previewSurface != null) {
                                            Log.d(TAG, "Raw OCR blocks: ${
                                                text.textBlocks.joinToString("\n") { it.text }
                                            }")

                                            val candidates = text.textBlocks
                                                .asSequence()
                                                .map { it.text.trim() }
                                                // Basic length check
                                                .filter { it.length in 3..50 }
                                                // Exclude digits, slashes, set codes, mana costs, etc.
                                                .filter { !it.contains(Regex("[\\d/]")) }
                                                // Remove lines with typical MTG or Lorcana card types / keywords
                                                .filter {
                                                    !it.contains(
                                                        Regex(
                                                            "(?i)(Creature|Instant|Sorcery|Enchantment|Artifact|Land|Planeswalker|" + 
                                                            "Choose one|Target opponent|Legendary|Hero|Villian|" + // Lorcana might have "Villain" or "Hero"
                                                            "Action|Character|Item|Song|Dreamborn|Floodborn|Storyborn|Shift|Exert|Evasive|" +
                                                            "Kicker|Flash|Wizards of the Coast|\\u2122|\\u00A9|" + 
                                                            "Illustrated|Set|Collector|Number|MTG|Magic|artist|token|draw|discard|" + 
                                                            "counter|dies|enters|destroy|exile|return|flying|" +
                                                            "control|mana|tap|untap|sacrifice|blocks|deals|damage|" +
                                                            "Power|Toughness|" + // just in case
                                                            "FDN|LUTFULLINA|KOVACS|PRESCOTT|VALERA|VANCE)" // known artists or set codes you want to exclude
                                                        )
                                                    )
                                                }
                                                // Exclude curly braces or other bracket artifacts
                                                .filter { !it.contains(Regex("[{}\\[\\]]")) }
                                                // Must be mostly letters, spaces, punctuation like apostrophes or hyphens
                                                .filter { it.matches(Regex("[A-Za-z\\s,'’‘\\-]+")) }
                                                .toList()

                                            Log.d(TAG, "Filtered candidates: $candidates")

                                            // Choose best candidate by scoring
                                            val bestName = candidates.maxByOrNull { computeNameScore(it) }

                                            if (!bestName.isNullOrBlank() && bestName != lastDetectedName) {
                                                Log.d(TAG, "Selected card name: $bestName")
                                                // small delay to reduce spamming
                                                Thread.sleep(250)

                                                lastDetectedName = bestName
                                                val params = Arguments.createMap().apply {
                                                    putString("text", bestName)
                                                }
                                                reactApplicationContext
                                                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                                    .emit("LiveOcrResult", params)

                                                Log.d(TAG, "Card name detected: $bestName")
                                            }
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
                        // Surface or session isn't ready; close the extra image.
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

    /**
     * Create camera preview session
     */
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

                // Basic auto modes
                set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)

                // Optical stabilization if available
                set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE, CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)

                // Scene mode: barcode can help with text edges
                set(CaptureRequest.CONTROL_SCENE_MODE, CaptureRequest.CONTROL_SCENE_MODE_BARCODE)

                // Sharpness priority
                set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_FAST)
                set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY)
            }

            val surfaces = mutableListOf(surface)
            imageReader?.surface?.let { surfaces.add(it) }

            cameraDevice?.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        session.setRepeatingRequest(
                            previewRequestBuilder.build(),
                            null,
                            backgroundHandler
                        )
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
        backgroundHandler = Handler(backgroundThread?.looper
            ?: throw IllegalStateException("Background thread not initialized"))
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

    /**
     * Find the back-facing camera
     */
    private fun findBackCamera(manager: CameraManager): String? {
        manager.cameraIdList.forEach { id ->
            val characteristics = manager.getCameraCharacteristics(id)
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            val level = characteristics.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)
            val capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)
            val sensorSize = characteristics.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
            val focalLengths = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)

            Log.d(TAG, """Camera $id:
                |  Facing: $facing (${if (facing == CameraCharacteristics.LENS_FACING_FRONT) "FRONT" else if (facing == CameraCharacteristics.LENS_FACING_BACK) "BACK" else "OTHER"})
                |  Hardware Level: $level
                |  Capabilities: $capabilities
                |  Sensor Size: $sensorSize
                |  Focal Lengths: ${focalLengths?.joinToString()}
            """.trimMargin())
        }

        return manager.cameraIdList.find { id ->
            manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }?.also {
            Log.d(TAG, "Selected back camera: $it")
        }
    }

    /**
     * Compute a simple score for a candidate name, rewarding typical features
     * of real card titles (capitalization, multiple words, not all caps, etc.)
     */
    private fun computeNameScore(name: String): Int {
        var score = 0

        // Word-by-word check for title case, e.g. “Seeker’s”, “Dragon”, etc.
        val words = name.split(" ")
        val isProperTitleCase = words.all { word ->
            if (word.isEmpty()) false
            else {
                val first = word.first()
                // Accept typical punctuation like apostrophes or hyphens
                // "Seeker's" -> S, e, e, k, e, r, ', s
                // "Folly" -> F, o, l, l, y
                first.isUpperCase() && word.drop(1).all { c ->
                    c.isLowerCase() || c in listOf('-', '\'', '’', '‘')
                }
            }
        }
        if (isProperTitleCase) {
            score += 6
        }

        // If all uppercase or all lowercase, not as likely to be a proper name
        if (name == name.uppercase()) score += 1
        if (name == name.lowercase()) score += 1

        // Slight reward for multi-word names
        if (words.size >= 2) score += 2

        // Typical MTG / Lorcana name length ~ 3..30
        if (name.length in 3..30) {
            score += 2
        }

        // If it has a possessive apostrophe (like “Seeker’s”), that *might* be a clue it's a real name
        if (name.contains("'")) score += 1

        return score
    }
}
