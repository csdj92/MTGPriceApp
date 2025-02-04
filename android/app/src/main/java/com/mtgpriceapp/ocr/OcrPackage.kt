package com.mtgpriceapp.ocr

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OcrPackage : ReactPackage {
    private lateinit var ocrModule: LiveOcr
    private lateinit var classifierModule: LiveImageClassifier
    private var currentPreviewModule: PreviewModule? = null

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        ocrModule = LiveOcr(reactContext)
        classifierModule = LiveImageClassifier(reactContext)
        // Default to OCR module
        currentPreviewModule = ocrModule
        return listOf(ocrModule, classifierModule)
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(
            LiveOcrPreviewManager().apply { 
                setPreviewModules(ocrModule, classifierModule)
            }
        )
    }
} 