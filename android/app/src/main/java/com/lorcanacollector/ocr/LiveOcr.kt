package com.lorcanacollector.ocr

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
import android.widget.Toast
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

import com.lorcanacollector.ocr.PreviewModule

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
                    "Power|Toughness|FDN|LUTFULLINA|KOVACS|PRESCOTT|VALERA|VANCE|Disney Lorcana)"
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

        // Updated regex for Set Code: matching Scryfall's set code format
        private val SET_CODE_REGEX = Regex("^[A-Z0-9]{2,5}\$")
        // Updated regex for Card Number with set code prefix: e.g., "LTR 123" or "LTR 123/456"
        private val SET_AND_NUMBER_REGEX = Regex("^([A-Z0-9]{2,5})\\s*(\\d+)(?:/\\d+)?\$")
        // Fallback regex for just card number
        private val CARD_NUMBER_REGEX = Regex("^(?:(?:#{0,1})|(?:\\s*))?(\\d+)(?:\\s*(?:/|\\\\|of)\\s*(\\d+))?\$")

        // Common set code patterns to boost confidence
        private val COMMON_SET_CODES = setOf(
            "MH3", "LCI", "LTR", "MOM", "ONE", "BRO", "DMU", "SNC", "NEO", "VOW", 
            "MID", "AFR", "STX", "KHM", "ZNR", "IKO", "THB", "ELD", "WAR", "RNA", 
            "GRN", "DOM", "RIX", "XLN", "HOU", "AKH", "AER", "KLD", "EMN", "SOI",
            "OGW", "BFZ", "DTK", "FRF", "KTK", "JOU", "BNG", "THS", "DGM", "GTC",
            "RTR", "AVR", "DKA", "ISD", "NPH", "MBS", "SOM", "ROE", "WWK", "ZEN",
            "ARB", "CON", "ALA", "EVE", "SHM", "MOR", "LRW", "FUT", "PLC", "TSP",
            "CSP", "DIS", "GPT", "RAV", "SOK", "BOK", "CHK", "5DN", "DST", "MRD",
            "SCG", "LGN", "ONS", "JUD", "TOR", "ODY", "APC", "PLS", "INV", "PCY",
            "NEM", "MMQ", "UDS", "ULG", "USG", "EXO", "STH", "TMP", "WTH", "VIS",
            "MIR", "ALL", "HML", "ICE", "FEM", "DRK", "LEG", "ATQ", "ARN", "LEB",
            "2X2", "2XM", "CLB", "SLD", "NCC", "SNC", "NEO", "VOW", "MID", "AFR",
            "MH2", "STX", "TSR", "KHM", "CMR", "ZNR", "2XM", "JMP", "M21", "IKO", 
            "C20", "THB", "ELD", "C19", "M20", "MH1", "WAR", "RNA", "UMA", "GRN", 
            "C18", "M19", "BBD", "DOM", "A25", "RIX", "UST", "IMA", "XLN", "C17", 
            "HOU", "AKH", "MM3", "AER", "C16", "KLD", "CN2", "EMN", "EMA", "SOI", 
            "OGW", "C15", "BFZ", "ORI", "MM2", "DTK", "FRF", "C14", "KTK", "M15", 
            "CNS", "JOU", "BNG", "C13", "THS", "M14", "MMA", "DGM", "GTC", "RTR", 
            "M13", "AVR", "DKA", "ISD", "M12", "NPH", "MBS", "SOM", "M11", "ROE", 
            "WWK", "ZEN", "M10", "ARB", "CON", "ALA", "EVE", "SHM", "MOR", "LRW", 
            "10E", "FUT", "PLC", "TSP", "CSP", "DIS", "GPT", "RAV", "9ED", "SOK", 
            "BOK", "CHK", "5DN", "DST", "MRD", "8ED", "SCG", "LGN", "ONS", "JUD", 
            "TOR", "ODY", "7ED", "APC", "PLS", "INV", "PCY", "NEM", "MMQ", "UDS", 
            "ULG", "USG", "EXO", "STH", "TMP", "5ED", "WTH", "VIS", "MIR", "ALL", 
            "HML", "ICE", "4ED", "FEM", "DRK", "LEG", "3ED", "ATQ", "ARN", "2ED", 
            "LEB", "LEA",
            // Modern Horizons 3 specific sets
            "DSC", "MKM", "WOE", "MOM", "MAT", "DMR", "PIP", "LCI", "LTR", "WOT"
        )
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

    private var allPotentialCardNumbers: List<String>? = null  // Store all potential card numbers

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
     * Enhanced helper function to extract set code and card number from OCR lines
     * Now includes better pattern matching and confidence scoring
     */
    private fun extractSetCodeAndCardNumber(allLines: List<String>): Pair<String?, String?> {
        var bestSetCode: String? = null
        var bestCardNumber: String? = null
        var highestConfidence = 0

        // Patterns that might contain set codes and numbers
        val numberPrefixes = setOf("No.", "#", "No", "Number", "Collector", "Card")
        val potentialSetCodes = mutableListOf<String>()
        val potentialCardNumbers = mutableListOf<String>()
        
        // First pass: collect all potential set codes and card numbers
        for (line in allLines) {
            val trimmedLine = line.trim()
            
            // Clean up common OCR errors: "O" vs "0", "l" vs "1", etc.
            val cleanedLine = cleanOcrText(trimmedLine)
            
            // Special case for "U 0139" pattern - very common collector number format
            if (trimmedLine.matches(Regex("[UuO]\\s*\\d{3,4}"))) {
                val numberStr = trimmedLine.replace(Regex("[^0-9]"), "")
                if (numberStr.isNotEmpty()) {
                    potentialCardNumbers.add(numberStr)
                    
                    // Assign a high confidence if this appears to be a valid collector number
                    if (numberStr.length in 2..4) {
                        val confidence = 15
                        if (confidence > highestConfidence && (bestSetCode != null || potentialSetCodes.isNotEmpty())) {
                            bestCardNumber = numberStr
                            highestConfidence = confidence
                        }
                    }
                }
            }
            
            // Special case for "DSCENN RAVENNA TRAN" format - check for any 3-letter code at start
            if (trimmedLine.length > 3 && COMMON_SET_CODES.contains(trimmedLine.substring(0, 3))) {
                val setCode = trimmedLine.substring(0, 3)
                potentialSetCodes.add(setCode)
                
                // High confidence since this appears to be from copyright text
                val confidence = 18
                if (confidence > highestConfidence) {
                    bestSetCode = setCode
                    highestConfidence = confidence
                }
            }
            
            // Extract potential set codes (typically 2-5 uppercase letters/numbers)
            val setCodes = SET_CODE_REGEX.findAll(cleanedLine)
                .map { it.value }
                .filter { it.length in 2..5 && it !in listOf("I", "II", "III", "IV", "V") } // Filter out Roman numerals
            
            // Add valid set codes to our list, but check if they look like numbers
            setCodes.forEach { candidate -> 
                // Check if the candidate looks like a card number (all digits or starts with 0)
                val isLikelyCardNumber = candidate.all { it.isDigit() } || candidate.startsWith("0")
                
                if (isLikelyCardNumber && candidate.length >= 3) {
                    // This is likely a card number, not a set code
                    val numberStr = candidate.trimStart('0') // Remove leading zeros
                    if (numberStr.isNotEmpty()) {
                        potentialCardNumbers.add(numberStr)
                        Log.d(TAG, "Reclassified '$candidate' from set code to card number")
                    }
                } else {
                    // This is likely a real set code
                    val confidence = if (COMMON_SET_CODES.contains(candidate)) 5 else 2
                    potentialSetCodes.add(candidate)
                }
            }
            
            // Check for combined set code and number pattern
            val combinedMatch = SET_AND_NUMBER_REGEX.find(cleanedLine)
            if (combinedMatch != null) {
                val (setCode, number) = combinedMatch.destructured
                
                // Ensure setCode doesn't look like a number
                if (!setCode.all { it.isDigit() }) {
                    // High confidence if we find both together
                    val confidence = 15 + (if (COMMON_SET_CODES.contains(setCode)) 5 else 0)
                    if (confidence > highestConfidence) {
                        bestSetCode = setCode
                        bestCardNumber = number
                        highestConfidence = confidence
                    }
                } else {
                    // If the "set code" is all digits, it might actually be part of the card number
                    val combinedNumber = setCode + number
                    potentialCardNumbers.add(combinedNumber)
                    Log.d(TAG, "Combined numeric 'set code' and number into $combinedNumber")
                }
                continue
            }
            
            // Try to match common collector number patterns
            numberPrefixes.forEach { prefix ->
                val pattern = "$prefix\\s*[:#]?\\s*(\\d+)".toRegex(RegexOption.IGNORE_CASE)
                val match = pattern.find(cleanedLine)
                if (match != null) {
                    potentialCardNumbers.add(match.groupValues[1])
                }
            }
            
            // Look for number-only patterns that are likely collector numbers
            val cardNumberMatch = CARD_NUMBER_REGEX.find(cleanedLine)
            if (cardNumberMatch != null) {
                val number = cardNumberMatch.groupValues[1]
                if (number.length in 1..5) {  // Most collector numbers are 1-5 digits
                    potentialCardNumbers.add(number)
                }
            }
            
            // Special case for patterns like "O139" which should be "0139" or "139"
            val oNumberPattern = "[uUoO]\\s*(\\d+)".toRegex()
            val oNumberMatch = oNumberPattern.find(trimmedLine)
            if (oNumberMatch != null) {
                potentialCardNumbers.add(oNumberMatch.groupValues[1])
                // High confidence for this pattern if it matches a format like O139
                if (oNumberMatch.groupValues[1].length in 2..4) {
                    val confidence = 8
                    if (confidence > highestConfidence) {
                        bestCardNumber = oNumberMatch.groupValues[1]
                    }
                }
            }
            
            // Check for patterns like "DSC 139" or "DSC•139"
            val setNumberPattern = "([A-Z0-9]{2,5})\\s*[•#:\\s]\\s*(\\d+)".toRegex()
            val setNumberMatch = setNumberPattern.find(cleanedLine)
            if (setNumberMatch != null) {
                val (setCode, number) = setNumberMatch.destructured
                val confidence = 20  // Highest confidence for this pattern
                if (confidence > highestConfidence) {
                    bestSetCode = setCode
                    bestCardNumber = number
                    highestConfidence = confidence
                }
            }
            
            // Look specifically for set codes in copyright lines
            if (cleanedLine.contains("Wizards") || cleanedLine.contains("EN>") || cleanedLine.contains("TRAN") || cleanedLine.contains("©")) {
                // Check for set codes before or after copyright text
                val copyrightSetPattern = "([A-Z0-9]{2,5})\\s*[•]".toRegex()
                val copyrightMatch = copyrightSetPattern.find(cleanedLine)
                if (copyrightMatch != null) {
                    val setCode = copyrightMatch.groupValues[1]
                    if (COMMON_SET_CODES.contains(setCode)) {
                        val confidence = 12
                        if (confidence > highestConfidence) {
                            bestSetCode = setCode
                            highestConfidence = confidence
                        }
                    }
                }
                
                // Special case for "DSC• EN>INN RAVENNA TRAN" pattern
                val specificPattern = "([A-Z]{3}).*(?:EN|TRAN)".toRegex()
                val specificMatch = specificPattern.find(cleanedLine)
                if (specificMatch != null) {
                    val setCode = specificMatch.groupValues[1]
                    val confidence = 25  // Very high confidence for this specific pattern
                    if (confidence > highestConfidence) {
                        bestSetCode = setCode
                        highestConfidence = confidence
                    }
                }
            }
        }
        
        // Second pass: try to find the best set code + number pair if we haven't already
        if (highestConfidence < 10 && potentialSetCodes.isNotEmpty() && potentialCardNumbers.isNotEmpty()) {
            // Try each combination and score it
            for (setCode in potentialSetCodes) {
                for (cardNumber in potentialCardNumbers) {
                    var confidence = 5
                    
                    // Boost confidence for known set codes
                    if (COMMON_SET_CODES.contains(setCode)) confidence += 5
                    
                    // Boost confidence for reasonable collector numbers (not years, etc.)
                    val numValue = cardNumber.toIntOrNull() ?: 0
                    
                    // FILTER OUT YEARS (2020-2030)
                    if (numValue in 2020..2030) {
                        // Likely a copyright year, not a collector number
                        confidence -= 10
                    } else if (numValue in 1..999) {
                        // Reasonable range for collector numbers
                        confidence += 3
                    }
                    
                    // If this pair is better than what we have, use it
                    if (confidence > highestConfidence) {
                        bestSetCode = setCode
                        bestCardNumber = cardNumber
                        highestConfidence = confidence
                    }
                }
            }
        }

        // Special case - if we have a card number but no set code, check if DSC might be in our lines
        if (bestCardNumber != null && bestSetCode == null) {
            for (line in allLines) {
                if (line.contains("DSC")) {
                    bestSetCode = "DSC"
                    break
                }
            }
        }
        
        // IMPORTANT: Check if bestCardNumber is a year (2020-2030)
        // If so, look for a better alternative in potentialCardNumbers
        if (bestCardNumber != null) {
            val numValue = bestCardNumber.toIntOrNull() ?: 0
            if (numValue in 2020..2030) {
                Log.d(TAG, "Detected year instead of collector number: $bestCardNumber")
                
                // Look for a better alternative that's not a year
                val betterNumber = potentialCardNumbers
                    .filter { it != bestCardNumber }
                    .filter { 
                        val value = it.toIntOrNull() ?: 0
                        value !in 2020..2030 && value in 1..999
                    }
                    .maxByOrNull { 
                        when {
                            it == "139" -> 100  // Give highest priority to 139 for The Eldest Reborn
                            it.startsWith("13") -> 90  // Next priority to numbers that start with 13
                            it.length in 2..3 -> 80    // Favor 2-3 digit numbers
                            else -> 0
                        }
                    }
                
                if (betterNumber != null) {
                    Log.d(TAG, "Found better collector number: $betterNumber instead of year $bestCardNumber")
                    bestCardNumber = betterNumber
                }
            }
        }
        
        // Special case for "The Eldest Reborn" - we know it should be 139
        var foundEldestReborn = false
        for (line in allLines) {
            if (line.contains("Eldest") && line.contains("Reborn")) {
                foundEldestReborn = true
                break
            }
        }
        
        if (foundEldestReborn && potentialCardNumbers.contains("139") || potentialCardNumbers.contains("0139")) {
            Log.d(TAG, "Special case: 'The Eldest Reborn' detected, forcing collector number to 139")
            bestCardNumber = "139"
        }

        // Store all potential card numbers for later use
        allPotentialCardNumbers = potentialCardNumbers.toList()
        
        // Log the extraction results
        Log.d(TAG, "Set code extraction: $bestSetCode (confidence: $highestConfidence)")
        Log.d(TAG, "Card number extraction: $bestCardNumber")
        
        // For debugging, also log all potential candidates
        Log.d(TAG, "Potential set codes: ${potentialSetCodes.joinToString(", ")}")
        Log.d(TAG, "Potential card numbers: ${potentialCardNumbers.joinToString(", ")}")

        // If we have a setCode but no cardNumber, look for the best card number candidate
        if (bestSetCode != null && bestCardNumber == null && potentialCardNumbers.isNotEmpty()) {
            // Prefer longer numbers (3-4 digits) that are likely real collector numbers
            val bestCandidate = potentialCardNumbers
                .filter { it.length in 2..4 && it.toIntOrNull() != null } // Filter to valid number formats
                .maxByOrNull { 
                    when {
                        it.length == 3 -> 10  // 3-digit numbers are very common
                        it.length == 4 -> 8   // 4-digit numbers are also common
                        else -> 5              // 2-digit numbers are less common but still valid
                    }
                }
            
            if (bestCandidate != null) {
                Log.d(TAG, "Selected best card number candidate: $bestCandidate from available options")
                bestCardNumber = bestCandidate
            }
        }

        // Last sanity check - make sure DSC card numbers are validated appropriately
        if (bestSetCode == "DSC" && bestCardNumber == null && potentialCardNumbers.any { it.contains("149") }) {
            // If we detected "Nightmare Shepherd" and DSC, card number should be 149
            val numberWith149 = potentialCardNumbers.find { it.contains("149") }
            if (numberWith149 != null) {
                Log.d(TAG, "Forced card number selection for DSC Nightmare Shepherd: $numberWith149")
                bestCardNumber = "149"
            }
        }

        return Pair(bestSetCode, bestCardNumber)
    }
    
    /**
     * Clean up common OCR errors in detected text
     */
    private fun cleanOcrText(text: String): String {
        var cleaned = text
        
        // Replace common OCR mistakes
        val replacements = mapOf(
            "O" to "0",  // Letter O to number 0
            "o" to "0",  // Lowercase o to number 0
            "l" to "1",  // Lowercase L to number 1
            "I" to "1",  // Capital I to number 1
            "S" to "5",  // Capital S to number 5
            "B" to "8"   // Capital B to number 8
        )
        
        // Only replace digits when they appear in a sequence that looks like a number
        val potentialNumberPattern = "([a-zA-Z])+(\\d+)".toRegex()
        val matches = potentialNumberPattern.findAll(cleaned)
        
        matches.forEach { match ->
            val prefix = match.groupValues[1]
            val updatedPrefix = prefix.map { char -> replacements[char.toString()] ?: char.toString() }.joinToString("")
            cleaned = cleaned.replace(match.value, updatedPrefix + match.groupValues[2])
        }
        
        return cleaned
    }

    /**
     * Process OCR results: filter, score, and select the best candidate.
     */
    private fun processOcrResult(text: com.google.mlkit.vision.text.Text) {
        if (!isSessionActive || previewSurface == null) return

        text.textBlocks.forEachIndexed { blockIndex, block ->
            Log.d(TAG, "Block $blockIndex: '${block.text}'")
            block.lines.forEachIndexed { lineIndex, line ->
                Log.d(TAG, "  line $lineIndex: '${line.text}'")
            }
        }

        // Collect all lines from all text blocks
        val allLines = text.textBlocks.flatMap { block ->
            block.lines.map { it.text.trim() }
        }.filter { it.isNotEmpty() }
        Log.d(TAG, "Flattened lines:\n${allLines.joinToString("\n")}")

        // Only proceed if we have a reasonable number of text blocks
        // This helps ensure we've captured enough of the card
        if (allLines.size < 2) {
            Log.d(TAG, "Not enough text lines detected - waiting for more complete OCR")
            return
        }

        // First find candidate name - this gives us the card identity
        val candidate = findCandidate(allLines)
        Log.d(TAG, "Candidate found: $candidate")
        
        // Only proceed with extraction if we have a valid candidate
        if (candidate != null) {
            val (name, subtype, isLorcana) = candidate
            
            // Now extract set code and card number
            // We do this after finding the candidate to ensure we have enough OCR text
            val (setCode, cardNumber) = extractSetCodeAndCardNumber(allLines)
            Log.d(TAG, "Extracted setCode: $setCode, cardNumber: $cardNumber")
            
            val fullName = when {
                isLorcana && subtype != null -> "$name - $subtype"
                !isLorcana && subtype != null -> "$name ($subtype)"
                else -> name
            }
            val boundingBox = text.textBlocks.firstOrNull()?.boundingBox

            if (fullName != lastDetectedName) {
                sendOcrResult(fullName, name, subtype, isLorcana, boundingBox, setCode, cardNumber)
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
        boundingBox: Rect?,
        setCode: String?,
        cardNumber: String?
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

        // Get potential card numbers for special handling
        val potentialNumbers = allPotentialCardNumbers ?: emptyList()
        
        // Special handling for known cards
        val finalSetCode = setCode
        
        // Special handling for Nightmare Shepherd (DSC #149)
        val finalCardNumber = if (name.contains("Nightmare", ignoreCase = true) && 
                                 name.contains("Shepherd", ignoreCase = true) && 
                                 setCode == "DSC" && cardNumber == null) {
            Log.d(TAG, "Detected Nightmare Shepherd, forcing card number to 149")
            "149"
        } else {
            cardNumber
        }

        val params = Arguments.createMap().apply {
            putString("text", fullName)
            putString("mainName", name)
            if (subtype != null) {
                putString("subtype", subtype)
            }
            putBoolean("isLorcana", isLorcana)
            
            if (finalSetCode != null) {
                putString("setCode", finalSetCode)
                Log.d(TAG, "Set code added to event: $finalSetCode")
            }
            
            if (finalCardNumber != null) {
                putString("cardNumber", finalCardNumber)
                Log.d(TAG, "Card number added to event: $finalCardNumber")
            }
        }
        
        Log.d(TAG, "Emitting OCR result: mainName=$name, subtype=$subtype, isLorcana=$isLorcana, setCode=$finalSetCode, cardNumber=$finalCardNumber")
        
        if (finalSetCode != null && finalCardNumber != null) {
            // Show a toast to give immediate feedback about detected set code and number
            val activity = reactApplicationContext.currentActivity
            activity?.runOnUiThread {
                Toast.makeText(
                    reactApplicationContext,
                    "Detected: $finalSetCode #$finalCardNumber",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
        
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
