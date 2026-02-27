package com.lorcanacollector.ocr

import android.content.Context
import android.util.Log
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.view.PreviewView

class LiveOcrPreviewView(context: Context, private var previewModule: PreviewModule?) : FrameLayout(context) {
    companion object {
        const val TAG = "LiveOcrPreviewView"
    }

    private var isActive = false

    val previewView: PreviewView = PreviewView(context).apply {
        implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    }

    // React Native's Yoga layout engine intercepts and swallows requestLayout() calls from
    // child views (including CameraX's PreviewView and its internal SurfaceView). This means
    // the SurfaceView never gets properly measured/laid out, so its surface is never created
    // and the preview stays black. Rotation works because a configuration change forces a full
    // Activity layout pass that bypasses Yoga entirely.
    //
    // Fix: override requestLayout() and manually post a measure+layout pass so the SurfaceView
    // always gets valid dimensions regardless of what Yoga does.
    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        )
        layout(left, top, right, bottom)
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    init {
        Log.d(TAG, "init: creating view")
        layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        previewView.layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        addView(previewView)
        Log.d(TAG, "init: previewView added, implementationMode=PERFORMANCE")
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.d(TAG, "onAttachedToWindow: size=${width}x${height}, visibility=${visibilityName(visibility)}")
        logSurfaceViewState("onAttachedToWindow")
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.d(TAG, "onDetachedFromWindow")
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        val w = right - left
        val h = bottom - top
        Log.d(TAG, "onLayout: changed=$changed size=${w}x${h} previewView=${previewView.width}x${previewView.height}")
        logSurfaceViewState("onLayout")
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        Log.d(TAG, "onWindowVisibilityChanged: ${visibilityName(visibility)}")
        logSurfaceViewState("onWindowVisibilityChanged")
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        Log.d(TAG, "onVisibilityChanged: changedView=${changedView.javaClass.simpleName} visibility=${visibilityName(visibility)}")
    }

    fun logSurfaceViewState(caller: String) {
        val sv = findSurfaceView(previewView)
        if (sv != null) {
            val surfaceValid = try { sv.holder.surface.isValid } catch (e: Exception) { false }
            Log.d(TAG, "[$caller] SurfaceView: attached=${sv.isAttachedToWindow}, " +
                    "visibility=${visibilityName(sv.visibility)}, " +
                    "size=${sv.width}x${sv.height}, " +
                    "surfaceValid=$surfaceValid, " +
                    "holderSurface=${sv.holder.surface}")
        } else {
            Log.d(TAG, "[$caller] No SurfaceView found inside PreviewView (may be TextureView mode)")
        }
    }

    private fun findSurfaceView(group: ViewGroup): SurfaceView? {
        for (i in 0 until group.childCount) {
            val child = group.getChildAt(i)
            if (child is SurfaceView) return child
            if (child is ViewGroup) findSurfaceView(child)?.let { return it }
        }
        return null
    }

    private fun visibilityName(v: Int) = when (v) {
        View.VISIBLE -> "VISIBLE"
        View.INVISIBLE -> "INVISIBLE"
        View.GONE -> "GONE"
        else -> "UNKNOWN($v)"
    }

    fun setPreviewModule(module: PreviewModule?) {
        if (previewModule != module) {
            Log.d(TAG, "setPreviewModule: switching module")
            previewModule?.setPreviewView(null)
            previewModule = module
            if (isActive) {
                previewModule?.setPreviewView(previewView)
            }
        }
    }

    fun setIsActive(active: Boolean) {
        if (isActive != active) {
            isActive = active
            Log.d(TAG, "setIsActive=$active attached=${isAttachedToWindow} size=${width}x${height}")
            logSurfaceViewState("setIsActive=$active")
            if (active) {
                previewModule?.setPreviewView(previewView)
            } else {
                previewModule?.setPreviewView(null)
            }
        }
    }

    fun releasePreview() {
        try {
            Log.d(TAG, "releasePreview")
            previewModule?.setPreviewView(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing preview", e)
        }
    }
}
