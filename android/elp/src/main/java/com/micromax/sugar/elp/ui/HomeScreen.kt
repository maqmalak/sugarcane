package com.micromax.sugar.elp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.micromax.sugar.elp.data.Kind
import com.micromax.sugar.elp.data.State

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: AppViewModel, register: () -> Unit, gate: () -> Unit, settings: () -> Unit) {
    val m by vm.masters.collectAsState()
    val outbox by vm.outbox.collectAsState()
    val mine by vm.mine.collectAsState()
    val ready by vm.ready.collectAsState()
    val syncing by vm.syncRunning.collectAsState()
    val syncResult by vm.syncResult.collectAsState()
    val message by vm.message.collectAsState()
    val snack = remember { SnackbarHostState() }
    var tab by remember { mutableStateOf("waiting") }
    LaunchedEffect(Unit) { vm.refreshMine() }
    LaunchedEffect(syncing) { if (!syncing) vm.refreshMine() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.say(null) } }

    Scaffold(
        topBar = {
            TopAppBar(title = { Column { Text("ELP", fontWeight = FontWeight.Bold); Text(vm.repo.session.fullName ?: "", style = MaterialTheme.typography.labelSmall) } },
                actions = {
                    IconButton(onClick = { vm.syncNow() }) { Icon(if (syncing) Icons.Default.Sync else Icons.Default.Refresh, "Sync") }
                    IconButton(onClick = settings) { Icon(Icons.Default.Settings, "Settings") }
                })
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        LazyColumn(Modifier.padding(pad).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(if (m.points.isEmpty() && !m.canGate) "You are not assigned to a loading point or the gate yet — ask the Cane Manager."
                    else m.points.joinToString(" · ") { it.title }.ifBlank { "Gate" },
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (m.canRegister) item {
                Button(onClick = register, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Warehouse, null); Spacer(Modifier.size(8.dp)); Text("Register a loaded vehicle")
                }
            }
            if (m.canGate) item {
                OutlinedButton(onClick = gate, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.LocalShipping, null); Spacer(Modifier.size(8.dp)); Text("Gate arrival (${m.inTransit.size} on the way)")
                }
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(if (ready > 0) "$ready waiting to be sent" else "Everything sent", fontWeight = FontWeight.SemiBold)
                            Text("Last sync ${vm.repo.session.lastSync ?: "never"}${syncResult?.let { " · $it" } ?: ""}",
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        TextButton(onClick = { vm.syncNow() }) { Text(if (syncing) "Syncing…" else "Sync now") }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("waiting" to "Not sent", "transit" to "On the way", "arrived" to "Arrived", "rejected" to "Rejected").forEach { (k, l) ->
                        FilterChip(selected = tab == k, onClick = { tab = k }, label = { Text(l) })
                    }
                }
            }
            when (tab) {
                "waiting" -> {
                    val list = outbox.filter { it.state != State.SENT }
                    if (list.isEmpty()) item { Empty("Nothing waiting on this phone.") }
                    items(list, key = { it.uuid }) { e ->
                        LoadCard(e.title, (if (e.kind == Kind.ARR) "Arrival · " else "") + e.subtitle,
                            if (e.state == State.ERROR) "Refused: ${e.error}" else "Waiting for internet", e.state == State.ERROR) {
                            if (e.state == State.ERROR) {
                                TextButton(onClick = { vm.retry(e) }) { Text("Send again") }
                                TextButton(onClick = { vm.discard(e) }) { Text("Discard") }
                            }
                        }
                    }
                }
                else -> {
                    val list = mine.filter {
                        when (tab) { "transit" -> it.status == "In Transit"; "arrived" -> it.status in listOf("Arrived", "Accepted"); else -> it.status == "Rejected" }
                    }
                    if (list.isEmpty()) item { Empty("No loads here in the last 3 days.") }
                    items(list, key = { it.name }) { r ->
                        LoadCard(r.vehicleNo, "${r.point ?: ""} · ${r.growerName ?: "—"} · ${r.name}",
                            when (r.status) {
                                "In Transit" -> "Registered ${r.registeredAt ?: ""}${if (r.overdue) " · OVERDUE" else ""}"
                                "Arrived" -> "At the gate ${r.arrivedAt ?: ""} · waiting for the audit team"
                                "Accepted" -> "Accepted · LP verified"
                                else -> "Rejected: ${r.rejectReason ?: ""}"
                            }, r.status == "Rejected" || r.overdue) {
                            if (r.status == "In Transit") TextButton(onClick = { vm.cancelLoad(r.name, "Cancelled at the loading point") }) { Text("Cancel") }
                        }
                    }
                }
            }
            item { Spacer(Modifier.size(24.dp)) }
        }
    }
}

@Composable
private fun Empty(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 18.dp))
}

@Composable
private fun LoadCard(title: String, subtitle: String, status: String, bad: Boolean, actions: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AssistChip(onClick = {}, label = { Text(title, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold) })
            }
            Text(subtitle, style = MaterialTheme.typography.bodySmall)
            Text(status, style = MaterialTheme.typography.labelMedium, color = if (bad) Bad else MaterialTheme.colorScheme.onSurfaceVariant)
            Row { actions() }
        }
    }
}
