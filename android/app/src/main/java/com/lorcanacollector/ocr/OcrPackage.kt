package com.lorcanacollector.ocr

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OcrPackage : ReactPackage {
    private lateinit var ocrModule: LiveOcr

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        if (!::ocrModule.isInitialized) {
            ocrModule = LiveOcr(reactContext)
        }
        return listOf(ocrModule)
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        if (!::ocrModule.isInitialized) {
            ocrModule = LiveOcr(reactContext)
        }
        return listOf(
            LiveOcrPreviewManager().apply { 
                setPreviewModules(ocrModule, ocrModule)
            }
        )
    }
}
