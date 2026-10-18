package com.micromax.sugar.elp.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.micromax.sugar.core.device.CellTower
import com.micromax.sugar.core.geo.Geo
import com.micromax.sugar.core.geo.LatLng
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.media.Photos
import com.micromax.sugar.core.net.ApiClient
import com.micromax.sugar.core.net.SugarJson
import com.micromax.sugar.core.security.Pin
import com.micromax.sugar.elp.data.Kind
import com.micromax.sugar.elp.data.LoadE
import com.micromax.sugar.elp.data.MIndent
import com.micromax.sugar.elp.data.MPoint
import com.micromax.sugar.elp.data.MTransit
import com.micromax.sugar.elp.data.MVehicle
import com.micromax.sugar.elp.data.Masters
import com.micromax.sugar.elp.data.MyLoad
import com.micromax.sugar.elp.data.PhotoRef
import com.micromax.sugar.elp.data.Repository
import com.micromax.sugar.elp.data.Time
import com.micromax.sugar.elp.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/** Where the phone is relative to the user's points (or the mill). */
data class Place(val point: MPoint?, val inside: Boolean, val distanceM: Double?, val fix: Fix)

/** A photo taken for a load: kept only if it passed the quality check; stamped with point, time and GPS. */
data class Shot(val view: String, val path: String, val sharpness: Double, val lat: Double?, val lng: Double?, val takenAt: String)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val repo = Repository(app)
    private val ctx: Context get() = getApplication()

    private val _locked = MutableStateFlow(repo.session.pinHash != null)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()
    private val _masters = MutableStateFlow(repo.masters())
    val masters: StateFlow<Masters> = _masters.asStateFlow()
    private val _mine = MutableStateFlow<List<MyLoad>>(emptyList())
    val mine: StateFlow<List<MyLoad>> = _mine.asStateFlow()
    private var backgroundSince = 0L

    val outbox = repo.db.outbox().all().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val ready = repo.db.outbox().readyCount().stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val syncRunning = WorkManager.getInstance(app).getWorkInfosForUniqueWorkFlow(SyncWorker.NOW)
        .map { list -> list.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val syncResult = WorkManager.getInstance(app).getWorkInfosForUniqueWorkFlow(SyncWorker.NOW)
        .map { list -> list.firstOrNull { it.state.isFinished }?.outputData?.getString(SyncWorker.KEY_SUMMARY) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        // a finished sync brought new masters: reload them
        viewModelScope.launch { syncRunning.collect { running -> if (!running) _masters.value = repo.masters() } }
    }

    fun say(text: String?) { _message.value = text }

    // ---------------------------------------------------------------- lock
    fun onBackground() { backgroundSince = System.currentTimeMillis() }
    fun onForeground() {
        if (repo.session.pinHash != null && backgroundSince > 0 && System.currentTimeMillis() - backgroundSince > LOCK_AFTER_MS) _locked.value = true
    }
    fun unlock(pin: String): Boolean = Pin.matches(pin, repo.session.pinSalt, repo.session.pinHash).also { if (it) _locked.value = false }
    fun setPin(pin: String) {
        val salt = Pin.newSalt()
        repo.session.pinSalt = salt
        repo.session.pinHash = Pin.hash(pin, salt)
        _locked.value = false
    }

    // ---------------------------------------------------------------- sign in / sync
    suspend fun login(server: String, email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            repo.session.serverUrl = server.trim()
            val r = repo.login(email, password)
            if (r.status != "Approved") error(r.message ?: "Device ${r.status}")
            _masters.value = repo.pullMasters()
            "Signed in as ${r.fullName ?: r.user}"
        }.recoverCatching { throw IllegalStateException(ApiClient.errorMessage(it)) }
    }

    fun syncNow() = SyncWorker.now(ctx)
    fun signOut() = repo.signOut()

    fun refreshMine() = viewModelScope.launch(Dispatchers.IO) {
        runCatching { repo.mine() }.onSuccess { _mine.value = it }.onFailure { say(ApiClient.errorMessage(it)) }
    }

    // ---------------------------------------------------------------- where am I
    private fun inside(p: MPoint, at: LatLng, buffer: Double): Pair<Boolean, Double?> {
        val dist = if (p.latitude != null && p.longitude != null) Geo.distanceM(at, LatLng(p.latitude, p.longitude)) else null
        val rings = Geo.rings(p.geofence)
        if (rings.isNotEmpty()) return Geo.insideFence(rings, at, buffer) to dist
        return (dist != null && p.radiusM > 0 && dist <= p.radiusM + buffer) to dist
    }

    /** The assigned point the phone is inside (or the nearest one, outside). Registration is allowed only inside. */
    fun locate(fix: Fix): Place {
        val m = _masters.value
        val at = LatLng(fix.lat, fix.lng)
        val checks = m.points.map { p -> Triple(p, inside(p, at, m.rules.bufferM).first, inside(p, at, m.rules.bufferM).second) }
        val hit = checks.firstOrNull { it.second }
        if (hit != null) return Place(hit.first, true, hit.third, fix)
        val near = checks.filter { it.third != null }.minByOrNull { it.third!! }
        return Place(near?.first, false, near?.third, fix)
    }

    /** At the mill gate? Inside the premises or within the buffer of the mill pin. */
    fun atMill(fix: Fix): Pair<Boolean, Double?> {
        val mill = _masters.value.mill
        val at = LatLng(fix.lat, fix.lng)
        val dist = if (mill.latitude != null && mill.longitude != null) Geo.distanceM(at, LatLng(mill.latitude, mill.longitude)) else null
        val rings = Geo.rings(mill.boundary)
        val ok = (rings.isNotEmpty() && Geo.insideFence(rings, at, mill.bufferM)) || (dist != null && dist <= mill.bufferM)
        return ok to dist
    }

    // ---------------------------------------------------------------- lists
    suspend fun indentsFor(point: MPoint?, q: String): List<MIndent> = withContext(Dispatchers.IO) {
        val used = repo.db.outbox().usedIndents().toSet()
        val today = Time.today()
        val t = q.trim().lowercase()
        _masters.value.indents.filter { i ->
            i.name !in used && i.validFrom <= today && today <= i.validTo &&
                (point?.circle == null || i.circle == point.circle) &&
                (t.isEmpty() || i.name.lowercase().contains(t) || (i.growerName ?: "").lowercase().contains(t) ||
                    (i.cnic ?: "").replace("-", "").contains(t.replace("-", "")))
        }.take(60)
    }

    fun canon(no: String) = no.uppercase().filter { it.isLetterOrDigit() }
    fun vehicles(q: String): List<MVehicle> {
        val c = canon(q)
        return if (c.length < 2) emptyList() else _masters.value.vehicles.filter { canon(it.no).contains(c) }.take(8)
    }
    fun vehicle(no: String): MVehicle? = _masters.value.vehicles.firstOrNull { canon(it.no) == canon(no) }

    fun inTransit(q: String): List<MTransit> {
        val t = q.trim().uppercase(); val c = canon(q)
        return _masters.value.inTransit.filter { r ->
            t.isEmpty() || canon(r.vehicleNo).contains(c) || (r.indent ?: "").contains(t) || r.name.contains(t)
        }.take(50)
    }

    // ---------------------------------------------------------------- photos
    /**
     * Check a fresh photo: blurred, too dark / bright or faded photos are refused here (and again on the server).
     * A good one is stamped with the place, time and GPS and stored for the outbox. Returns the shot or the problems.
     */
    fun shot(jpeg: ByteArray, view: String, placeTitle: String, vehicleNo: String, fix: Fix?): Pair<Shot?, List<String>> {
        val r = _masters.value.rules
        val q = Photos.quality(jpeg)
        val problems = q.problems(r.minSharpness, r.minBrightness, r.maxBrightness, r.minContrast)
        if (problems.isNotEmpty()) return null to problems
        val now = Time.now()
        val stamped = Photos.stamp(jpeg, listOf("$placeTitle · $view · ${vehicleNo.ifBlank { "—" }}",
            "$now · ${fix?.let { "%.6f, %.6f ±%dm".format(it.lat, it.lng, it.accuracy.toInt()) } ?: "no GPS"}"))
        val file = Photos.save(ctx, stamped, "elp-${UUID.randomUUID()}.jpg")
        return Shot(view, file.absolutePath, q.sharpness, fix?.lat, fix?.lng, now) to emptyList()
    }

    private fun photosJson(shots: List<Shot>) = SugarJson.encodeToString(ListSerializer(PhotoRef.serializer()),
        shots.map { PhotoRef(it.view, it.path, it.lat, it.lng, it.takenAt, it.sharpness) })

    private fun serial() = Time.serial() + repo.deviceId.takeLast(2).uppercase()

    // ---------------------------------------------------------------- save
    fun register(place: Place, indent: MIndent?, vehicleNo: String, vehicleType: String?, driver: String, cnic: String, mobile: String,
        shots: List<Shot>, done: () -> Unit) = viewModelScope.launch(Dispatchers.IO) {
        val m = _masters.value
        val p = place.point ?: return@launch say("You are not at one of your loading points")
        val problems = buildList {
            if (!place.inside) add("Registration is allowed only inside ${p.title}")
            if (m.rules.requireIndent == 1 && indent == null) add("Choose the grower's indent")
            if (vehicleNo.isBlank()) add("Enter the vehicle number")
            vehicle(vehicleNo)?.let { if (it.blacklisted == 1) add("Vehicle ${it.no} is blacklisted") }
            val missing = m.rules.requiredViews.filter { v -> shots.none { it.view == v } }
            if (missing.isNotEmpty()) add("Photos missing: ${missing.joinToString()}")
        }
        if (problems.isNotEmpty()) return@launch say(problems.joinToString("\n"))
        val uuid = UUID.randomUUID().toString()
        val payload = buildJsonObject {
            put("point_type", p.type)
            if (p.type == "Loading Point") put("loading_point", p.name) else put("depot", p.name)
            indent?.let { put("indent", it.name) }
            put("vehicle_no", vehicleNo.trim().uppercase())
            vehicleType?.let { put("vehicle_type", it) }
            if (driver.isNotBlank()) put("driver_name", driver.trim())
            if (cnic.isNotBlank()) put("driver_cnic", cnic.trim())
            if (mobile.isNotBlank()) put("driver_mobile", mobile.trim())
            put("latitude", place.fix.lat); put("longitude", place.fix.lng); put("gps_accuracy_m", place.fix.accuracy.toDouble())
            put("registered_at", Time.now()); put("serial_no", serial())
            CellTower.id(ctx)?.let { put("cell_id", it) }
            m.season?.let { put("season", it) }
        }
        repo.db.outbox().save(LoadE(uuid, Kind.REG, vehicleNo.trim().uppercase(), "${p.title} · ${indent?.growerName ?: "no indent"}",
            indent?.name, payload.toString(), photosJson(shots)))
        syncNow()
        withContext(Dispatchers.Main) { done() }
    }

    fun arrive(t: MTransit, fix: Fix?, shots: List<Shot>, done: () -> Unit) = viewModelScope.launch(Dispatchers.IO) {
        if (shots.isEmpty()) return@launch say("Take the arrival photos at the gate")
        if (fix != null) {
            val (ok, dist) = atMill(fix)
            if (!ok) return@launch say("Arrival photos must be taken at the mill gate — you are ${dist?.toInt() ?: "?"} m away")
        }
        val uuid = UUID.randomUUID().toString()
        val payload = buildJsonObject {
            put("registration", t.name); put("vehicle_no", t.vehicleNo)
            fix?.let { put("latitude", it.lat); put("longitude", it.lng) }
            put("arrived_at", Time.now()); put("serial_no", serial())
            CellTower.id(ctx)?.let { put("cell_id", it) }
        }
        repo.db.outbox().save(LoadE(uuid, Kind.ARR, t.vehicleNo, "Gate · ${t.point ?: ""} · ${t.growerName ?: ""}", null,
            payload.toString(), photosJson(shots)))
        syncNow()
        withContext(Dispatchers.Main) { done() }
    }

    fun retry(e: LoadE) = viewModelScope.launch(Dispatchers.IO) { repo.db.outbox().retry(e.uuid); syncNow() }
    fun discard(e: LoadE) = viewModelScope.launch(Dispatchers.IO) { repo.db.outbox().delete(e.uuid) }

    fun cancelLoad(name: String, reason: String) = viewModelScope.launch(Dispatchers.IO) {
        runCatching { repo.api().cancel(name, reason) }.onSuccess { say("$name cancelled"); refreshMine() }
            .onFailure { say(ApiClient.errorMessage(it)) }
    }

    companion object { const val LOCK_AFTER_MS = 2 * 60 * 1000L }
}
