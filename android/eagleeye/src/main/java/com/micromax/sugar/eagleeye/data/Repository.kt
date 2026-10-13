package com.micromax.sugar.eagleeye.data

import android.content.Context
import com.micromax.sugar.core.device.DeviceId
import com.micromax.sugar.core.media.Photos
import com.micromax.sugar.core.net.ApiClient
import com.micromax.sugar.core.net.Session
import com.micromax.sugar.core.net.SugarJson
import com.micromax.sugar.eagleeye.BuildConfig
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Settings that arrive with the masters, kept in plain prefs (not secret). */
class FieldSettings(context: Context) {
    private val p = context.getSharedPreferences("field_settings", Context.MODE_PRIVATE)
    var season: String? get() = p.getString("season", null); set(v) = p.edit().putString("season", v).apply()
    var geofenceRadiusM: Float get() = p.getFloat("geofence", 200f); set(v) = p.edit().putFloat("geofence", v).apply()
    var trackingIntervalS: Int get() = p.getInt("tracking", 300); set(v) = p.edit().putInt("tracking", v).apply()
    var minGpsAccuracyM: Float get() = p.getFloat("min_acc", 20f); set(v) = p.edit().putFloat("min_acc", v).apply()
}

object Time {
    private val dt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
    private val d = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    fun now(): String = dt.format(Date())
    fun at(ms: Long): String = dt.format(Date(ms))
    fun today(): String = d.format(Date())
}

class Repository(private val context: Context) {
    val session = Session(context).also { if (it.serverUrl == Session.DEFAULT_SERVER) it.serverUrl = BuildConfig.DEFAULT_SERVER }
    val db = EagleEyeDb.get(context)
    val settings = FieldSettings(context)
    val deviceId: String = DeviceId.get(context)

    fun api(): EagleEyeApi = ApiClient.create(EagleEyeApi::class.java, session, deviceId, BuildConfig.DEBUG)

    suspend fun login(email: String, password: String): LoginResult {
        val r = api().login(email.trim(), password, deviceId, DeviceId.name, BuildConfig.VERSION_NAME, DeviceId.osVersion).message
        if (r.status == "Approved") {
            session.apiKey = r.apiKey
            session.apiSecret = r.apiSecret
            session.user = r.user
            session.fullName = r.fullName
            session.deviceName = r.device
            session.mastersSince = null
        }
        return r
    }

    /** Download masters: everything the first time, then only what changed since the last pull. */
    suspend fun pullMasters(full: Boolean = false) {
        val m = api().masters(if (full) null else session.mastersSince).message
        val dao = db.masters()
        if (m.full) { dao.clearCircles(); dao.clearVillages(); dao.clearGrowers() }
        dao.circles(m.circles.filter { it.isActive == 1 }.map { CircleE(it.name, it.code, it.latitude, it.longitude, it.polygon) })
        dao.villages(m.villages.filter { it.isActive == 1 }.map { VillageE(it.name, it.title, it.code, it.circle, it.sector, it.latitude, it.longitude, it.polygon) })
        dao.varieties(m.varieties.filter { it.isActive == 1 }.map { VarietyE(it.name, it.expectedYield, it.color) })
        dao.diseases(m.diseases.map { DiseaseE(it.name, it.severity) })
        dao.competitorMills(m.competitorMills.filter { it.isActive == 1 }.map { CompetitorMillE(it.name, it.shortName, it.latitude, it.longitude) })
        dao.growers(m.growers.filter { it.disabled == 0 }.map { GrowerE(it.name, it.growerName, it.fatherName, it.cnic, it.passbookNo, it.mobile, it.circle, it.village) })
        m.growers.filter { it.disabled == 1 }.map { it.name }.takeIf { it.isNotEmpty() }?.let { dao.deleteGrowers(it) }
        dao.clearTargets()
        dao.targets(m.targets.map { TargetE(it.name, it.circle, it.targetAcres, it.targetSurveys) })
        m.mySurveys.forEach { s -> db.outbox().overlap(s.name, s.overlapStatus) }
        settings.season = m.settings.season
        settings.geofenceRadiusM = m.settings.geofenceRadiusM.toFloat()
        settings.trackingIntervalS = m.settings.trackingIntervalS
        settings.minGpsAccuracyM = m.settings.minGpsAccuracyM.toFloat()
        session.mastersSince = m.serverTime
    }

    /** Upload the outbox. Every record has a UUID, so a batch sent twice (lost reply, retry) creates nothing twice. */
    suspend fun push(): String {
        val out = db.outbox()
        var surveys = 0; var errors = 0
        while (true) {
            val batch = out.ready(5)
            if (batch.isEmpty()) break
            val body = UploadBody(surveys = batch.map { surveyJson(it, out.photoList(it.uuid)) })
            val res = api().upload(body).message
            for (r in res.surveys) {
                val uuid = r.uuid ?: continue
                if (r.status == "error") { out.mark(uuid, SyncState.ERROR, null, r.message); errors++ }
                else { out.mark(uuid, SyncState.SYNCED, r.name, null); surveys++ }
            }
        }
        val att = out.unsentAttendance()
        if (att.isNotEmpty()) {
            val res = api().upload(UploadBody(attendance = att.map { attendanceJson(it) })).message
            res.attendance.forEach { r ->
                val a = att.firstOrNull { it.uuid == r.uuid } ?: return@forEach
                out.attendance(if (r.status == "error") a.copy(error = r.message) else
                    a.copy(sentIn = true, sentOut = a.timeOut != null, serverName = r.name, error = null))
            }
        }
        var points = 0
        while (true) {
            val locs = out.unsentLocations(500)
            if (locs.isEmpty()) break
            api().upload(UploadBody(locations = locs.map { l ->
                buildJsonObject {
                    put("uuid", l.uuid); put("logged_at", l.loggedAt); put("latitude", l.lat); put("longitude", l.lng)
                    put("accuracy", l.accuracy); put("speed", l.speed); put("battery", l.battery)
                }
            }))
            out.markLocations(locs.map { it.uuid })
            points += locs.size
        }
        out.pruneLocations(Time.at(System.currentTimeMillis() - 7L * 86_400_000))
        session.lastSync = Time.now()
        return "Sent $surveys surveys, ${att.size} attendance, $points GPS points" + if (errors > 0) " · $errors need fixing" else ""
    }

    private fun surveyJson(s: SurveyE, photos: List<PhotoE>): JsonObject = buildJsonObject {
        put("uuid", s.uuid)
        settings.season?.let { put("season", it) }
        put("survey_for", s.surveyFor)
        s.competitorMill?.let { put("competitor_mill", it) }
        if (s.surveyFor == "Company") {
            put("grower_category", s.growerCategory)
            if (s.grower == null) {
                s.npCnic?.let { put("np_cnic", it) }; s.npName?.let { put("np_grower_name", it) }
                s.npFather?.let { put("np_father_name", it) }; s.npMobile?.let { put("np_mobile", it) }
            }
        }
        s.grower?.let { put("grower", it) }
        s.growerPhotoPath?.let { path -> File(path).takeIf { it.exists() }?.let { f ->
            put("grower_photo", buildJsonObject {
                put("filename", f.name); put("data", Photos.base64(f))
                s.growerPhotoLat?.let { put("latitude", it) }; s.growerPhotoLng?.let { put("longitude", it) }
                s.growerPhotoAt?.let { put("taken_at", it) }
            })
        } }
        put("circle", s.circle); put("village", s.village)
        s.murabbaNo?.let { put("murabba_no", it) }; s.killaNo?.let { put("killa_no", it) }
        s.totalAcres?.let { put("total_acres", it) }; s.emptyAcres?.let { put("empty_land_acres", it) }
        s.cropAcres?.let { put("crop_land_acres", it) }
        put("variety", s.variety); put("crop_type", s.cropType)
        s.ratoonNo?.let { put("ratoon_no", it) }
        put("crop_condition", s.condition)
        s.disease?.let { put("disease", it); put("disease_pct", s.diseasePct ?: 0.0) }
        s.gpsAccuracy?.let { put("gps_accuracy_m", it) }
        s.remarks?.let { put("remarks", it) }
        put("captured_at", s.capturedAt)
        put("survey_date", s.capturedAt.substring(0, 10))
        s.polygon?.let { put("polygon", SugarJson.parseToJsonElement(it)) }
        put("photos", buildJsonArray {
            photos.forEach { p ->
                val f = File(p.path)
                if (f.exists()) add(buildJsonObject {
                    put("uuid", p.uuid); put("filename", f.name); put("data", Photos.base64(f)); put("caption", p.caption)
                    p.lat?.let { put("latitude", it) }; p.lng?.let { put("longitude", it) }; put("taken_at", p.takenAt)
                })
            }
        })
        put("submit", JsonPrimitive(true))
    }

    private fun attendanceJson(a: AttendanceE): JsonObject = buildJsonObject {
        put("uuid", a.uuid); put("time_in", a.timeIn); put("latitude_in", a.latIn); put("longitude_in", a.lngIn); put("accuracy_in", a.accIn)
        if (!a.sentIn) a.selfieIn?.let { path -> File(path).takeIf { it.exists() }?.let { put("selfie_in", Photos.base64(it)) } }
        a.timeOut?.let { put("time_out", it) }
        a.latOut?.let { put("latitude_out", it) }; a.lngOut?.let { put("longitude_out", it) }; a.accOut?.let { put("accuracy_out", it) }
        a.selfieOut?.let { path -> File(path).takeIf { it.exists() }?.let { put("selfie_out", Photos.base64(it)) } }
    }

    fun signOut() = session.signOut()
}
