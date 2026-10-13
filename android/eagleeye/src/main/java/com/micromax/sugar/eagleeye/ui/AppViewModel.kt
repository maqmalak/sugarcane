package com.micromax.sugar.eagleeye.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.micromax.sugar.core.geo.Geo
import com.micromax.sugar.core.geo.LatLng
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.media.Photos
import com.micromax.sugar.core.net.ApiClient
import com.micromax.sugar.core.security.Pin
import com.micromax.sugar.eagleeye.data.AttendanceE
import com.micromax.sugar.eagleeye.data.PhotoE
import com.micromax.sugar.eagleeye.data.Repository
import com.micromax.sugar.eagleeye.data.SurveyE
import com.micromax.sugar.eagleeye.data.SyncState
import com.micromax.sugar.eagleeye.data.Time
import com.micromax.sugar.eagleeye.sync.SyncWorker
import com.micromax.sugar.eagleeye.track.TrackingService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val repo = Repository(app)
    private val db = repo.db
    private val ctx: Context get() = getApplication()

    private val _locked = MutableStateFlow(repo.session.pinHash != null)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()
    private var backgroundSince = 0L

    val surveys = db.outbox().surveys().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val pendingSurveys = db.outbox().pendingSurveys().stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val pendingPoints = db.outbox().pendingLocations().stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val growerCount = db.masters().growerCount().stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    val targets = db.masters().targets().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val circles = db.masters().circles().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val varieties = db.masters().varieties().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val diseases = db.masters().diseases().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val competitorMills = db.masters().competitorMillList().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val today = db.outbox().attendanceFlow(Time.today()).stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val syncRunning = WorkManager.getInstance(app).getWorkInfosForUniqueWorkFlow(SyncWorker.NOW)
        .map { list -> list.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val syncResult = WorkManager.getInstance(app).getWorkInfosForUniqueWorkFlow(SyncWorker.NOW)
        .map { list -> list.firstOrNull { it.state.isFinished }?.outputData?.getString(SyncWorker.KEY_SUMMARY) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun say(text: String?) { _message.value = text }

    // ---------------------------------------------------------------- lock
    fun onBackground() { backgroundSince = System.currentTimeMillis() }
    fun onForeground() {
        if (repo.session.pinHash != null && backgroundSince > 0 && System.currentTimeMillis() - backgroundSince > LOCK_AFTER_MS) _locked.value = true
    }
    fun unlock(pin: String): Boolean {
        val ok = Pin.matches(pin, repo.session.pinSalt, repo.session.pinHash)
        if (ok) _locked.value = false
        return ok
    }
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
            repo.pullMasters(full = true)
            "Signed in as ${r.fullName ?: r.user}"
        }.recoverCatching { throw IllegalStateException(ApiClient.errorMessage(it)) }
    }

    fun syncNow(full: Boolean = false) = SyncWorker.now(ctx, full)

    fun signOut() {
        TrackingService.stop(ctx)
        repo.signOut()
    }

    // ---------------------------------------------------------------- attendance
    /** Inside the assigned circles' boundaries (plus the geofence radius)? Without targets the server decides. */
    suspend fun insideFence(fix: Fix): Boolean = withContext(Dispatchers.IO) {
        val circles = db.masters().targetList().mapNotNull { it.circle }
        if (circles.isEmpty()) return@withContext true
        val rings = db.masters().circlesNamed(circles).flatMap { Geo.rings(it.polygon) }
        rings.isEmpty() || Geo.insideFence(rings, LatLng(fix.lat, fix.lng), repo.settings.geofenceRadiusM.toDouble())
    }

    fun checkIn(fix: Fix, selfie: ByteArray?) = viewModelScope.launch(Dispatchers.IO) {
        val uuid = UUID.randomUUID().toString()
        val path = selfie?.let { Photos.save(ctx, it, "selfie-$uuid-in.jpg").absolutePath }
        db.outbox().attendance(AttendanceE(uuid, Time.today(), Time.now(), fix.lat, fix.lng, fix.accuracy, path, insideFence(fix)))
        TrackingService.start(ctx)
        syncNow()
    }

    fun checkOut(fix: Fix, selfie: ByteArray?) = viewModelScope.launch(Dispatchers.IO) {
        val a = db.outbox().openAttendance() ?: return@launch
        val path = selfie?.let { Photos.save(ctx, it, "selfie-${a.uuid}-out.jpg").absolutePath }
        db.outbox().attendance(a.copy(timeOut = Time.now(), latOut = fix.lat, lngOut = fix.lng, accOut = fix.accuracy, selfieOut = path,
            insideOut = insideFence(fix), sentOut = false))
        TrackingService.stop(ctx)
        syncNow()
    }

    fun resumeTracking() = viewModelScope.launch(Dispatchers.IO) {
        if (db.outbox().openAttendance()?.date == Time.today()) TrackingService.start(ctx)
    }

    // ---------------------------------------------------------------- surveys
    suspend fun survey(uuid: String): SurveyE? = withContext(Dispatchers.IO) { db.outbox().survey(uuid) }
    fun newSurveyId(): String = UUID.randomUUID().toString()
    fun photos(uuid: String) = db.outbox().photos(uuid)
    suspend fun villages(circle: String) = db.masters().villages(circle)
    suspend fun village(name: String) = withContext(Dispatchers.IO) { db.masters().village(name) }
    suspend fun searchGrowers(q: String, circle: String?) = withContext(Dispatchers.IO) { db.masters().searchGrowers(q, circle) }

    fun save(s: SurveyE, submit: Boolean, onDone: () -> Unit) = viewModelScope.launch(Dispatchers.IO) {
        val problems = if (submit) problems(s) else emptyList()
        if (problems.isNotEmpty()) { say(problems.joinToString("\n")); return@launch }
        db.outbox().save(s.copy(state = if (submit) SyncState.READY else SyncState.DRAFT, error = null, updatedAt = System.currentTimeMillis()))
        if (submit) syncNow()
        withContext(Dispatchers.Main) { onDone() }
    }

    fun deleteDraft(uuid: String) = viewModelScope.launch(Dispatchers.IO) { db.outbox().deleteDraft(uuid) }

    private fun problems(s: SurveyE): List<String> = buildList {
        if (s.circle == null || s.village == null) add("Choose the circle and village")
        if (s.surveyFor == "Company" && s.grower == null) {
            if (s.growerCategory != "Non-Passbook Grower") add("Choose the grower, or switch to No passbook and enter the CNIC")
            else {
                if (s.npCnic?.filter(Char::isDigit)?.length != 13) add("Enter the grower's 13-digit CNIC")
                if (s.npName.isNullOrBlank()) add("Enter the grower's name")
            }
        }
        if (s.surveyFor == "Competitor" && s.competitorMill.isNullOrBlank()) add("Choose the competitor mill")
        if (s.variety == null) add("Choose the variety")
        if (s.polygon == null || s.measuredAcres <= 0) add("Capture the field boundary (at least 3 corners)")
        val total = s.totalAcres ?: 0.0
        if (total > 0 && (s.cropAcres ?: 0.0) + (s.emptyAcres ?: 0.0) > total + 0.05) add("Cane + empty land is more than the total land")
    }

    fun addPhoto(surveyUuid: String, jpeg: ByteArray, fix: Fix?, caption: String?) = viewModelScope.launch(Dispatchers.IO) {
        val uuid = UUID.randomUUID().toString()
        val file = Photos.save(ctx, jpeg, "survey-$uuid.jpg")
        db.outbox().photo(PhotoE(uuid, surveyUuid, file.absolutePath, caption, fix?.lat, fix?.lng, Time.now(), Photos.sharpness(jpeg)))
    }

    /** The grower's photo, kept as a file next to the survey until it is sent. */
    fun saveGrowerPhoto(jpeg: ByteArray, surveyUuid: String): String =
        Photos.save(ctx, jpeg, "grower-$surveyUuid-${System.currentTimeMillis()}.jpg").absolutePath

    fun deletePhoto(p: PhotoE) = viewModelScope.launch(Dispatchers.IO) {
        db.outbox().deletePhoto(p.uuid)
        java.io.File(p.path).delete()
    }

    companion object {
        const val LOCK_AFTER_MS = 2 * 60 * 1000L
    }
}
