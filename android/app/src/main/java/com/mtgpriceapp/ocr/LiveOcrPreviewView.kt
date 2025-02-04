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
    companion object {
        private const val TAG = "LiveOcrPreviewView"
    }

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

    fun setPreviewModule(module: PreviewModule?) {
        synchronized(this) {
            if (previewModule != module) {
                // Release the old preview
                releasePreview()
                previewModule = module
                if (isActive && isSurfaceValid) {
                    post { setupPreview() }  // Post to main thread
                }
            }
        }
    }

    fun setIsActive(active: Boolean) {
        synchronized(this) {
            if (isActive != active) {
                isActive = active
                visibility = if (active) View.VISIBLE else View.INVISIBLE
                
                // First release the old preview if needed
                if (!active) {
                    releasePreview()
                }
                
                // Then setup the new preview if needed
                if (active && isSurfaceValid) {
                    post { setupPreview() }  // Post to main thread
                }
            }
        }
    }

    fun isSurfaceValid(): Boolean = isSurfaceValid

    fun getSurface(): Surface? = if (isSurfaceValid) surfaceView.holder.surface else null

    private fun setupPreview() {
        synchronized(this) {
            if (isActive && isSurfaceValid && !isPreviewSetup.get()) {
                try {
                    previewModule?.setPreviewSurface(surfaceView.holder.surface)
                    isPreviewSetup.set(true)
                } catch (e: Exception) {
                    Log.e(TAG, "Error setting up preview", e)
                    isPreviewSetup.set(false)
                }
            }
        }
    }

    fun releasePreview() {
        synchronized(this) {
            if (isPreviewSetup.get()) {
                try {
                    previewModule?.setPreviewSurface(null)
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing preview", e)
                } finally {
                    isPreviewSetup.set(false)
                }
            }
        }
    }
} 