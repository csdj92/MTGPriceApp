package com.mtgpriceapp.ocr

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OcrPackage : ReactPackage {
    // Create only one instance and reuse it.
    private lateinit var classifierModule: LiveImageClassifier

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        classifierModule = LiveImageClassifier(reactContext)
        return listOf(LiveOcr(reactContext), classifierModule)
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        // Now pass the same classifierModule instance so it receives the preview
        return listOf(
            LiveOcrPreviewManager().apply { setPreviewModule(classifierModule) }
        )
    }
} 