package com.lorcanacollector.share

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class AndroidShareModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AndroidShareModule"
    }

    @ReactMethod
    fun shareFile(filePath: String, mimeType: String, title: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File does not exist: $filePath")
                return
            }

            // Get a content URI through FileProvider
            val contentUri = FileProvider.getUriForFile(
                reactContext,
                reactContext.packageName + ".fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_SEND)
            intent.type = mimeType
            intent.putExtra(Intent.EXTRA_STREAM, contentUri)
            intent.putExtra(Intent.EXTRA_SUBJECT, title)
            intent.putExtra(Intent.EXTRA_TEXT, "Shared from MTG Price App")
            
            // Add flags to grant temporary read permission to the receiving app
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            
            // Create the chooser intent
            val chooser = Intent.createChooser(intent, title)
            
            // Add the FLAG_ACTIVITY_NEW_TASK to open the chooser in a new task
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            reactContext.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARE_ERROR", e.message, e)
        }
    }
} 