package com.micromax.sugar.eagleeye.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.media.Photos
import com.micromax.sugar.eagleeye.data.AttendanceE
import com.micromax.sugar.eagleeye.data.SurveyE
import com.micromax.sugar.eagleeye.data.SyncState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: AppViewModel, openSurvey: (String) -> Unit, openSettings: () -> Unit) {
    val surveys by vm.surveys.collectAsState()
    val pending by vm.pendingSurveys.collectAsState()
    val points by vm.pendingPoints.collectAsState()
    val syncing by vm.syncRunning.collectAsState()
    val result by vm.syncResult.collectAsState()
    val message by vm.message.collectAsState()
    val growers by vm.growerCount.collectAsState()
    val snack = remember { SnackbarHostState() }
    val notify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) { if (Build.VERSION.SDK_INT >= 33) notify.launch(Manifest.permission.POST_NOTIFICATIONS) }
    LaunchedEffect(result) { result?.let { snack.showSnackbar(it) } }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.say(null) } }

    Scaffold(
        topBar = {
            TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = Navy, titleContentColor = Color.White, actionIconContentColor = Color.White),
                title = { Column { Text("EagleEye", fontWeight = FontWeight.SemiBold); Text(vm.repo.session.fullName ?: "", style = MaterialTheme.typography.labelSmall) } },
                actions = {
                    if (syncing) CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
                    else BadgedBox(badge = { if (pending > 0) Badge { Text("$pending") } else if (points > 0) Badge() }) {
                        IconButton(onClick = { vm.syncNow() }) { Icon(Icons.Default.CloudUpload, "Sync now") }
                    }
                    IconButton(onClick = openSettings) { Icon(Icons.Default.Settings, "Settings") }
                })
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { openSurvey(vm.newSurveyId()) }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("New survey") })
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        LazyColumn(contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = pad.calculateTopPadding() + 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { AttendanceCard(vm) }
            item { TargetCard(vm, surveys) }
            if (growers == 0) item {
                Card { Text("No growers downloaded yet — tap the cloud button when you have signal.", Modifier.padding(14.dp)) }
            }
            item {
                Text("My surveys · ${surveys.size}" + if (points > 0) " · $points GPS points waiting" else "",
                    style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
            }
            items(surveys, key = { it.uuid }) { s -> SurveyRow(s) { openSurvey(s.uuid) } }
        }
    }
}

@Composable
private fun SurveyRow(s: SurveyE, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(s.growerName ?: s.competitorMill ?: "New field", fontWeight = FontWeight.SemiBold)
                Text("${s.village ?: "—"} · ${s.variety ?: "—"} · ${"%.2f".format(s.measuredAcres)} acres",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                s.overlapStatus?.takeIf { it == "Under Review" || it == "Rejected" }?.let {
                    Text("Overlap: $it", color = Warn, style = MaterialTheme.typography.bodySmall)
                }
            }
            val (label, colour) = when (s.state) {
                SyncState.SYNCED -> (s.serverName ?: "Synced") to CaneGreen
                SyncState.READY -> "Waiting to send" to MaterialTheme.colorScheme.secondary
                SyncState.ERROR -> "Needs fixing" to Bad
                else -> "Draft" to MaterialTheme.colorScheme.onSurfaceVariant
            }
            AssistChip(onClick = onClick, label = { Text(label, color = colour) })
        }
    }
}

@Composable
private fun TargetCard(vm: AppViewModel, surveys: List<SurveyE>) {
    val targets by vm.targets.collectAsState()
    if (targets.isEmpty()) return
    val acres = targets.sumOf { it.targetAcres }
    val fields = targets.sumOf { it.targetSurveys }
    val done = surveys.filter { it.state != SyncState.DRAFT && it.surveyFor == "Company" }
    val doneAcres = done.sumOf { it.measuredAcres }
    Card {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Season target · ${targets.mapNotNull { it.circle }.joinToString()}", style = MaterialTheme.typography.titleSmall)
            Text("${"%.1f".format(doneAcres)} of ${"%.0f".format(acres)} acres · ${done.size} of $fields fields (this phone)")
            LinearProgressIndicator(progress = { if (acres > 0) (doneAcres / acres).toFloat().coerceIn(0f, 1f) else 0f }, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun AttendanceCard(vm: AppViewModel) {
    val context = LocalContext.current
    val today by vm.today.collectAsState()
    var busy by remember { mutableStateOf<String?>(null) }
    var selfie by remember { mutableStateOf<ByteArray?>(null) }
    var checkingOut by remember { mutableStateOf(false) }
    var lastFix by remember { mutableStateOf<Fix?>(null) }
    val gps = rememberGps { fix ->
        lastFix = fix
        if (fix == null) { busy = null; vm.say("No GPS fix — go outside and try again"); return@rememberGps }
        if (checkingOut) vm.checkOut(fix, selfie) else vm.checkIn(fix, selfie)
        busy = null
    }
    var camFile by remember { mutableStateOf<java.io.File?>(null) }
    val camera = rememberLauncherForActivityResult(TakeSelfie()) { ok ->
        val f = camFile
        selfie = if (ok && f != null) runCatching { Photos.compress(context, android.net.Uri.fromFile(f), 900, 75) }.getOrNull() else null
        busy = "Reading GPS…"
        gps(8)
    }
    fun start(out: Boolean) {
        checkingOut = out
        busy = "Selfie…"
        val (f, uri) = cameraUri(context, "selfie-${System.currentTimeMillis()}.jpg")
        camFile = f
        camera.launch(uri)
    }
    val colours = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f))
    Card(colors = colours) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Attendance · today", style = MaterialTheme.typography.titleSmall)
            val a: AttendanceE? = today
            when {
                a == null -> {
                    Text("Not checked in. Check-in takes a selfie and your GPS position; your route is recorded until you check out.",
                        style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { start(false) }, enabled = busy == null) {
                        Icon(Icons.AutoMirrored.Filled.Login, null); Spacer(Modifier.width(6.dp)); Text(busy ?: "Check in")
                    }
                }
                a.timeOut == null -> {
                    Text("Checked in at ${a.timeIn.substring(11, 16)}" + if (a.insideIn) " · inside your area" else " · OUTSIDE your circle",
                        color = if (a.insideIn) CaneGreen else Bad)
                    Button(onClick = { start(true) }, enabled = busy == null) {
                        Icon(Icons.AutoMirrored.Filled.Logout, null); Spacer(Modifier.width(6.dp)); Text(busy ?: "Check out")
                    }
                }
                else -> Text("Worked ${a.timeIn.substring(11, 16)} – ${a.timeOut.substring(11, 16)}" + if (a.sentOut) " · sent" else " · waiting to send")
            }
            lastFix?.let { Text("GPS ±${it.accuracy.toInt()} m (${it.readings} readings)", style = MaterialTheme.typography.labelSmall) }
            a?.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
