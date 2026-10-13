package com.micromax.sugar.core.net

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Sign-in state kept in EncryptedSharedPreferences (AES-256, key in the Android Keystore). */
class Session(context: Context, name: String = "sugar_session") {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        name,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var serverUrl: String
        get() = prefs.getString("server_url", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(v) = prefs.edit().putString("server_url", v.trimEnd('/')).apply()
    var apiKey: String? by pref("api_key")
    var apiSecret: String? by pref("api_secret")
    var user: String? by pref("user")
    var fullName: String? by pref("full_name")
    var deviceName: String? by pref("device")
    var pinHash: String? by pref("pin_hash")
    var pinSalt: String? by pref("pin_salt")
    var mastersSince: String? by pref("masters_since")
    var lastSync: String? by pref("last_sync")

    val isSignedIn: Boolean get() = !apiKey.isNullOrBlank() && !apiSecret.isNullOrBlank()
    val token: String? get() = if (isSignedIn) "token $apiKey:$apiSecret" else null

    fun signOut() {
        prefs.edit().remove("api_key").remove("api_secret").remove("masters_since").apply()
    }

    private fun pref(key: String) = object : kotlin.properties.ReadWriteProperty<Any, String?> {
        override fun getValue(thisRef: Any, property: kotlin.reflect.KProperty<*>) = prefs.getString(key, null)
        override fun setValue(thisRef: Any, property: kotlin.reflect.KProperty<*>, value: String?) {
            prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
        }
    }

    companion object {
        const val DEFAULT_SERVER = "http://sugarcane.local:8006"
    }
}
