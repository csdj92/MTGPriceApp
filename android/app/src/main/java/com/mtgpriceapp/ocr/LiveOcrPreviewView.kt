package com.mtgpriceapp.ocr

import android.content.Context
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView

class LiveOcrPreviewView(context: Context, private val liveOcrModule: LiveOcr?) : SurfaceView(context), SurfaceHolder.Callback {
    private var isActive = false

    init {
        holder.addCallback(this)
    }

    fun setIsActive(active: Boolean) {
        Log.d(TAG, "Setting active state to: $active")
        isActive = active
        if (holder.surface?.isValid == true) {
            if (active) {
                setupPreview()
            } else {
                releasePreview()
            }
        }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        Log.d(TAG, "Surface created")
        if (isActive) {
            setupPreview()
        }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        Log.d(TAG, "Surface changed: format=$format, width=$width, height=$height")
        if (isActive) {
            setupPreview()
        }
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        Log.d(TAG, "Surface destroyed")
        releasePreview()
    }

    private fun setupPreview() {
        Log.d(TAG, "Setting up preview with valid surface")
        if (liveOcrModule == null) {
            Log.e(TAG, "LiveOcr module is null")
            return
        }
        liveOcrModule.setPreviewSurface(holder.surface)
    }

    private fun releasePreview() {
        Log.d(TAG, "Releasing preview")
        liveOcrModule?.setPreviewSurface(null)
    }

    companion object {
        private const val TAG = "LiveOcrPreviewView"
    }
} 