package com.mtgpriceapp.ocr

import android.content.Context
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import android.widget.FrameLayout
import java.util.concurrent.atomic.AtomicBoolean

class LiveOcrPreviewView(context: Context, private val liveOcrModule: LiveOcr?) : FrameLayout(context) {
    private var isActive = false
    private var isSurfaceValid = false
    private val isPreviewSetup = AtomicBoolean(false)
    private val surfaceView: SurfaceView = SurfaceView(context)
    
    init {
        // Add SurfaceView to fill the frame
        addView(surfaceView, LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        
        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                Log.d(TAG, "Surface created")
                synchronized(this@LiveOcrPreviewView) {
                    isSurfaceValid = true
                    if (isActive && !isPreviewSetup.get()) {
                        setupPreview()
                    }
                }
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                Log.d(TAG, "Surface changed: format=$format, width=$width, height=$height")
                synchronized(this@LiveOcrPreviewView) {
                    if (width > 0 && height > 0) {
                        isSurfaceValid = true
                        if (isActive && !isPreviewSetup.get()) {
                            setupPreview()
                        }
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
    }

    fun setIsActive(active: Boolean) {
        Log.d(TAG, "Setting active state to: $active")
        synchronized(this) {
            if (isActive == active) {
                return  // No change needed
            }
            
            isActive = active
            if (active) {
                if (isSurfaceValid && !isPreviewSetup.get()) {
                    setupPreview()
                }
            } else {
                releasePreview()
            }
        }
    }

    private fun setupPreview() {
        Log.d(TAG, "Setting up preview with valid surface")
        if (!isSurfaceValid) {
            Log.e(TAG, "Surface is not valid")
            return
        }
        if (liveOcrModule == null) {
            Log.e(TAG, "LiveOcr module is null")
            return
        }
        
        try {
            liveOcrModule.setPreviewSurface(surfaceView.holder.surface)
            isPreviewSetup.set(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up preview", e)
            isPreviewSetup.set(false)
        }
    }

    private fun releasePreview() {
        Log.d(TAG, "Releasing preview")
        try {
            liveOcrModule?.setPreviewSurface(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing preview", e)
        } finally {
            isPreviewSetup.set(false)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        synchronized(this) {
            isActive = false
            releasePreview()
        }
    }

    companion object {
        private const val TAG = "LiveOcrPreviewView"
    }
} 