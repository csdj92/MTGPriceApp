package com.lorcanacollector.ocr

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LiveOcrPackage : ReactPackage {
    private lateinit var liveOcrModule: LiveOcr

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        liveOcrModule = LiveOcr(reactContext)
        return listOf(liveOcrModule)
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(LiveOcrPreviewManager().apply { 
            setPreviewModules(liveOcrModule, liveOcrModule)
        })
    }
}
