package com.mtgpriceapp.ocr

import android.view.View
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

@ReactModule(name = LiveOcrPreviewManager.REACT_CLASS)
class LiveOcrPreviewManager(private val liveOcrModule: LiveOcr?) : SimpleViewManager<LiveOcrPreviewView>() {
    companion object {
        const val REACT_CLASS = "LiveOcrPreview"
    }

    override fun getName() = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): LiveOcrPreviewView {
        return LiveOcrPreviewView(reactContext, liveOcrModule)
    }

    @ReactProp(name = "isActive", defaultBoolean = false)
    fun setIsActive(view: LiveOcrPreviewView, isActive: Boolean) {
        view.post { view.setIsActive(isActive) }
    }
} 