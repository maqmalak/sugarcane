package com.micromax.sugar.eagleeye

import android.app.Application
import com.micromax.sugar.eagleeye.sync.SyncWorker
import org.osmdroid.config.Configuration

class EagleEyeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Configuration.getInstance().apply {
            userAgentValue = packageName // tile servers ask for an identifying user agent
            osmdroidBasePath = filesDir.resolve("osmdroid")
            osmdroidTileCache = cacheDir.resolve("tiles") // tiles seen once stay available offline
            tileFileSystemCacheMaxBytes = 600L * 1024 * 1024
        }
        SyncWorker.schedule(this)
    }
}
