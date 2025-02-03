package com.mtgpriceapp.ocr

import android.content.Context
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import android.widget.FrameLayout
import java.util.concurrent.atomic.AtomicBoolean
import android.view.View
import android.view.Surface

class LiveOcrPreviewView(context: Context, private var previewModule: PreviewModule?) : FrameLayout(context) {
    private var isActive = false
    private var isSurfaceValid = false
    private val isPreviewSetup = AtomicBoolean(false)
    private val surfaceView: SurfaceView = SurfaceView(context)
    
    init {
        Log.d(TAG, "Initializing LiveOcrPreviewView")
        layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        
        surfaceView.layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                Log.d(TAG, "Surface created - width: ${holder.surfaceFrame.width()}, height: ${holder.surfaceFrame.height()}")
                synchronized(this@LiveOcrPreviewView) {
                    isSurfaceValid = true
                    if (isActive) {
                        Log.d(TAG, "Surface created and view is active, setting up preview")
                        setupPreview()
                    } else {
                        Log.d(TAG, "Surface created but view is not active")
                    }
                }
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                Log.d(TAG, "Surface changed: format=$format, width=$width, height=$height")
                synchronized(this@LiveOcrPreviewView) {
                    if (width > 0 && height > 0) {
                        isSurfaceValid = true
                        if (isActive) {
                            Log.d(TAG, "Surface changed and view is active, setting up preview")
                            setupPreview()
                        } else {
                            Log.d(TAG, "Surface changed but view is not active")
                        }
                    } else {
                        Log.w(TAG, "Invalid surface dimensions: width=$width, height=$height")
                        isSurfaceValid = false
                    }
                }
            }

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                Log.d(TAG, "Surface destroyed")
                synchronized(this@LiveOcrPreviewView) {
                    isSurfaceValid = false
                    isPreviewSetup.set(false)
                    releasePreview()
                }
            }
        })

        addView(surfaceView)
        visibility = View.INVISIBLE
    }

    fun setIsActive(active: Boolean) {
        Log.d(TAG, "Setting active state to: $active (current: $isActive)")
        synchronized(this) {
            if (isActive == active) {
                Log.d(TAG, "Active state unchanged, skipping")
                return
            }
            
            isActive = active
            visibility = if (active) View.VISIBLE else View.INVISIBLE
            if (active) {
                if (isSurfaceValid) {
                    Log.d(TAG, "View activated with valid surface, setting up preview")
                    setupPreview()
                } else {
                    Log.d(TAG, "View activated but surface is not valid")
                }
            } else {
                Log.d(TAG, "View deactivated, releasing preview")
                releasePreview()
            }
        }
    }

    private fun setupPreview() {
        if (!isSurfaceValid) {
            Log.e(TAG, "Surface is not valid yet, retrying in 100ms")
            postDelayed({ setupPreview() }, 100)
            return
        }
        
        val module = previewModule
        if (module == null) {
            Log.e(TAG, "PreviewModule is null")
            return
        }

        try {
            val surface = surfaceView.holder.surface
            if (surface != null && surface.isValid) {
                Log.d(TAG, "Setting up preview with surface: $surface")
                module.setPreviewSurface(surface)
                isPreviewSetup.set(true)
                Log.d(TAG, "Preview setup complete")
            } else {
                Log.e(TAG, "Surface is null or invalid")
                isPreviewSetup.set(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up preview", e)
            isPreviewSetup.set(false)
        }
    }

    internal fun releasePreview() {
        try {
            Log.d(TAG, "Releasing preview")
            previewModule?.setPreviewSurface(null)
            Log.d(TAG, "Preview released")
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing preview", e)
        } finally {
            isPreviewSetup.set(false)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.d(TAG, "View detached from window")
        synchronized(this) {
            isActive = false
            releasePreview()
        }
    }

    fun setPreviewModule(module: PreviewModule?) {
        previewModule = module
        if (isActive && surfaceView.holder != null) {
            previewModule?.setPreviewSurface(surfaceView.holder.surface)
        }
    }

    internal fun isSurfaceValid(): Boolean = surfaceView.holder.surface.isValid
    internal fun getSurface(): Surface = surfaceView.holder.surface

    companion object {
        private const val TAG = "LiveOcrPreviewView"
    }
} 