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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.micromax.sugar.elp.data.MIndent

private val EXTRA_VIEWS = listOf("Body Right", "Front", "Back", "Chassis No.", "LP Board", "Load")

/**
 * Register a loaded vehicle at a loading point / depot: GPS first (only inside one of the user's points), then the
 * grower's indent, the vehicle and driver, and the required photos — each checked for quality and stamped.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(vm: AppViewModel, back: () -> Unit) {
    val m by vm.masters.collectAsState()
    val message by vm.message.collectAsState()
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(message) { message?.let { snack.showSnackbar(it); vm.say(null) } }

    var place by remember { mutableStateOf<Place?>(null) }
    var locating by remember { mutableStateOf(false) }
    val gps = rememberGps { fix ->
        locating = false
        if (fix == null) vm.say("No GPS fix — turn on location and stand in the open") else place = vm.locate(fix)
    }
    LaunchedEffect(Unit) { locating = true; gps(8) }

    var q by remember { mutableStateOf("") }
    var indents by remember { mutableStateOf<List<MIndent>>(emptyList()) }
    var indent by remember { mutableStateOf<MIndent?>(null) }
    LaunchedEffect(q, place) { indents = vm.indentsFor(place?.point, q) }

    var vehicleNo by remember { mutableStateOf("") }
    var vehicleType by remember { mutableStateOf<String?>(null) }
    var driver by remember { mutableStateOf("") }
    var cnic by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    val shots = remember { mutableStateListOf<Shot>() }
    var saving by remember { mutableStateOf(false) }
    val inside = place?.inside == true
    val title = place?.point?.title ?: "Loading point"

    Scaffold(
        topBar = { TopAppBar(title = { Text("Register vehicle") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }) },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        Column(Modifier.padding(pad).imePadding().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // 1. where
            Card(colors = CardDefaults.cardColors(containerColor = if (inside) Good.copy(alpha = .14f) else if (place != null) Bad.copy(alpha = .12f)
                else MaterialTheme.colorScheme.surfaceVariant)) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (inside) Icons.Default.GpsFixed else Icons.Default.Warning, null, tint = if (inside) Good else Warn)
                    Spacer(Modifier.size(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(when {
                            locating -> "Getting GPS…"
                            place == null -> "Location needed"
                            inside -> "At ${place!!.point!!.title}"
                            place!!.point != null -> "Outside ${place!!.point!!.title} — ${place!!.distanceM?.toInt() ?: "?"} m away"
                            else -> "You have no loading point assigned"
                        }, fontWeight = FontWeight.SemiBold)
                        place?.fix?.let { Text("%.6f, %.6f · ±%d m".format(it.lat, it.lng, it.accuracy.toInt()), style = MaterialTheme.typography.labelSmall) }
                        if (place != null && !inside) Text("Vehicles can be registered only inside the loading point.", style = MaterialTheme.typography.labelSmall)
                    }
                    OutlinedButton(onClick = { locating = true; gps(8) }, enabled = !locating) { Text("Retry") }
                }
            }
            if (!inside) return@Column

            // 2. indent
            Section("Indent") {
                if (indent == null) {
                    OutlinedTextField(q, { q = it }, label = { Text("Search indent no., grower or CNIC") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    indents.take(8).forEach { i ->
                        Column(Modifier.fillMaxWidth().clickable { indent = i }.padding(vertical = 6.dp)) {
                            Text("${i.name} · ${i.growerName ?: ""}", fontWeight = FontWeight.SemiBold)
                            Text("${i.village ?: ""} · valid ${i.validFrom} – ${i.validTo} · ${i.loadMaund.toInt()} md", style = MaterialTheme.typography.labelSmall)
                        }
                        HorizontalDivider()
                    }
                    if (indents.isEmpty()) Text("No indent valid today for this point${if (q.isNotBlank()) " matches \"$q\"" else ""}.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${indent!!.name} · ${indent!!.growerName}", fontWeight = FontWeight.SemiBold)
                            Text("${indent!!.fatherName?.let { "s/o $it · " } ?: ""}${indent!!.cnic ?: ""}", style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedButton(onClick = { indent = null }) { Text("Change") }
                    }
                }
            }

            // 3. vehicle & driver
            Section("Vehicle & driver") {
                OutlinedTextField(vehicleNo, { v ->
                    vehicleNo = v.uppercase()
                    vm.vehicle(vehicleNo)?.let { known ->
                        if (vehicleType == null) vehicleType = known.type
                        if (driver.isBlank()) driver = known.driverName ?: ""
                        if (cnic.isBlank()) cnic = known.driverCnic ?: ""
                        if (mobile.isBlank()) mobile = known.driverMobile ?: ""
                    }
                }, label = { Text("Vehicle number *") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters))
                vm.vehicles(vehicleNo).filter { vm.canon(it.no) != vm.canon(vehicleNo) }.take(4).forEach { v ->
                    Text("${v.no}${if (v.blacklisted == 1) " · BLACKLISTED" else ""} · ${v.type ?: ""}", modifier = Modifier.clickable {
                        vehicleNo = v.no; vehicleType = v.type; driver = v.driverName ?: driver; cnic = v.driverCnic ?: cnic; mobile = v.driverMobile ?: mobile
                    }.padding(vertical = 4.dp), color = if (v.blacklisted == 1) Bad else MaterialTheme.colorScheme.primary)
                }
                vm.vehicle(vehicleNo)?.takeIf { it.blacklisted == 1 }?.let { Text("This vehicle is blacklisted — it can't be registered.", color = Bad) }
                Dropdown("Vehicle type", m.vehicleTypes, vehicleType, { it }, { vehicleType = it }, Modifier.fillMaxWidth())
                OutlinedTextField(driver, { driver = it }, label = { Text("Driver name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(cnic, { cnic = it.filter { c -> c.isDigit() || c == '-' }.take(15) }, label = { Text("Driver CNIC") }, singleLine = true,
                        modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(mobile, { mobile = it.filter(Char::isDigit).take(11) }, label = { Text("Mobile") }, singleLine = true,
                        modifier = Modifier.weight(1f), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                }
            }

            // 4. photos
            Section("Snapshots") {
                Text("Required: ${m.rules.requiredViews.joinToString()}. Blurred, dark or faded photos are cancelled automatically.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.size(6.dp))
                ShotGrid(vm, m.rules.requiredViews + EXTRA_VIEWS.filter { it !in m.rules.requiredViews }, m.rules.requiredViews.toSet(), shots,
                    title, vehicleNo, place?.fix) { s -> shots.removeAll { it.view == s.view }; shots.add(s) }
            }

            Button(enabled = !saving, modifier = Modifier.fillMaxWidth(), onClick = {
                saving = true
                vm.register(place!!, indent, vehicleNo, vehicleType, driver, cnic, mobile, shots.toList()) { back() }
                saving = false
            }) { Text("Save & send") }
            Text("Saved registrations go to the mill as soon as there is internet — nothing is lost offline.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
