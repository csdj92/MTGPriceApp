package com.mtgpriceapp.ocr

import android.util.Log
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Bitmap.createScaledBitmap
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import org.tensorflow.lite.Interpreter
import kotlin.math.exp

class ImageClassifier(private val context: Context) {

    // Configuration for the model
    private val MODEL_PATH = "mtg_classifier.tflite"               // The model file in assets
    private val LABELS_PATH = "mtg_classifier_classes.txt"           // Path to labels file
    private val INPUT_SIZE = 224                                     // Assuming the model requires 224x224 input
    private val NUM_BYTES_PER_CHANNEL = 4                            // Float size in bytes
    // We will update the number of classes dynamically from the labels file.
    private var numClasses: Int = 0
    private lateinit var labels: List<String>

    private var interpreter: Interpreter? = null

    private companion object {
        private const val TEMPERATURE = 0.5f  // Temperature parameter for scaling logits, sharper distribution
    }

    init {
        try {
            // Initialize the TFLite interpreter and load the labels.
            interpreter = Interpreter(loadModelFile(context))
            labels = loadLabels(context)
            numClasses = labels.size  // Use the actual number of classes from the labels file.

        } catch (e: Exception) {
            Log.e("ImageClassifier", "Error initializing classifier", e)
        }
    }


    @Throws(IOException::class)
    private fun loadModelFile(context: Context): MappedByteBuffer {
        val fileDescriptor = context.assets.openFd(MODEL_PATH)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    @Throws(IOException::class)
    private fun loadLabels(context: Context): List<String> {
        return context.assets.open(LABELS_PATH).bufferedReader().useLines { lines ->
            lines.filter { it.isNotBlank() }.toList()
        }
    }

    /**
     * Preprocess the bitmap: resize to INPUT_SIZE and convert it to a normalized ByteBuffer.
     */
    private fun convertBitmapToByteBuffer(bitmap: Bitmap): ByteBuffer {
        // Resize the bitmap to the expected size (224x224)
        val scaledBitmap = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, false)
        Log.d("ImageClassifier", "Scaled bitmap dimensions: ${scaledBitmap.width} x ${scaledBitmap.height}")

        // Allocate a direct ByteBuffer with enough space for one image (1 x 224 x 224 x 3 float32 values)
        val byteBuffer = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * NUM_BYTES_PER_CHANNEL)
        byteBuffer.order(ByteOrder.nativeOrder())

        // Retrieve pixel data from the scaled bitmap.
        val intValues = IntArray(INPUT_SIZE * INPUT_SIZE)
        scaledBitmap.getPixels(intValues, 0, scaledBitmap.width, 0, 0, scaledBitmap.width, scaledBitmap.height)

        var pixel = 0
        // Loop through every pixel and extract the RGB channel values.
        for (i in 0 until INPUT_SIZE) {
            for (j in 0 until INPUT_SIZE) {
                val value = intValues[pixel++]
                // Convert pixel values from int (0-255) to float in the range [0, 1]
                val r = ((value shr 16) and 0xFF) / 255.0f
                val g = ((value shr 8) and 0xFF) / 255.0f
                val b = (value and 0xFF) / 255.0f

                // Revert to Imagenet normalization
                val normR = (r - 0.485f) / 0.229f
                val normG = (g - 0.456f) / 0.224f
                val normB = (b - 0.406f) / 0.225f

                byteBuffer.putFloat(normR)
                byteBuffer.putFloat(normG)
                byteBuffer.putFloat(normB)
            }
        }
        return byteBuffer
    }

    private fun applyTemperatureSoftmax(logits: FloatArray, temperature: Float): FloatArray {
        val maxLogit = logits.maxOrNull() ?: 0f
        val scaled = FloatArray(logits.size) { i -> exp((logits[i] - maxLogit) / temperature) }
        val sum = scaled.sum()
        for (i in scaled.indices) {
            scaled[i] /= sum
        }
        return scaled
    }

    /**
     * Classify the given bitmap image using the TFLite model.
     * Returns the predicted label as a String.
     */
    fun classify(bitmap: Bitmap): String {
        val inputBuffer = convertBitmapToByteBuffer(bitmap)
        val outputBuffer = Array(1) { FloatArray(numClasses) }
        interpreter?.run(inputBuffer, outputBuffer)
        val rawOutputs = outputBuffer[0]
        
        // Optionally compute softmax to view the true probability.
        val probabilities = applyTemperatureSoftmax(rawOutputs, TEMPERATURE)
        val maxIndex = probabilities.indices.maxByOrNull { probabilities[it] } ?: -1
        val confidence = if (maxIndex != -1) probabilities[maxIndex] else 0f
        Log.d("ImageClassifier", "Max index: $maxIndex, Confidence: $confidence")
        
        if (::labels.isInitialized && maxIndex in labels.indices) {
            val rawLabel = labels[maxIndex].trim()
            val processedLabel = if (rawLabel.contains("\t")) {
                rawLabel.split("\t").getOrElse(1) { rawLabel }
            } else {
                rawLabel
            }
            return processedLabel
        }
        return "Unknown"
    }

    /**
     * Close the interpreter and free resources when done.
     */
    fun close() {
        interpreter?.close()
        interpreter = null
    }
} 