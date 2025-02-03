package com.mtgpriceapp.ocr

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

@ReactModule(name = LiveOcrPreviewManager.REACT_CLASS)
class LiveOcrPreviewManager : SimpleViewManager<LiveOcrPreviewView>() {
    companion object {
        const val REACT_CLASS = "LiveOcrPreview"
    }

    private var previewModule: PreviewModule? = null

    fun setPreviewModule(module: PreviewModule) {
        previewModule = module
    }

    override fun getName(): String {
        return REACT_CLASS
    }

    override fun createViewInstance(reactContext: ThemedReactContext): LiveOcrPreviewView {
        return LiveOcrPreviewView(reactContext, previewModule)
    }

    @ReactProp(name = "isActive")
    fun setIsActive(view: LiveOcrPreviewView, isActive: Boolean) {
        view.setIsActive(isActive)
    }

    @ReactProp(name = "type")
    fun setType(view: LiveOcrPreviewView, type: String?) {
        // Handle type prop if needed
    }

    override fun getExportedCustomBubblingEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf()
    }

    override fun onDropViewInstance(view: LiveOcrPreviewView) {
        view.releasePreview()
        super.onDropViewInstance(view)
    }

    override fun onAfterUpdateTransaction(view: LiveOcrPreviewView) {
        super.onAfterUpdateTransaction(view)
        if (view.isSurfaceValid()) {
            previewModule?.setPreviewSurface(view.getSurface())
        }
    }
}

class LiveOcrPreviewPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return emptyList()
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(LiveOcrPreviewManager())
    }
} 