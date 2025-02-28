package com.mtgpriceapp.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.*
import android.media.Image
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
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

import com.mtgpriceapp.ocr.PreviewModule

@ReactModule(name = LiveOcr.NAME)
class LiveOcr(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), PreviewModule {

    companion object {
        private const val TAG = "LiveOcr"
        const val NAME = "LiveOcr"

        // Limits and AOI configuration
        private const val MAX_IMAGES = 2              // ML Kit recommendation for backpressure
        private const val COOLDOWN_MS = 2000L         // 2 seconds cooldown between scans
        private const val AOI_LEFT_PERCENT = 0.1f     // Crop 10% from the left
        private const val AOI_TOP_PERCENT = 0.2f      // Crop 20% from the top (was 30%) - to capture more of the card
        private const val AOI_WIDTH_PERCENT = 0.8f    // Crop 80% of width
        private const val AOI_HEIGHT_PERCENT = 0.5f   // Crop 50% of height (was 40%) - to capture more details

        // Pre-compile regexes to avoid repeated compilation (improves performance)
        private val KEYWORD_FILTER = Regex(
            "(?i)(Creature|Instant|Sorcery|Enchantment|Artifact|Land|Planeswalker|" +
                    "Choose one|Target opponent|Legendary|Hero|Villian|" +
                    "Action|Character|Item|Song|Dreamborn|Floodborn|Storyborn|Shift|Exert|Evasive|" +
                    "Kicker|Flash|Wizards of the Coast|\\u2122|\\u00A9|" +
                    "Illustrated|Set|Collector|Number|MTG|Magic|artist|token|draw|discard|" +
                    "counter|dies|enters|destroy|exile|return|flying|" +
                    "control|mana|tap|untap|sacrifice|blocks|deals|damage|" +
                    "Power|Toughness|FDN|LUTFULLINA|KOVACS|PRESCOTT|VALERA|VANCE)"
        )
        // Updated regex for Lorcana card names - more permissive to catch different formats
        private val LORCANA_NAME_REGEX = Regex("^[A-Z][A-Z\\s',\\-]+\$")
        // Updated regex for Lorcana subtypes with more flexibility
        private val LORCANA_VERSION_REGEX = Regex("^[A-Za-z][A-Za-z\\s\\-',()]+\$")
        // New regex for detecting Lorcana stats (e.g., "2 ⬥ | 3 ⭒")
        private val LORCANA_STATS_REGEX = Regex("^(\\d+)\\s*[⬥⭒]\\s*[|]\\s*(\\d+)\\s*[⬥⭒]\$")
        // New regex for detecting Lorcana ink cost
        private val LORCANA_INK_COST_REGEX = Regex("^(\\d+)\\s*[⬥⭒]\$")
        private val MTG_NAME_REGEX = Regex("^[A-Z][a-zA-Z\\s,'\\-]+\$")
    }

    // Camera and threading properties
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundHandler: Handler? = null
    private var backgroundThread: HandlerThread? = null
    private val cameraOpenCloseLock = Semaphore(1)

    private var previewSurface: Surface? = null
    private var isSessionActive = false
    @Volatile private var processingImage = false
    private var lastDetectedName: String? = null

    // Use a single-threaded executor for OCR tasks
    private val executor: Executor = Executors.newSingleThreadExecutor()

    private val textRecognizer: TextRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    // To prevent duplicate scans during the COOLDOWN_MS interval.
    private val recentScans = mutableListOf<Pair<String, Long>>()

    // For movement detection
    private var lastBoundingBox: Rect? = null
    // Adjust this threshold to make movement detection more/less sensitive.
    private val MOVEMENT_THRESHOLD = 50

    private var currentPreviewWidth: Int? = null
    private var currentPreviewHeight: Int? = null

    private var processingPaused = false
    private var isLorcanaScanMode = false

    private var currentZoomLevel = 0.0f
    private val MAX_ZOOM_LEVEL = 5.0f  // Max zoom level, can be adjusted
    private val ZOOM_STEP = 0.5f       // Zoom increment/decrement step

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
            }
            promise.resolve(null)
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

    override fun setPreviewSurface(surface: Surface?) {
        synchronized(this) {
            if (previewSurface == surface) {
                return  // No change needed
            }
            
            previewSurface = surface
            if (surface != null && isSessionActive) {
                closeCamera()  // Ensure clean state
                setupCameraPreview()
            } else {
                closeCamera()
            }
        }
    }

    private fun sendPreviewSizeToReact(width: Int, height: Int) {
        currentPreviewWidth = width
        currentPreviewHeight = height
        val params = Arguments.createMap().apply {
            putInt("width", width)
            putInt("height", height)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PreviewSize", params)
    }

    @ReactMethod
    fun getPreviewSize(promise: Promise) {
        if (currentPreviewWidth != null && currentPreviewHeight != null) {
            val result = Arguments.createMap()
            result.putInt("width", currentPreviewWidth!!)
            result.putInt("height", currentPreviewHeight!!)
            promise.resolve(result)
        } else {
            promise.reject("NO_SIZE", "Preview size not available")
        }
    }

    /**
     * Set up the camera preview and the ImageReader.
     */
    @SuppressLint("MissingPermission")
    private fun setupCameraPreview() {
        val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = findBackCamera(manager) ?: throw RuntimeException("Back camera not found")
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw RuntimeException("Timeout waiting to lock camera opening.")
            }

            val characteristics = manager.getCameraCharacteristics(cameraId)
            val streamConfigurationMap =
                characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    ?: throw RuntimeException("Cannot get available preview/video sizes")

            val previewSizes = streamConfigurationMap.getOutputSizes(SurfaceHolder::class.java)
            Log.d(TAG, "Available preview sizes: ${
                previewSizes.joinToString { "${it.width}x${it.height}" }
            }")

            val displayMetrics = reactApplicationContext.resources.displayMetrics
            val screenAspectRatio = displayMetrics.widthPixels.toFloat() / displayMetrics.heightPixels.toFloat()

            // Prefer a larger size around 1920x1080 if possible
            val bestPreviewSize = previewSizes
                .filter { it.height >= 1080 || it.width >= 1920 }
                .minByOrNull {
                    val ratio = it.width.toFloat() / it.height.toFloat()
                    abs(ratio - screenAspectRatio)
                } ?: previewSizes.first()

            Log.d(TAG, "Selected preview size: ${bestPreviewSize.width}x${bestPreviewSize.height}")
            sendPreviewSizeToReact(bestPreviewSize.width, bestPreviewSize.height)

            // Pre-capture the sensor orientation so that we can pass it along to ML Kit.
            val sensorOrientation =
                characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0

            // Initialize the ImageReader using the preview size and format.
            imageReader = ImageReader.newInstance(
                bestPreviewSize.width,
                bestPreviewSize.height,
                ImageFormat.YUV_420_888,
                MAX_IMAGES
            ).apply {
                setOnImageAvailableListener({ reader ->
                    if (!isSessionActive || previewSurface == null || processingPaused) {
                        reader.acquireLatestImage()?.close()
                        return@setOnImageAvailableListener
                    }
                    if (processingImage) {
                        // Drain any extra images so we do not build up a backlog.
                        drainExtraImages(reader)
                        return@setOnImageAvailableListener
                    }

                    processingImage = true
                    val image = reader.acquireLatestImage()
                    // Drain extra images (if any)
                    drainExtraImages(reader)

                    if (image != null) {
                        try {
                            // Use different AOI settings for Lorcana cards
                            val aoiSettings = if (isLorcanaScanMode) {
                                // For Lorcana cards, focus more on the top portion where the name is
                                listOf(0.1f, 0.15f, 0.8f, 0.6f)
                            } else {
                                // Default settings for MTG cards
                                listOf(AOI_LEFT_PERCENT, AOI_TOP_PERCENT, AOI_WIDTH_PERCENT, AOI_HEIGHT_PERCENT)
                            }
                            
                            val leftPercent = aoiSettings[0]
                            val topPercent = aoiSettings[1]
                            val widthPercent = aoiSettings[2]
                            val heightPercent = aoiSettings[3]
                            
                            val width = image.width
                            val height = image.height
                            
                            val left = (width * leftPercent).toInt()
                            val top = (height * topPercent).toInt()
                            val cropWidth = (width * widthPercent).toInt()
                            val cropHeight = (height * heightPercent).toInt()

                            // Instead of converting the full image, compress only the AOI.
                            val croppedBitmap = cropImage(image, left, top, cropWidth, cropHeight)
                            val inputImage = InputImage.fromBitmap(croppedBitmap, sensorOrientation)

                            textRecognizer.process(inputImage)
                                .addOnSuccessListener(executor) { text ->
                                    processOcrResult(text)
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
     * Create and start the camera preview session.
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
                set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO)
                set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE, CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)
                set(CaptureRequest.CONTROL_SCENE_MODE, CaptureRequest.CONTROL_SCENE_MODE_BARCODE)
                set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_FAST)
                set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY)
            }

            val surfaces = mutableListOf(surface).apply {
                imageReader?.surface?.let { add(it) }
            }

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
            synchronized(this) {
                if (captureSession != null) {
                    try {
                        captureSession?.stopRepeating()
                        captureSession?.abortCaptures()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error stopping capture session", e)
                    } finally {
                        try {
                            captureSession?.close()
                        } catch (e: Exception) {
                            Log.e(TAG, "Error closing capture session", e)
                        }
                        captureSession = null
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in closePreviewSession", e)
        }
    }

    private fun closeCamera() {
        try {
            cameraOpenCloseLock.acquire()
            synchronized(this) {
                processingImage = false
                closePreviewSession()
                
                try {
                    cameraDevice?.close()
                } catch (e: Exception) {
                    Log.e(TAG, "Error closing camera device", e)
                }
                cameraDevice = null
                
                try {
                    imageReader?.close()
                } catch (e: Exception) {
                    Log.e(TAG, "Error closing image reader", e)
                }
                imageReader = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in closeCamera", e)
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
     * Find and return the back-facing camera id.
     */
    private fun findBackCamera(manager: CameraManager): String? {
        manager.cameraIdList.forEach { id ->
            val characteristics = manager.getCameraCharacteristics(id)
            val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
            Log.d(TAG, "Camera $id facing: $facing")
        }
        return manager.cameraIdList.find { id ->
            manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }?.also { Log.d(TAG, "Selected back camera: $it") }
    }

    /**
     * Compute a score for a candidate name by rewarding typical card title features.
     * Higher scores indicate more likely card names.
     */
    private fun computeNameScore(name: String): Int {
        var score = 0
        val words = name.split(" ")
        
        // Check for proper title case (first letter caps, rest lowercase)
        val isProperTitleCase = words.all { word ->
            if (word.isEmpty()) false
            else {
                val first = word.first()
                first.isUpperCase() && word.drop(1).all { c ->
                    c.isLowerCase() || c in listOf('-', '\'', ',')
                }
            }
        }
        
        // Favor proper title case heavily
        if (isProperTitleCase) score += 6
        
        // All uppercase is common for Lorcana names (but not as good as proper title case)
        if (name == name.uppercase() && name.length >= 3) score += 4
        
        // All lowercase is unlikely to be a card name
        if (name == name.lowercase()) score -= 2
        
        // Favor names with 2+ words (common for card names)
        if (words.size >= 2) score += 2
        
        // Favor names of reasonable length
        if (name.length in 3..25) score += 2
        
        // Penalize very short or very long names
        if (name.length < 3 || name.length > 40) score -= 3
        
        // Common characters in fantasy names
        if (name.contains("'")) score += 1
        if (name.contains("-")) score += 1
        
        // Penalize names with excessive punctuation (likely not card names)
        val punctCount = name.count { it in ",.!?;:()[]{}\"" }
        if (punctCount > 2) score -= punctCount
        
        // Penalize names with numbers (uncommon in card titles)
        if (name.any { it.isDigit() }) score -= 2
        
        // Common patterns in Lorcana card names
        if (name.contains("THE ", ignoreCase = true)) score += 1
        if (name.contains("OF ", ignoreCase = true)) score += 1
        
        // Known Lorcana prefixes
        val knownPrefixes = listOf("MICKEY", "MINNIE", "DONALD", "GOOFY", "STITCH", "ARIEL", "BELLE", "MULAN", "SIMBA")
        if (knownPrefixes.any { name.uppercase().startsWith(it) }) score += 3
        
        return score
    }

    /**
     * Process OCR results: filter, score, and select the best candidate.
     */
    private fun processOcrResult(text: com.google.mlkit.vision.text.Text) {
        if (!isSessionActive || previewSurface == null) return

        // Log text blocks for debugging (remove or reduce logging for production)
        text.textBlocks.forEachIndexed { blockIndex, block ->
            Log.d(TAG, "Block $blockIndex: '${block.text}'")
            block.lines.forEachIndexed { lineIndex, line ->
                Log.d(TAG, "  line $lineIndex: '${line.text}'")
            }
        }

        // Flatten all non-empty trimmed lines.
        val allLines = text.textBlocks.flatMap { block ->
            block.lines.map { it.text.trim() }
        }.filter { it.isNotEmpty() }
        Log.d(TAG, "Flattened lines:\n${allLines.joinToString("\n")}")

        // Find the best candidate using our filtering rules.
        val candidate = findCandidate(allLines)
        Log.d(TAG, "Candidate found: $candidate")
        if (candidate != null) {
            val (name, subtype, isLorcana) = candidate
            val fullName = when {
                isLorcana && subtype != null -> "$name - $subtype"
                !isLorcana && subtype != null -> "$name ($subtype)"
                else -> name
            }
            // Use the bounding box from the first block, if available.
            val boundingBox = text.textBlocks.firstOrNull()?.boundingBox

            if (fullName != lastDetectedName) {
                sendOcrResult(fullName, name, subtype, isLorcana, boundingBox)
                lastDetectedName = fullName
            }
        }
    }

    /**
     * Given a list of lines, return a candidate card name.
     *
     * This method uses the pre-compiled regexes to first look for a Lorcana candidate (name + version)
     * and then for an MTG candidate if no Lorcana candidate is found. In case of multiple candidates,
     * the one with the highest score is returned.
     */
    private fun findCandidate(allLines: List<String>): Triple<String, String?, Boolean>? {
        val candidates = mutableListOf<Triple<String, String?, Boolean>>()
        
        // Temporary storage for potential Lorcana card data
        data class LorcanaCardData(
            val nameIndex: Int, 
            val name: String, 
            var subtype: String? = null,
            var inkCost: String? = null,
            var stats: String? = null,
            var confidence: Int = 1
        )
        
        val lorcanaCardData = mutableListOf<LorcanaCardData>()
        
        // First pass: identify potential Lorcana card names and gather related data
        for (i in allLines.indices) {
            val line = allLines[i]
            
            // Check for Lorcana card name
            if (LORCANA_NAME_REGEX.matches(line) && !KEYWORD_FILTER.containsMatchIn(line)) {
                lorcanaCardData.add(LorcanaCardData(i, line))
            }
        }
        
        // Second pass: look for associated information for each potential card
        for (cardData in lorcanaCardData) {
            val nameIndex = cardData.nameIndex
            
            // Look for subtype in the next line
            if (nameIndex + 1 < allLines.size) {
                val nextLine = allLines[nameIndex + 1]
                if (LORCANA_VERSION_REGEX.matches(nextLine) && !KEYWORD_FILTER.containsMatchIn(nextLine)) {
                    cardData.subtype = nextLine
                    cardData.confidence += 3
                }
            }
            
            // Look for ink cost and stats in nearby lines (within 3 lines)
            val searchRange = maxOf(0, nameIndex - 2)..minOf(allLines.size - 1, nameIndex + 3)
            for (j in searchRange) {
                val nearbyLine = allLines[j]
                
                // Check for ink cost
                if (cardData.inkCost == null && LORCANA_INK_COST_REGEX.matches(nearbyLine)) {
                    cardData.inkCost = nearbyLine
                    cardData.confidence += 1
                }
                
                // Check for stats
                if (cardData.stats == null && LORCANA_STATS_REGEX.matches(nearbyLine)) {
                    cardData.stats = nearbyLine
                    cardData.confidence += 2
                }
            }
            
            // Add as a candidate if we have at least a name and one other piece of information
            if (cardData.subtype != null || cardData.inkCost != null || cardData.stats != null) {
                candidates.add(Triple(cardData.name, cardData.subtype, true))
            }
        }
        
        // Fall back to looking for MTG cards if no Lorcana candidates were found
        if (candidates.isEmpty()) {
            for (line in allLines) {
                if (MTG_NAME_REGEX.matches(line) && !KEYWORD_FILTER.containsMatchIn(line)) {
                    candidates.add(Triple(line, null, false))
                }
            }
        }
        
        // Return the candidate with the highest computed score.
        return candidates.maxByOrNull { 
            val baseScore = computeNameScore(it.first)
            // Give Lorcana cards a slight boost if that's what we're looking for
            val lorcanaBoost = if (it.third) 2 else 0
            baseScore + lorcanaBoost
        }
    }

    /**
     * Emit the OCR result to React if it passes duplicate and movement checks.
     */
    private fun sendOcrResult(
        fullName: String,
        name: String,
        subtype: String?,
        isLorcana: Boolean,
        boundingBox: Rect?
    ) {
        val currentTime = System.currentTimeMillis()
        // Purge old scans
        recentScans.removeAll { currentTime - it.second > COOLDOWN_MS }

        if (recentScans.any { it.first.equals(fullName, ignoreCase = true) }) {
            Log.d(TAG, "Duplicate scan for: $fullName; ignoring.")
            return
        }

        // Check for sufficient movement if a previous bounding box exists.
        if (boundingBox != null && lastBoundingBox != null) {
            val dx = abs(boundingBox.centerX() - lastBoundingBox!!.centerX())
            val dy = abs(boundingBox.centerY() - lastBoundingBox!!.centerY())
            if (dx < MOVEMENT_THRESHOLD && dy < MOVEMENT_THRESHOLD) {
                Log.d(TAG, "Insufficient movement detected (dx=$dx, dy=$dy); ignoring scan.")
                return
            }
        }

        recentScans.add(Pair(fullName, currentTime))
        lastBoundingBox = boundingBox

        val params = Arguments.createMap().apply {
            putString("text", fullName)
            putString("mainName", name)
            putString("subtype", subtype)
            putBoolean("isLorcana", isLorcana)
        }
        Log.d(TAG, "Emitting OCR result: mainName=$name, subtype=$subtype, isLorcana=$isLorcana")
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LiveOcrResult", params)

        Log.d(TAG, "Card name detected: $fullName")
    }

    /**
     * Convert a YUV_420_888 image to a cropped Bitmap.
     *
     * This refactored version uses the YuvImage.compressToJpeg() method with a crop rectangle
     * so that only the area of interest (AOI) is converted, which can be much faster.
     */
    private fun cropImage(image: Image, left: Int, top: Int, width: Int, height: Int): Bitmap {
        // Convert YUV_420_888 to NV21 format.
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
        // Compress only the AOI directly.
        val cropRect = Rect(left, top, left + width, top + height)
        yuvImage.compressToJpeg(cropRect, 100, out)
        return BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
    }

    /**
     * Drain extra images from the ImageReader to prevent a backlog.
     */
    private fun drainExtraImages(reader: ImageReader) {
        try {
            // Only try to acquire latest image once, to avoid exceptions
            val extraImage = reader.acquireLatestImage()
            extraImage?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error draining images: ${e.message}")
            // Don't try to continue draining if we hit an exception
        }
    }

    @ReactMethod
    fun pauseProcessing(promise: Promise) {
        try {
            processingPaused = true
            Log.d(TAG, "Processing paused")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error pausing processing: ${e.message}")
            promise.reject("ERR_PAUSE_PROCESSING", e.message, e)
        }
    }

    @ReactMethod
    fun resumeProcessing(promise: Promise) {
        try {
            processingPaused = false
            Log.d(TAG, "Processing resumed")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error resuming processing: ${e.message}")
            promise.reject("ERR_RESUME_PROCESSING", e.message, e)
        }
    }

    @ReactMethod
    fun setLorcanaScanMode(enabled: Boolean, promise: Promise) {
        try {
            isLorcanaScanMode = enabled
            Log.d(TAG, "Lorcana scan mode set to: $enabled")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_MODE_ERROR", "Failed to set Lorcana scan mode", e)
        }
    }

    @ReactMethod
    fun getLorcanaScanMode(promise: Promise) {
        promise.resolve(isLorcanaScanMode)
    }

    @ReactMethod
    fun setZoomLevel(zoomLevel: Float, promise: Promise) {
        try {
            currentZoomLevel = when {
                zoomLevel < 0 -> 0.0f
                zoomLevel > MAX_ZOOM_LEVEL -> MAX_ZOOM_LEVEL
                else -> zoomLevel
            }
            
            applyZoom()
            promise.resolve(currentZoomLevel)
        } catch (e: Exception) {
            promise.reject("ZOOM_ERROR", "Failed to set zoom level", e)
        }
    }

    @ReactMethod
    fun increaseZoom(promise: Promise) {
        try {
            currentZoomLevel = minOf(currentZoomLevel + ZOOM_STEP, MAX_ZOOM_LEVEL)
            applyZoom()
            promise.resolve(currentZoomLevel)
        } catch (e: Exception) {
            promise.reject("ZOOM_ERROR", "Failed to increase zoom", e)
        }
    }

    @ReactMethod
    fun decreaseZoom(promise: Promise) {
        try {
            currentZoomLevel = maxOf(currentZoomLevel - ZOOM_STEP, 0.0f)
            applyZoom()
            promise.resolve(currentZoomLevel)
        } catch (e: Exception) {
            promise.reject("ZOOM_ERROR", "Failed to decrease zoom", e)
        }
    }

    @ReactMethod
    fun getZoomLevel(promise: Promise) {
        promise.resolve(currentZoomLevel)
    }

    @ReactMethod
    fun resetZoom(promise: Promise) {
        try {
            currentZoomLevel = 0.0f
            applyZoom()
            promise.resolve(currentZoomLevel)
        } catch (e: Exception) {
            promise.reject("ZOOM_ERROR", "Failed to reset zoom", e)
        }
    }

    private fun applyZoom() {
        try {
            val captureSession = this.captureSession ?: return
            val cameraDevice = this.cameraDevice ?: return
            
            val captureRequestBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            
            previewSurface?.let { captureRequestBuilder.addTarget(it) }
            imageReader?.surface?.let { captureRequestBuilder.addTarget(it) }
            
            // Set up basic preview settings
            captureRequestBuilder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
            captureRequestBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            
            // Apply zoom
            if (currentZoomLevel > 0.0f) {
                // A simplified approach to digital zoom
                val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
                val cameraId = cameraDevice.id
                val characteristics = manager.getCameraCharacteristics(cameraId)
                val maxZoom = characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1.0f
                
                // Calculate zoom ratio based on our zoom level
                val zoomRatio = 1.0f + currentZoomLevel * (maxZoom - 1.0f) / MAX_ZOOM_LEVEL
                
                if (zoomRatio > 1.0f) {
                    // Get the active array size
                    val activeRect = characteristics.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
                    if (activeRect != null) {
                        // Calculate the crop region
                        val xCenter = activeRect.width() / 2
                        val yCenter = activeRect.height() / 2
                        val halfWidth = (activeRect.width() / (2 * zoomRatio)).toInt()
                        val halfHeight = (activeRect.height() / (2 * zoomRatio)).toInt()
                        
                        val cropRegion = Rect(
                            xCenter - halfWidth,
                            yCenter - halfHeight,
                            xCenter + halfWidth,
                            yCenter + halfHeight
                        )
                        
                        captureRequestBuilder.set(CaptureRequest.SCALER_CROP_REGION, cropRegion)
                        Log.d(TAG, "Applied zoom: level=$currentZoomLevel, ratio=$zoomRatio")
                    }
                }
            }
            
            // Use the existing session to update the repeating request
            captureSession.setRepeatingRequest(captureRequestBuilder.build(), null, backgroundHandler)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error applying zoom", e)
        }
    }
}
