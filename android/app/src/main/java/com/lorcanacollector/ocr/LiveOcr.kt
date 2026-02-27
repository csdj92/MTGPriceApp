package com.lorcanacollector.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.YuvImage
import android.media.Image
import android.util.Log
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
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
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

import com.lorcanacollector.ocr.PreviewModule

@ReactModule(name = LiveOcr.NAME)
class LiveOcr(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), PreviewModule {

    companion object {
        private const val TAG = "LiveOcr"
        const val NAME = "LiveOcr"
        private const val PREVIEW_READY_RETRY_DELAY_MS = 40L
        private const val MAX_PREVIEW_READY_RETRIES = 25

        // Limits and AOI configuration
        private const val COOLDOWN_MS = 2000L         // 2 seconds cooldown between scans
        private const val AOI_LEFT_PERCENT = 0.1f     // Crop 10% from the left
        private const val AOI_TOP_PERCENT = 0.2f      // Crop 20% from the top
        private const val AOI_WIDTH_PERCENT = 0.8f    // Crop 80% of width
        private const val AOI_HEIGHT_PERCENT = 0.5f   // Crop 50% of height
        private const val FRAME_EVENT_INTERVAL_MS = 125L // ~8fps
        private const val CARD_ASPECT_RATIO = 0.715f
        private const val SEARCH_CONFIDENCE_THRESHOLD = 0.3f
        private const val LOCK_CONFIDENCE_THRESHOLD = 0.65f
        private const val LOCK_STABLE_FRAMES = 3
        private const val MIN_LINES_FOR_LOCK = 3
        private const val MIN_CANDIDATE_LINES_FOR_LOCK = 2

        // ML Kit confidence thresholds
        private const val MIN_LINE_CONFIDENCE = 0.40f
        private const val MIN_SYMBOL_CONFIDENCE = 0.65f

        // Pre-compile regexes to avoid repeated compilation.
        private val KEYWORD_FILTER = Regex(
            "(?i)(Hero|Villain|Action|Character|Item|Song|Dreamborn|Floodborn|Storyborn|" +
                "Shift|Exert|Evasive|Illustrated|Collector|Number|Disney Lorcana|\\u2122|\\u00A9)"
        )
        private val LORCANA_NAME_REGEX = Regex("^[A-Z][A-Z\\s',\\-]+\$")
        private val LORCANA_VERSION_REGEX = Regex("^[A-Za-z][A-Za-z\\s\\-',()]+\$")
        private val LORCANA_STATS_REGEX = Regex("^(\\d+)\\s*[⬥⭒]\\s*[|]\\s*(\\d+)\\s*[⬥⭒]\$")
        private val LORCANA_INK_COST_REGEX = Regex("^(\\d+)\\s*[⬥⭒]\$")
        private val LORCANA_COLLECTOR_REGEX =
            Regex("^\\s*([0-9OILSZB]{1,3})\\s*[/|\\\\]\\s*([0-9OILSZB]{2,3})(?:\\s*[-•·|]?\\s*[A-Z]{2})?(?:[\\s\\-•·|.]+([1-9]\\d?))?\\s*\$")
        private val LORCANA_COLLECTOR_LOOSE_REGEX =
            Regex("([0-9OILSZB]{1,3})\\s*[/|\\\\]\\s*([0-9OILSZB]{2,3})(?:\\s*[-•·|]?\\s*[A-Z]{2})?(?:[\\s\\-•·|.]+([1-9]\\d?))?")
        private val LORCANA_SET_SUFFIX_REGEX =
            Regex("(?i)(?:\\b[A-Z]{2}\\b\\s*[-•·|.]?\\s*)([1-9]\\d?)\\s*\$")
        private val LORCANA_TOTAL_AND_SET_REGEX =
            Regex("(?i)(?:^|\\D)([0-9OILSZB]{2,3})\\s*[-•·|.]\\s*[A-Z]{2}\\s*([1-9]\\d?)\\s*\$")
    }

    // CameraX properties
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var previewView: PreviewView? = null
    private var previewSizeReported = false

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
    private val MOVEMENT_THRESHOLD = 50

    private var currentPreviewWidth: Int? = null
    private var currentPreviewHeight: Int? = null

    private var processingPaused = false
    private var isLorcanaScanMode = false

    private var currentZoomLevel = 0.0f
    private val MAX_ZOOM_LEVEL = 5.0f
    private val ZOOM_STEP = 0.5f

    private var smoothedCardRect: RectF? = null
    private var stableTrackingFrames = 0
    private var lastFrameEventTimestamp = 0L
    private var cachedSensorOrientation: Int = 0

    private data class CardTrackingFrame(
        val rect: RectF?,
        val confidence: Float,
        val state: String
    )

    override fun getName() = NAME

    override fun initialize() {
        super.initialize()
    }

    override fun onCatalystInstanceDestroy() {
        stopCamera()
        textRecognizer.close()
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun startOcrSession(promise: Promise) {
        try {
            if (!isSessionActive) {
                isSessionActive = true
                if (previewView != null) {
                    startCamera()
                }
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
            stopCamera()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("OCR_ERROR", "Failed to stop OCR session", e)
        }
    }

    override fun setPreviewView(view: PreviewView?) {
        previewView = view
        if (view != null && isSessionActive) {
            startCamera()
        } else {
            stopCamera()
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

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter compatibility in React Native.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter compatibility in React Native.
    }

    private fun startCamera() {
        val pv = previewView ?: run {
            Log.e(TAG, "No PreviewView available")
            return
        }

        // Post to UI queue and retry until the preview is attached/measured to avoid black preview race.
        pv.post { startCameraWhenPreviewReady(0) }
    }

    private fun startCameraWhenPreviewReady(attempt: Int) {
        if (!isSessionActive) {
            Log.d(TAG, "startCameraWhenPreviewReady: session not active, aborting")
            return
        }

        val pvNow = previewView ?: run {
            Log.e(TAG, "startCameraWhenPreviewReady: previewView is null")
            return
        }

        val attached = pvNow.isAttachedToWindow
        val w = pvNow.width
        val h = pvNow.height
        val windowVis = pvNow.windowVisibility
        val viewVis = pvNow.visibility

        // Also check whether the inner SurfaceView has a valid surface
        val sv = findSurfaceViewIn(pvNow)
        val svAttached = sv?.isAttachedToWindow
        val svVis = sv?.visibility
        val svW = sv?.width
        val svH = sv?.height
        val svSurfaceValid = sv?.let { try { it.holder.surface.isValid } catch (e: Exception) { false } }

        Log.d(TAG, "startCameraWhenPreviewReady attempt=${attempt + 1}/$MAX_PREVIEW_READY_RETRIES: " +
                "pv attached=$attached vis=${visName(viewVis)} windowVis=${visName(windowVis)} size=${w}x${h} | " +
                "sv attached=$svAttached vis=${svVis?.let { visName(it) }} size=${svW}x${svH} surfaceValid=$svSurfaceValid")

        val isReady = attached && w > 0 && h > 0
        if (!isReady) {
            if (attempt >= MAX_PREVIEW_READY_RETRIES) {
                Log.e(TAG, "PreviewView never became ready after $MAX_PREVIEW_READY_RETRIES attempts")
                return
            }
            pvNow.postDelayed({ startCameraWhenPreviewReady(attempt + 1) }, PREVIEW_READY_RETRY_DELAY_MS)
            return
        }

        Log.d(TAG, "PreviewView is ready — binding camera")

        val lifecycleOwner = reactApplicationContext.currentActivity as? LifecycleOwner ?: run {
            Log.e(TAG, "No current activity for camera binding")
            return
        }

        val cameraProviderFuture = ProcessCameraProvider.getInstance(reactApplicationContext)
        cameraProviderFuture.addListener(Runnable {
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider

                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                val preview = Preview.Builder().build()

                val imageAnalysis = ImageAnalysis.Builder()
                    .setTargetResolution(Size(1920, 1920))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                imageAnalysis.setAnalyzer(executor) { imageProxy ->
                    analyzeFrame(imageProxy)
                }

                // Surface provider set BEFORE bindToLifecycle (required by CameraX contract).
                Log.d(TAG, "setSurfaceProvider: sv surfaceValid=${sv?.let { try { it.holder.surface.isValid } catch (e: Exception) { false } }}")
                preview.setSurfaceProvider(pvNow.surfaceProvider)
                provider.unbindAll()
                camera = provider.bindToLifecycle(
                    lifecycleOwner,
                    cameraSelector,
                    preview,
                    imageAnalysis
                )
                previewSizeReported = false
                Log.d(TAG, "CameraX bound successfully; preview=${pvNow.width}x${pvNow.height}")

            } catch (e: Exception) {
                Log.e(TAG, "Error starting camera", e)
            }
        }, ContextCompat.getMainExecutor(reactApplicationContext))
    }

    private fun findSurfaceViewIn(group: android.view.ViewGroup): android.view.SurfaceView? {
        for (i in 0 until group.childCount) {
            val child = group.getChildAt(i)
            if (child is android.view.SurfaceView) return child
            if (child is android.view.ViewGroup) findSurfaceViewIn(child)?.let { return it }
        }
        return null
    }

    private fun visName(v: Int) = when (v) {
        android.view.View.VISIBLE -> "VISIBLE"
        android.view.View.INVISIBLE -> "INVISIBLE"
        android.view.View.GONE -> "GONE"
        else -> "UNKNOWN($v)"
    }

    private fun stopCamera() {
        reactApplicationContext.currentActivity?.runOnUiThread {
            try {
                cameraProvider?.unbindAll()
            } catch (e: Exception) {
                Log.e(TAG, "Error unbinding camera", e)
            }
            camera = null
            processingImage = false
            previewSizeReported = false
        }
    }

    @OptIn(ExperimentalGetImage::class)
    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (!isSessionActive || processingPaused) {
            imageProxy.close()
            return
        }
        if (processingImage) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val rotation = imageProxy.imageInfo.rotationDegrees
        cachedSensorOrientation = rotation

        val width = imageProxy.width
        val height = imageProxy.height

        if (!previewSizeReported) {
            previewSizeReported = true
            sendPreviewSizeToReact(width, height)
        }

        processingImage = true

        try {
            val aoiSettings = if (isLorcanaScanMode) {
                // Wider/taller AOI improves portrait-card coverage so the bottom collector line
                // stays in frame when users hold the phone naturally.
                listOf(0.08f, 0.08f, 0.84f, 0.80f)
            } else {
                listOf(AOI_LEFT_PERCENT, AOI_TOP_PERCENT, AOI_WIDTH_PERCENT, AOI_HEIGHT_PERCENT)
            }

            val left = (width * aoiSettings[0]).toInt()
            val top = (height * aoiSettings[1]).toInt()
            val cropWidth = (width * aoiSettings[2]).toInt()
            val cropHeight = (height * aoiSettings[3]).toInt()
            val aoiRect = Rect(left, top, left + cropWidth, top + cropHeight)

            val croppedBitmap = cropImage(mediaImage, left, top, cropWidth, cropHeight)
            val inputImage = InputImage.fromBitmap(croppedBitmap, rotation)

            textRecognizer.process(inputImage)
                .addOnSuccessListener(executor) { text ->
                    val primaryDetected = processOcrResult(text, width, height, aoiRect)
                    val shouldTryRotatedFallback =
                        !primaryDetected &&
                            isLorcanaScanMode

                    if (shouldTryRotatedFallback) {
                        runRotatedFallbackOcr(croppedBitmap, imageProxy)
                    } else {
                        completeFrameProcessing(imageProxy, croppedBitmap)
                    }
                }
                .addOnFailureListener(executor) { e ->
                    Log.e(TAG, "OCR failed", e)
                    completeFrameProcessing(imageProxy, croppedBitmap)
                }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing image", e)
            imageProxy.close()
            processingImage = false
        }
    }

    private fun completeFrameProcessing(imageProxy: ImageProxy, bitmap: Bitmap? = null) {
        try {
            bitmap?.recycle()
        } catch (_: Exception) {
        }
        imageProxy.close()
        processingImage = false
    }

    private fun runRotatedFallbackOcr(baseBitmap: Bitmap, imageProxy: ImageProxy) {
        val fallbackAngles = intArrayOf(90, 270)

        fun runAttempt(index: Int) {
            if (index >= fallbackAngles.size) {
                completeFrameProcessing(imageProxy, baseBitmap)
                return
            }

            val rotatedBitmap = rotateBitmap(baseBitmap, fallbackAngles[index].toFloat())
            val rotatedImage = InputImage.fromBitmap(rotatedBitmap, 0)
            val rotatedAoi = Rect(0, 0, rotatedBitmap.width, rotatedBitmap.height)

            textRecognizer.process(rotatedImage)
                .addOnSuccessListener(executor) { rotatedText ->
                    val detected = processOcrResult(
                        rotatedText,
                        rotatedBitmap.width,
                        rotatedBitmap.height,
                        rotatedAoi
                    )
                    rotatedBitmap.recycle()
                    if (detected) {
                        completeFrameProcessing(imageProxy, baseBitmap)
                    } else {
                        runAttempt(index + 1)
                    }
                }
                .addOnFailureListener(executor) { fallbackError ->
                    Log.d(TAG, "Fallback OCR attempt ${index + 1} failed", fallbackError)
                    rotatedBitmap.recycle()
                    runAttempt(index + 1)
                }
        }

        runAttempt(0)
    }

    private fun rotateBitmap(source: Bitmap, angle: Float): Bitmap {
        val matrix = Matrix().apply { postRotate(angle) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }

    /**
     * Compute a score for a candidate name by rewarding typical card title features.
     */
    private fun computeNameScore(name: String): Int {
        var score = 0
        val words = name.split(" ")

        val isProperTitleCase = words.all { word ->
            if (word.isEmpty()) false
            else {
                val first = word.first()
                first.isUpperCase() && word.drop(1).all { c ->
                    c.isLowerCase() || c in listOf('-', '\'', ',')
                }
            }
        }

        if (isProperTitleCase) score += 6
        if (name == name.uppercase() && name.length >= 3) score += 4
        if (name == name.lowercase()) score -= 2
        if (words.size >= 2) score += 2
        if (name.length in 3..25) score += 2
        if (name.length < 3 || name.length > 40) score -= 3
        if (name.contains("'")) score += 1
        if (name.contains("-")) score += 1

        val punctCount = name.count { it in ",.!?;:()[]{}\"" }
        if (punctCount > 2) score -= punctCount

        if (name.any { it.isDigit() }) score -= 2
        if (name.contains("THE ", ignoreCase = true)) score += 1
        if (name.contains("OF ", ignoreCase = true)) score += 1

        val knownPrefixes = listOf("MICKEY", "MINNIE", "DONALD", "GOOFY", "STITCH", "ARIEL", "BELLE", "MULAN", "SIMBA")
        if (knownPrefixes.any { name.uppercase().startsWith(it) }) score += 3

        return score
    }

    private fun normalizeCollectorLine(line: String): String {
        return line
            .uppercase()
            .replace('—', '-')
            .replace('–', '-')
            .replace('•', '-')
            .replace('·', '-')
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun parseOcrDigits(value: String): Int? {
        if (value.isBlank()) return null

        val normalized = buildString(value.length) {
            value.uppercase().forEach { ch ->
                append(
                    when (ch) {
                        'O', 'Q', 'D' -> '0'
                        'I', 'L', '!' -> '1'
                        'Z' -> '2'
                        'S' -> '5'
                        'B' -> '8'
                        else -> ch
                    }
                )
            }
        }.filter { it.isDigit() }

        if (normalized.isEmpty()) return null
        return normalized.toIntOrNull()
    }

    /**
     * Extract Lorcana collector number when present.
     */
    private fun extractSetCodeAndCardNumber(
        allLines: List<String>,
        fallbackLines: List<String> = emptyList()
    ): Triple<String?, String?, Int?> {
        var cardNumber: String? = null
        var setNumber: Int? = null

        val collectorLines = linkedSetOf<String>()
        (allLines + fallbackLines).forEach { line ->
            val normalized = normalizeCollectorLine(line)
            if (normalized.isNotEmpty()) {
                collectorLines.add(normalized)
            }
        }

        for (line in collectorLines) {
            if (cardNumber == null || setNumber == null) {
                val collectorMatch = LORCANA_COLLECTOR_REGEX.find(line)
                    ?: LORCANA_COLLECTOR_LOOSE_REGEX.find(line)
                if (collectorMatch != null) {
                    if (cardNumber == null) {
                        val parsedCardNumber = parseOcrDigits(collectorMatch.groupValues.getOrElse(1) { "" })
                        if (parsedCardNumber != null && parsedCardNumber in 1..999) {
                            cardNumber = parsedCardNumber.toString()
                        }
                    }

                    if (setNumber == null) {
                        val parsedSetNumber = collectorMatch.groupValues.getOrNull(3)?.toIntOrNull()
                        if (parsedSetNumber != null && parsedSetNumber > 0) {
                            setNumber = parsedSetNumber
                        }
                    }
                }
            }

            if (setNumber == null) {
                val suffixSet = LORCANA_SET_SUFFIX_REGEX
                    .find(line)
                    ?.groupValues
                    ?.getOrNull(1)
                    ?.toIntOrNull()
                if (suffixSet != null && suffixSet > 0) {
                    setNumber = suffixSet
                }
            }

            if (setNumber == null) {
                val totalSetMatch = LORCANA_TOTAL_AND_SET_REGEX.find(line)
                val extractedSetNumber = totalSetMatch?.groupValues?.getOrNull(2)?.toIntOrNull()
                if (extractedSetNumber != null && extractedSetNumber > 0) {
                    setNumber = extractedSetNumber
                }
            }

            if (cardNumber != null && setNumber != null) {
                break
            }
        }

        val setCode = setNumber?.toString()

        if (cardNumber != null || setNumber != null) {
            Log.d(TAG, "Collector extracted: card=$cardNumber, setNumber=$setNumber")
        }

        return Triple(setCode, cardNumber, setNumber)
    }

    /**
     * Process OCR results: filter, score, and select the best candidate.
     */
    private fun processOcrResult(
        text: com.google.mlkit.vision.text.Text,
        frameWidth: Int,
        frameHeight: Int,
        aoiRect: Rect
    ): Boolean {
        if (!isSessionActive) return false

        text.textBlocks.forEachIndexed { blockIndex, block ->
            Log.d(TAG, "Block $blockIndex: '${block.text}'")
            block.lines.forEachIndexed { lineIndex, line ->
                Log.d(TAG, "  line $lineIndex: '${line.text}'")
            }
        }

        val rawLines = text.textBlocks.flatMap { block ->
            block.lines.map { it.text.trim() }
        }.filter { it.isNotEmpty() }

        val allLines = text.textBlocks.flatMap { block ->
            block.lines
                .filter { line -> (line.confidence ?: 1f) >= MIN_LINE_CONFIDENCE }
                .map { it.text.trim() }
        }.filter { it.isNotEmpty() }
        Log.d(TAG, "Flattened lines:\n${allLines.joinToString("\n")}")

        val tracking = buildCardTrackingFrame(text, allLines.size, frameWidth, frameHeight, aoiRect)
        emitFrameTelemetry(frameWidth, frameHeight, aoiRect, tracking)

        if (allLines.size < 2) {
            Log.d(TAG, "Not enough text lines detected - waiting for more complete OCR")
            return false
        }

        val candidate = findCandidate(allLines, text)
        Log.d(TAG, "Candidate found: $candidate")

        if (candidate != null) {
            val (name, subtype, isLorcana) = candidate

            val (setCode, cardNumber, setNumber) = extractSetCodeAndCardNumber(allLines, rawLines)
            Log.d(TAG, "Extracted setCode: $setCode, cardNumber: $cardNumber, setNumber: $setNumber")

            val fullName = if (subtype != null) "$name - $subtype" else name
            val boundingBox = text.textBlocks.firstOrNull()?.boundingBox

            if (fullName != lastDetectedName) {
                sendOcrResult(fullName, name, subtype, isLorcana, boundingBox, setCode, cardNumber, setNumber)
                lastDetectedName = fullName
            }
            return true
        }

        return false
    }

    private fun buildCardTrackingFrame(
        text: com.google.mlkit.vision.text.Text,
        detectedLineCount: Int,
        frameWidth: Int,
        frameHeight: Int,
        aoiRect: Rect
    ): CardTrackingFrame {
        val candidateLineBoxes = mutableListOf<Rect>()

        text.textBlocks.forEach { block ->
            block.lines.forEach { line ->
                val lineText = line.text.trim()
                val box = line.boundingBox ?: return@forEach
                val isCandidate = (
                    LORCANA_NAME_REGEX.matches(lineText) ||
                        LORCANA_VERSION_REGEX.matches(lineText) ||
                        LORCANA_STATS_REGEX.matches(lineText) ||
                        LORCANA_INK_COST_REGEX.matches(lineText) ||
                        (!KEYWORD_FILTER.containsMatchIn(lineText) && lineText.length in 3..36)
                    )
                if (isCandidate) {
                    candidateLineBoxes.add(Rect(
                        box.left  + aoiRect.left,
                        box.top   + aoiRect.top,
                        box.right + aoiRect.left,
                        box.bottom + aoiRect.top
                    ))
                }
            }
        }

        val sourceBoxes = if (candidateLineBoxes.isNotEmpty()) {
            candidateLineBoxes
        } else {
            text.textBlocks.mapNotNull { block ->
                block.boundingBox?.let { box ->
                    Rect(
                        box.left  + aoiRect.left,
                        box.top   + aoiRect.top,
                        box.right + aoiRect.left,
                        box.bottom + aoiRect.top
                    )
                }
            }
        }

        if (sourceBoxes.isEmpty()) {
            smoothedCardRect = null
            stableTrackingFrames = 0
            return CardTrackingFrame(rect = null, confidence = 0f, state = "none")
        }

        val union = unionRects(sourceBoxes)
        val centerX = union.centerX().toFloat()
        val centerY = union.centerY().toFloat()

        // For 90°/270° sensors the card appears landscape in the sensor frame, so the sensor-space
        // aspect ratio (width/height) is the reciprocal of the display-space portrait ratio.
        val sensorCardAspect = if (cachedSensorOrientation == 90 || cachedSensorOrientation == 270) {
            1f / CARD_ASPECT_RATIO
        } else {
            CARD_ASPECT_RATIO
        }

        val expandedWidth = union.width() * 1.4f
        var expandedHeight = union.height() * 2.2f
        val minHeightForAspect = expandedWidth / sensorCardAspect
        if (expandedHeight < minHeightForAspect) {
            expandedHeight = minHeightForAspect
        }

        var targetWidth = expandedHeight * sensorCardAspect
        targetWidth = targetWidth.coerceIn(aoiRect.width() * 0.45f, min(frameWidth * 0.96f, aoiRect.width() * 1.05f))
        var targetHeight = targetWidth / sensorCardAspect
        targetHeight = targetHeight.coerceIn(aoiRect.height() * 0.6f, frameHeight * 0.96f)

        var candidateRect = RectF(
            centerX - (targetWidth / 2f),
            centerY - (targetHeight / 2f),
            centerX + (targetWidth / 2f),
            centerY + (targetHeight / 2f)
        )
        candidateRect = clampRectToBounds(candidateRect, frameWidth.toFloat(), frameHeight.toFloat())

        val previous = smoothedCardRect
        val lineScore = min(1f, detectedLineCount / 8f)
        val areaRatio = ((candidateRect.width() * candidateRect.height()) / (frameWidth.toFloat() * frameHeight.toFloat())).coerceIn(0f, 1f)
        val areaScore = when {
            areaRatio < 0.08f -> areaRatio / 0.08f
            areaRatio > 0.90f -> max(0f, 1f - ((areaRatio - 0.90f) / 0.20f))
            else -> 1f
        }
        val aspectRatio = candidateRect.width() / max(1f, candidateRect.height())
        val aspectScore = (1f - min(1f, abs(aspectRatio - sensorCardAspect) / 0.35f)).coerceIn(0f, 1f)
        val stabilityScore = if (previous == null) {
            0.6f
        } else {
            val dx = abs(candidateRect.centerX() - previous.centerX()) / frameWidth.toFloat()
            val dy = abs(candidateRect.centerY() - previous.centerY()) / frameHeight.toFloat()
            val dw = abs(candidateRect.width() - previous.width()) / frameWidth.toFloat()
            val dh = abs(candidateRect.height() - previous.height()) / frameHeight.toFloat()
            (1f - (dx + dy + dw + dh)).coerceIn(0f, 1f)
        }

        val confidence = clampFloat(
            (lineScore * 0.35f) + (aspectScore * 0.30f) + (areaScore * 0.20f) + (stabilityScore * 0.15f),
            0f,
            1f
        )

        val alpha = if (confidence >= LOCK_CONFIDENCE_THRESHOLD) 0.35f else 0.20f
        val smoothed = if (previous == null) {
            RectF(candidateRect)
        } else {
            RectF(
                previous.left + (candidateRect.left - previous.left) * alpha,
                previous.top + (candidateRect.top - previous.top) * alpha,
                previous.right + (candidateRect.right - previous.right) * alpha,
                previous.bottom + (candidateRect.bottom - previous.bottom) * alpha
            )
        }
        smoothedCardRect = clampRectToBounds(smoothed, frameWidth.toFloat(), frameHeight.toFloat())

        val hasStrongLockEvidence =
            detectedLineCount >= MIN_LINES_FOR_LOCK &&
                candidateLineBoxes.size >= MIN_CANDIDATE_LINES_FOR_LOCK

        if (confidence >= LOCK_CONFIDENCE_THRESHOLD && hasStrongLockEvidence) {
            stableTrackingFrames = min(stableTrackingFrames + 1, LOCK_STABLE_FRAMES + 5)
        } else {
            stableTrackingFrames = max(0, stableTrackingFrames - 1)
        }

        val state = when {
            confidence < SEARCH_CONFIDENCE_THRESHOLD -> "none"
            !hasStrongLockEvidence -> "searching"
            stableTrackingFrames >= LOCK_STABLE_FRAMES -> "locked"
            else -> "searching"
        }

        return if (state == "none") {
            CardTrackingFrame(rect = null, confidence = confidence, state = state)
        } else {
            CardTrackingFrame(rect = smoothedCardRect?.let { RectF(it) }, confidence = confidence, state = state)
        }
    }

    private fun emitFrameTelemetry(
        frameWidth: Int,
        frameHeight: Int,
        aoiRect: Rect,
        tracking: CardTrackingFrame
    ) {
        val now = System.currentTimeMillis()
        if (now - lastFrameEventTimestamp < FRAME_EVENT_INTERVAL_MS) return
        lastFrameEventTimestamp = now

        val params = Arguments.createMap().apply {
            putInt("frameWidth", frameWidth)
            putInt("frameHeight", frameHeight)
            putMap("aoi", normalizedRectMap(RectF(aoiRect), frameWidth, frameHeight))
            if (tracking.rect != null) {
                putMap("candidateBox", normalizedRectMap(tracking.rect, frameWidth, frameHeight))
            } else {
                putNull("candidateBox")
            }
            putDouble("confidence", tracking.confidence.toDouble())
            putString("state", tracking.state)
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LiveOcrFrame", params)
    }

    private fun normalizedRectMap(rect: RectF, frameWidth: Int, frameHeight: Int): WritableMap {
        val fw = max(1f, frameWidth.toFloat())
        val fh = max(1f, frameHeight.toFloat())

        val x: Float
        val y: Float
        val w: Float
        val h: Float

        // ML Kit bounding boxes are in the raw sensor frame's coordinate space.
        // Apply the inverse of the sensor rotation to map them to display (portrait) space.
        when (cachedSensorOrientation) {
            90 -> {
                // Sensor is 90° CW from portrait. 90° CW rotation: new point = (H-1-py, px).
                // For a rect (L,T,R,B) in sensor space -> display rect:
                //   display_x = 1 - B/fh,  display_y = L/fw
                //   display_w = (B-T)/fh,   display_h = (R-L)/fw
                x = clampFloat(1f - rect.bottom / fh, 0f, 1f)
                y = clampFloat(rect.left / fw, 0f, 1f)
                w = clampFloat(rect.height() / fh, 0f, 1f)
                h = clampFloat(rect.width() / fw, 0f, 1f)
            }
            270 -> {
                // Sensor is 270° CW (= 90° CCW) from portrait.
                x = clampFloat(rect.top / fh, 0f, 1f)
                y = clampFloat(1f - rect.right / fw, 0f, 1f)
                w = clampFloat(rect.height() / fh, 0f, 1f)
                h = clampFloat(rect.width() / fw, 0f, 1f)
            }
            else -> {
                // 0° or 180° — no axis swap needed.
                x = clampFloat(rect.left / fw, 0f, 1f)
                y = clampFloat(rect.top / fh, 0f, 1f)
                w = clampFloat(rect.width() / fw, 0f, 1f)
                h = clampFloat(rect.height() / fh, 0f, 1f)
            }
        }

        return Arguments.createMap().apply {
            putDouble("x", x.toDouble())
            putDouble("y", y.toDouble())
            putDouble("w", w.toDouble())
            putDouble("h", h.toDouble())
        }
    }

    private fun unionRects(rects: List<Rect>): Rect {
        val union = Rect(rects.first())
        for (i in 1 until rects.size) {
            union.union(rects[i])
        }
        return union
    }

    private fun clampRectToBounds(rect: RectF, maxWidth: Float, maxHeight: Float): RectF {
        val width = min(rect.width(), maxWidth)
        val height = min(rect.height(), maxHeight)

        var left = rect.left
        var top = rect.top
        var right = left + width
        var bottom = top + height

        if (left < 0f) {
            left = 0f
            right = width
        }
        if (top < 0f) {
            top = 0f
            bottom = height
        }
        if (right > maxWidth) {
            right = maxWidth
            left = max(0f, right - width)
        }
        if (bottom > maxHeight) {
            bottom = maxHeight
            top = max(0f, bottom - height)
        }

        return RectF(left, top, right, bottom)
    }

    private fun clampFloat(value: Float, minValue: Float, maxValue: Float): Float {
        return max(minValue, min(value, maxValue))
    }

    /**
     * Given a list of lines and the raw ML Kit Text result, return a candidate card name.
     */
    private fun findCandidate(
        allLines: List<String>,
        ocrText: com.google.mlkit.vision.text.Text? = null
    ): Triple<String, String?, Boolean>? {

        data class LineInfo(val confidence: Float, val line: com.google.mlkit.vision.text.Text.Line)
        val lineInfoMap: Map<String, LineInfo> = ocrText?.textBlocks
            ?.flatMap { it.lines }
            ?.associate { it.text.trim() to LineInfo(it.confidence ?: 0.8f, it) }
            ?: emptyMap()

        val candidates = mutableListOf<Triple<String, String?, Boolean>>()

        data class LorcanaCardData(
            val nameIndex: Int,
            val name: String,
            val cleanName: String,
            var subtype: String? = null,
            var inkCost: String? = null,
            var stats: String? = null,
            var confidence: Int = 1
        )

        val lorcanaCardData = mutableListOf<LorcanaCardData>()

        for (i in allLines.indices) {
            val line = allLines[i]
            if (!LORCANA_NAME_REGEX.matches(line) || KEYWORD_FILTER.containsMatchIn(line)) continue

            val info = lineInfoMap[line]
            val cleanName = if (info != null) {
                val rebuilt = info.line.elements.joinToString(" ") { element ->
                    element.symbols
                        .filter { sym -> (sym.confidence ?: 1f) >= MIN_SYMBOL_CONFIDENCE }
                        .joinToString("") { it.text }
                }.trim()
                val originalLength = line.replace(" ", "").length
                val rebuiltLength = rebuilt.replace(" ", "").length
                val preservedRatio = if (originalLength > 0) {
                    rebuiltLength.toFloat() / originalLength.toFloat()
                } else {
                    0f
                }
                val shouldUseRebuilt =
                    rebuilt.isNotEmpty() &&
                        LORCANA_NAME_REGEX.matches(rebuilt) &&
                        !KEYWORD_FILTER.containsMatchIn(rebuilt) &&
                        (rebuiltLength >= originalLength - 1 || preservedRatio >= 0.8f)

                if (shouldUseRebuilt) rebuilt else line
            } else line

            val mlConf = info?.confidence ?: 0.8f
            val confBonus = when {
                mlConf >= 0.90f -> 4
                mlConf >= 0.75f -> 3
                mlConf >= 0.60f -> 2
                mlConf >= 0.45f -> 1
                else            -> 0
            }
            lorcanaCardData.add(LorcanaCardData(i, line, cleanName, confidence = 1 + confBonus))
        }

        for (cardData in lorcanaCardData) {
            val nameIndex = cardData.nameIndex

            if (nameIndex + 1 < allLines.size) {
                val nextLine = allLines[nameIndex + 1]
                if (LORCANA_VERSION_REGEX.matches(nextLine) && !KEYWORD_FILTER.containsMatchIn(nextLine)) {
                    cardData.subtype = nextLine
                    cardData.confidence += 3
                }
            }

            val searchRange = maxOf(0, nameIndex - 2)..minOf(allLines.size - 1, nameIndex + 3)
            for (j in searchRange) {
                val nearbyLine = allLines[j]
                if (cardData.inkCost == null && LORCANA_INK_COST_REGEX.matches(nearbyLine)) {
                    cardData.inkCost = nearbyLine
                    cardData.confidence += 1
                }
                if (cardData.stats == null && LORCANA_STATS_REGEX.matches(nearbyLine)) {
                    cardData.stats = nearbyLine
                    cardData.confidence += 2
                }
            }

            if (cardData.subtype != null || cardData.inkCost != null || cardData.stats != null) {
                candidates.add(Triple(cardData.cleanName, cardData.subtype, true))
            }
        }

        if (candidates.isEmpty() && lorcanaCardData.isNotEmpty()) {
            val fallback = lorcanaCardData.maxByOrNull { computeNameScore(it.cleanName) + it.confidence }
            if (fallback != null) {
                candidates.add(Triple(fallback.cleanName, fallback.subtype, true))
            }
        }

        return candidates.maxByOrNull {
            computeNameScore(it.first) + (if (it.third) 2 else 0)
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
        cardNumber: String?,
        setNumber: Int?
    ) {
        val currentTime = System.currentTimeMillis()
        recentScans.removeAll { currentTime - it.second > COOLDOWN_MS }

        if (recentScans.any { it.first.equals(fullName, ignoreCase = true) }) {
            Log.d(TAG, "Duplicate scan for: $fullName; ignoring.")
            return
        }

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
            if (subtype != null) {
                putString("subtype", subtype)
            }
            putBoolean("isLorcana", isLorcana)

            if (setCode != null) {
                putString("setCode", setCode)
                Log.d(TAG, "Set code added to event: $setCode")
            }

            if (cardNumber != null) {
                putString("cardNumber", cardNumber)
                Log.d(TAG, "Card number added to event: $cardNumber")
            }

            if (setNumber != null) {
                putInt("setNumber", setNumber)
                Log.d(TAG, "Set number added to event: $setNumber")
            }
        }

        Log.d(TAG, "Emitting OCR result: mainName=$name, subtype=$subtype, isLorcana=$isLorcana, setCode=$setCode, cardNumber=$cardNumber, setNumber=$setNumber")

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LiveOcrResult", params)

        Log.d(TAG, "Card name detected: $fullName")
    }

    /**
     * Convert a YUV_420_888 image to a cropped Bitmap (AOI only).
     */
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
        yuvImage.compressToJpeg(cropRect, 95, out)
        val raw = BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
        return enhanceBitmap(raw)
    }

    /**
     * Apply a mild contrast boost to help ML Kit distinguish card text from the background.
     */
    private fun enhanceBitmap(source: Bitmap): Bitmap {
        val output = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint()
        val scale = 1.25f
        val offset = -30f
        val cm = ColorMatrix(floatArrayOf(
            scale, 0f,    0f,    0f, offset,
            0f,    scale, 0f,    0f, offset,
            0f,    0f,    scale, 0f, offset,
            0f,    0f,    0f,    1f, 0f
        ))
        paint.colorFilter = ColorMatrixColorFilter(cm)
        canvas.drawBitmap(source, 0f, 0f, paint)
        source.recycle()
        return output
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
        val linearZoom = (currentZoomLevel / MAX_ZOOM_LEVEL).coerceIn(0f, 1f)
        camera?.cameraControl?.setLinearZoom(linearZoom)
    }
}
