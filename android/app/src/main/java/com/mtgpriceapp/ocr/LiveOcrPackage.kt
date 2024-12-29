package com.mtgpriceapp.ocr

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LiveOcrPackage : ReactPackage {
    private var liveOcrModule: LiveOcr? = null

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        synchronized(this) {
            if (liveOcrModule == null) {
                liveOcrModule = LiveOcr(reactContext)
            }
            return listOf(liveOcrModule!!)
        }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(LiveOcrPreviewManager(liveOcrModule))
    }
}
