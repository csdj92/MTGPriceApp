package com.mtgpriceapp.ocr

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

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

    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    companion object {
        private const val TAG = "LiveOcr"
        const val NAME = "LiveOcr"
    }

    override fun getName() = NAME

    override fun initialize() {
        super.initialize()
        startBackgroundThread()
    }

    override fun onCatalystInstanceDestroy() {
        stopBackgroundThread()
        closeCamera()
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun startOcrSession(promise: Promise) {
        try {
            if (!isSessionActive) {
                isSessionActive = true
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
            // Setup camera preview
            setupCameraPreview()
        } else {
            closeCamera()
        }
    }

    private fun setupCameraPreview() {
        val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            val cameraId = findBackCamera(manager) ?: manager.cameraIdList[0]
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw RuntimeException("Time out waiting to lock camera opening.")
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

    private fun findBackCamera(manager: CameraManager): String? {
        return manager.cameraIdList.find { id ->
            val characteristics = manager.getCameraCharacteristics(id)
            characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
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

            // Create preview request
            val previewRequestBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                addTarget(surface)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
            }

            // Create capture session
            device.createCaptureSession(listOf(surface), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    if (cameraDevice == null) return
                    captureSession = session
                    try {
                        session.setRepeatingRequest(previewRequestBuilder.build(), null, backgroundHandler)
                    } catch (e: CameraAccessException) {
                        Log.e(TAG, "Failed to start camera preview", e)
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
        captureSession?.close()
        captureSession = null
    }

    private fun closeCamera() {
        try {
            cameraOpenCloseLock.acquire()
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
}