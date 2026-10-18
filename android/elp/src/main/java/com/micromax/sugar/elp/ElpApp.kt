package com.micromax.sugar.elp

import android.app.Application
import com.micromax.sugar.elp.sync.SyncWorker

class ElpApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SyncWorker.schedule(this)
    }
}
