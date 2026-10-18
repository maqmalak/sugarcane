package com.micromax.sugar.elp.data

import android.content.Context
import com.micromax.sugar.core.device.DeviceId
import com.micromax.sugar.core.net.ApiClient
import com.micromax.sugar.core.net.Session
import com.micromax.sugar.core.net.SugarJson
import com.micromax.sugar.elp.BuildConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Time {
    private val dt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
    private val d = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val serial = SimpleDateFormat("ddMMyyyyHHmmss", Locale.US)
    fun now(): String = dt.format(Date())
    fun today(): String = d.format(Date())
    fun serial(): String = serial.format(Date())
}

@Serializable data class PhotoRef(val view: String, val path: String, val latitude: Double? = null, val longitude: Double? = null,
    val taken_at: String? = null, val sharpness: Double = 0.0)

class Repository(private val context: Context) {
    val session = Session(context, "elp_session").also { if (it.serverUrl == Session.DEFAULT_SERVER) it.serverUrl = BuildConfig.DEFAULT_SERVER }
    val db = ElpDb.get(context)
    val deviceId: String = DeviceId.get(context)
    private val mastersFile = File(context.filesDir, "masters.json")

    fun api(): ElpApi = ApiClient.create(ElpApi::class.java, session, deviceId, BuildConfig.DEBUG)

    suspend fun login(email: String, password: String): LoginResult {
        val r = api().login(email.trim(), password, deviceId, DeviceId.name, BuildConfig.VERSION_NAME, DeviceId.osVersion).message
        if (r.status == "Approved") {
            session.apiKey = r.apiKey; session.apiSecret = r.apiSecret; session.user = r.user
            session.fullName = r.fullName; session.deviceName = r.device
        }
        return r
    }

    /** Masters are small (the user's points, vehicles, today's indents): the whole set every time, kept as one file. */
    suspend fun pullMasters(): Masters {
        val m = api().masters().message
        mastersFile.writeText(SugarJson.encodeToString(Masters.serializer(), m))
        session.lastSync = Time.now()
        return m
    }

    fun masters(): Masters = runCatching { SugarJson.decodeFromString(Masters.serializer(), mastersFile.readText()) }.getOrDefault(Masters())

    /** Send what is waiting, a few at a time (photos are heavy). Server refusals stay on the phone with the reason. */
    suspend fun push(): String {
        var sent = 0; var refused = 0
        while (true) {
            val batch = db.outbox().ready(5)
            if (batch.isEmpty()) break
            fun body(e: LoadE): JsonObject {
                val base = SugarJson.parseToJsonElement(e.payload).jsonObject
                val photos = SugarJson.decodeFromString<List<PhotoRef>>(e.photos)
                return buildJsonObject {
                    base.forEach { (k, v) -> put(k, v) }
                    put("uuid", e.uuid)
                    put("photos", buildJsonArray {
                        photos.forEach { p ->
                            val f = File(p.path)
                            if (f.exists()) add(buildJsonObject {
                                put("view", p.view); put("data", android.util.Base64.encodeToString(f.readBytes(), android.util.Base64.NO_WRAP))
                                p.latitude?.let { put("latitude", it) }; p.longitude?.let { put("longitude", it) }; p.taken_at?.let { put("taken_at", it) }
                            })
                        }
                    })
                }
            }
            val regs = batch.filter { it.kind == Kind.REG }
            val arrs = batch.filter { it.kind == Kind.ARR }
            val r = api().upload(UploadBody(regs.map(::body), arrs.map(::body))).message
            for (res in r.registrations + r.arrivals) {
                val uuid = res.uuid ?: continue
                if (res.status == "error") { db.outbox().mark(uuid, State.ERROR, res.message, null); refused++ }
                else { db.outbox().mark(uuid, State.SENT, null, res.name); sent++ }
            }
        }
        db.outbox().purgeSent(System.currentTimeMillis() - 14L * 24 * 3600 * 1000)
        session.lastSync = Time.now()
        return if (sent + refused == 0) "Nothing to send" else "Sent $sent" + if (refused > 0) " · $refused refused" else ""
    }

    suspend fun mine(): List<MyLoad> = api().mine(3).message

    fun signOut() = session.signOut()
}
