package com.micromax.sugar.core.device

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings

object DeviceId {
    /** ANDROID_ID: stable per app-signing key, user and device; the server binds a user to it. */
    @SuppressLint("HardwareIds")
    fun get(context: Context): String = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    val name: String get() = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
    val osVersion: String get() = Build.VERSION.RELEASE ?: ""
}
