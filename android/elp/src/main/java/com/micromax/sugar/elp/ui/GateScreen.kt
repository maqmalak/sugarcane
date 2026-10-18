package com.micromax.sugar.elp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.elp.data.MTransit

private val GATE_VIEWS = listOf("Number Plate", "Driver", "Body Left", "Body Right", "Front", "Load")

/** Gate arrival: at the mill, find the vehicle on its way, take the arrival photos; the audit team compares and decides. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GateScreen(vm: AppViewModel, back: () -> Unit) {
    val message by vm.message.collectAsState()
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.say(null) } }
    var fix by remember { mutableStateOf<Fix?>(null) }
    var locating by remember { mutableStateOf(false) }
    val gps = rememberGps { f -> locating = false; fix = f; if (f == null) vm.say("No GPS fix") }
    LaunchedEffect(Unit) { locating = true; gps(6) }
    val (atMill, dist) = fix?.let { vm.atMill(it) } ?: (false to null)

    var q by remember { mutableStateOf("") }
    var load by remember { mutableStateOf<MTransit?>(null) }
    val shots = remember { mutableStateListOf<Shot>() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Gate arrival") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }) },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        Column(Modifier.padding(pad).imePadding().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = if (atMill) Good.copy(alpha = .14f) else Bad.copy(alpha = .12f))) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (atMill) Icons.Default.GpsFixed else Icons.Default.Warning, null, tint = if (atMill) Good else Warn)
                    Spacer(Modifier.size(8.dp))
                    Text(when {
                        locating -> "Getting GPS…"
                        fix == null -> "Location needed"
                        atMill -> "At the mill gate"
                        else -> "Not at the mill — ${dist?.toInt() ?: "?"} m away"
                    }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = { locating = true; gps(6) }, enabled = !locating) { Text("Retry") }
                }
            }
            if (!atMill) return@Column

            Section("Vehicle") {
                if (load == null) {
                    OutlinedTextField(q, { q = it.uppercase() }, label = { Text("Vehicle no. or indent no.") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters))
                    vm.inTransit(q).take(10).forEach { t ->
                        Column(Modifier.fillMaxWidth().clickable { load = t; shots.clear() }.padding(vertical = 6.dp)) {
                            Text("${t.vehicleNo} · ${t.point ?: ""}", fontWeight = FontWeight.SemiBold)
                            Text("${t.growerName ?: "—"} · ${t.indent ?: ""} · left ${t.registeredAt}", style = MaterialTheme.typography.labelSmall)
                        }
                        HorizontalDivider()
                    }
                    Text("Not in the list? It was not registered at a loading point — tell the audit team.", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${load!!.vehicleNo} · ${load!!.name}", fontWeight = FontWeight.SemiBold)
                            Text("${load!!.point ?: ""} · ${load!!.growerName ?: ""} · expected ${load!!.expected ?: "—"}", style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedButton(onClick = { load = null }) { Text("Change") }
                    }
                }
            }
            if (load != null) {
                Section("Arrival snapshots") {
                    Text("Take the same views as at the loading point, so the audit team can compare them.", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.size(6.dp))
                    ShotGrid(vm, GATE_VIEWS, setOf("Number Plate"), shots, "Mill gate", load!!.vehicleNo, fix) { s -> shots.removeAll { it.view == s.view }; shots.add(s) }
                }
                Button(enabled = shots.any { it.view == "Number Plate" }, modifier = Modifier.fillMaxWidth(),
                    onClick = { vm.arrive(load!!, fix, shots.toList()) { back() } }) { Text("Record arrival & send") }
            }
        }
    }
}
