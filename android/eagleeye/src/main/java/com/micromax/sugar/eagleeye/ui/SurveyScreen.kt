package com.micromax.sugar.eagleeye.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddLocation
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.micromax.sugar.core.geo.Geo
import com.micromax.sugar.core.geo.LatLng
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.media.Photos
import com.micromax.sugar.eagleeye.data.GrowerE
import com.micromax.sugar.eagleeye.data.SurveyE
import com.micromax.sugar.eagleeye.data.SyncState
import com.micromax.sugar.eagleeye.data.Time
import com.micromax.sugar.eagleeye.data.VillageE
import kotlinx.coroutines.flow.flowOf
import java.io.File

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SurveyScreen(vm: AppViewModel, uuid: String, back: () -> Unit) {
    val context = LocalContext.current
    var s by remember { mutableStateOf<SurveyE?>(null) }
    LaunchedEffect(uuid) { s = vm.survey(uuid) ?: SurveyE(uuid = uuid, capturedAt = Time.now()) }
    val survey = s ?: return
    val readOnly = survey.state == SyncState.SYNCED || survey.state == SyncState.READY
    val corners = remember(survey.uuid) {
        mutableStateListOf<LatLng>().apply { addAll(Geo.rings(survey.polygon).firstOrNull()?.let { if (it.size > 1 && it.first() == it.last()) it.dropLast(1) else it } ?: emptyList()) }
    }
    val circles by vm.circles.collectAsState()
    val varieties by vm.varieties.collectAsState()
    val diseases by vm.diseases.collectAsState()
    val competitorMills by vm.competitorMills.collectAsState()
    val villagesFlow = remember(survey.circle) { survey.circle?.let { vm.repo.db.masters().villages(it) } ?: flowOf(emptyList()) }
    val villages by villagesFlow.collectAsState(initial = emptyList())
    var village by remember { mutableStateOf<VillageE?>(null) }
    LaunchedEffect(survey.village) { village = survey.village?.let { vm.village(it) } }
    val villageRings = remember(village) { Geo.rings(village?.polygon) }
    val photos by vm.photos(uuid).collectAsState(initial = emptyList())
    var tapToAdd by remember { mutableStateOf(true) }
    var bestAccuracy by remember { mutableStateOf(survey.gpsAccuracy) }
    var gpsBusy by remember { mutableStateOf(false) }
    var lastFix by remember { mutableStateOf<Fix?>(null) }
    val acres = Geo.acres(corners)
    val outside = corners.size >= 3 && villageRings.isNotEmpty() && !villageRings.any { Geo.contains(it, Geo.centroid(corners)) }

    // always build on the latest state: camera and GPS callbacks run after later recompositions
    fun update(f: (SurveyE) -> SurveyE) { s = f(s ?: survey) }
    fun current(): SurveyE = (s ?: survey).copy(polygon = if (corners.size >= 3) Geo.polygon(corners).toString() else null,
        measuredAcres = acres, gpsAccuracy = bestAccuracy)

    val gps = rememberGps { fix ->
        gpsBusy = false
        if (fix == null) { vm.say("No GPS fix"); return@rememberGps }
        lastFix = fix
        corners.add(LatLng(fix.lat, fix.lng))
        bestAccuracy = minOf(bestAccuracy ?: fix.accuracy.toDouble(), fix.accuracy.toDouble())
        vm.say("Corner ${corners.size} · ±${fix.accuracy.toInt()} m")
    }

    // grower photo: back camera, stamped with a quick GPS fix
    var growerCam by remember { mutableStateOf<File?>(null) }
    val photoGps = rememberGps { fix -> if (fix != null) update { it.copy(growerPhotoLat = fix.lat, growerPhotoLng = fix.lng) } }
    val growerCamera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = growerCam ?: return@rememberLauncherForActivityResult
        if (!ok) return@rememberLauncherForActivityResult
        val jpeg = runCatching { Photos.compress(context, Uri.fromFile(f), 1200, 80) }.getOrNull() ?: return@rememberLauncherForActivityResult
        f.delete()
        val path = vm.saveGrowerPhoto(jpeg, uuid)
        update { it.copy(growerPhotoPath = path, growerPhotoAt = Time.now(), growerPhotoLat = lastFix?.lat, growerPhotoLng = lastFix?.lng) }
        if (lastFix == null) photoGps(3)
    }
    fun takeGrowerPhoto() {
        val (f, u) = cameraUri(context, "grower-${System.currentTimeMillis()}.jpg")
        growerCam = f
        growerCamera.launch(u)
    }

    // photos with a sharpness check
    var camFile by remember { mutableStateOf<File?>(null) }
    var blurry by remember { mutableStateOf<ByteArray?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = camFile ?: return@rememberLauncherForActivityResult
        if (!ok) return@rememberLauncherForActivityResult
        val jpeg = runCatching { Photos.compress(context, Uri.fromFile(f)) }.getOrNull() ?: return@rememberLauncherForActivityResult
        f.delete()
        if (Photos.sharpness(jpeg) < Photos.BLUR_THRESHOLD) blurry = jpeg else vm.addPhoto(uuid, jpeg, lastFix, "Field")
    }
    fun takePhoto() {
        val (f, u) = cameraUri(context, "field-${System.currentTimeMillis()}.jpg")
        camFile = f
        camera.launch(u)
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text(if (survey.serverName != null) survey.serverName else "Field survey") },
            navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            actions = {
                if (survey.state == SyncState.DRAFT || survey.state == SyncState.ERROR) IconButton(onClick = { vm.deleteDraft(uuid); back() }) {
                    Icon(Icons.Default.Delete, "Delete draft")
                }
            })
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            survey.error?.let { Card { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp)) } }
            if (readOnly) Text(if (survey.state == SyncState.SYNCED) "Sent to the mill as ${survey.serverName}" else "Waiting for signal to send",
                color = CaneGreen, fontWeight = FontWeight.SemiBold)

            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("Company", "Competitor").forEachIndexed { i, v ->
                    SegmentedButton(selected = survey.surveyFor == v, onClick = { if (!readOnly) update { it.copy(surveyFor = v) } },
                        shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(if (v == "Company") "Our grower" else "Competitor cane") }
                }
            }

            Section("Location") {
                Dropdown("Circle", circles, circles.firstOrNull { it.name == survey.circle }, { "${it.code ?: ""} ${it.name}" },
                    { c -> update { it.copy(circle = c?.name, village = null) } }, Modifier.fillMaxWidth(), enabled = !readOnly)
                Dropdown("Village", villages, villages.firstOrNull { it.name == survey.village }, { it.title },
                    { v -> update { it.copy(village = v?.name) } }, Modifier.fillMaxWidth(), enabled = !readOnly && survey.circle != null)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(survey.murabbaNo ?: "", { v -> update { it.copy(murabbaNo = v) } }, label = { Text("Murabba") },
                        singleLine = true, readOnly = readOnly, modifier = Modifier.weight(1f))
                    OutlinedTextField(survey.killaNo ?: "", { v -> update { it.copy(killaNo = v) } }, label = { Text("Killa") },
                        singleLine = true, readOnly = readOnly, modifier = Modifier.weight(1f))
                }
            }

            if (survey.surveyFor == "Company") Section("Grower") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Passbook Grower" to "Passbook grower", "Non-Passbook Grower" to "No passbook (CNIC)").forEach { (v, label) ->
                        FilterChip(selected = survey.growerCategory == v, label = { Text(label) }, onClick = {
                            if (!readOnly) update { it.copy(growerCategory = v, grower = if (v == "Non-Passbook Grower") null else it.grower,
                                growerName = if (v == "Non-Passbook Grower") it.npName else it.growerName) }
                        })
                    }
                }
                if (survey.growerCategory == "Non-Passbook Grower") {
                    // digits only in the field; the dashes are a display mask, so the cursor never jumps while typing
                    OutlinedTextField(survey.npCnic?.filter(Char::isDigit) ?: "", { v -> update { it.copy(npCnic = v.filter(Char::isDigit).take(13)) } },
                        label = { Text("CNIC #####-#######-#") }, singleLine = true, readOnly = readOnly, modifier = Modifier.fillMaxWidth(),
                        visualTransformation = CnicMask, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(survey.npName ?: "", { v -> update { it.copy(npName = v, growerName = v) } }, label = { Text("Grower name") },
                        singleLine = true, readOnly = readOnly, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(survey.npFather ?: "", { v -> update { it.copy(npFather = v) } }, label = { Text("Father / husband") },
                            singleLine = true, readOnly = readOnly, modifier = Modifier.weight(1f))
                        OutlinedTextField(survey.npMobile ?: "", { v -> update { it.copy(npMobile = v.filter(Char::isDigit).take(11)) } }, label = { Text("Mobile") },
                            singleLine = true, readOnly = readOnly, modifier = Modifier.weight(1f))
                    }
                    Text("The grower is registered from this CNIC when the survey reaches the mill (or linked if already registered).",
                        style = MaterialTheme.typography.labelSmall)
                } else GrowerPicker(vm, survey, readOnly) { g ->
                    update { it.copy(grower = g.name.ifBlank { null }, growerName = g.growerName.ifBlank { null },
                        circle = it.circle ?: g.circle.ifBlank { null }, village = it.village ?: g.village.ifBlank { null }) }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(84.dp).clip(RoundedCornerShape(42.dp)).clickable(enabled = !readOnly) { takeGrowerPhoto() }) {
                        if (survey.growerPhotoPath != null) AsyncImage(model = File(survey.growerPhotoPath), contentDescription = "Grower photo",
                            contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        else OutlinedButton(onClick = { takeGrowerPhoto() }, enabled = !readOnly, modifier = Modifier.fillMaxSize()) {
                            Icon(Icons.Default.CameraAlt, "Grower photo")
                        }
                    }
                    Column {
                        Text(if (survey.growerPhotoPath != null) "Grower photo" else "Take the grower's photo", fontWeight = FontWeight.SemiBold)
                        Text(survey.growerPhotoLat?.let { "%.6f, %.6f".format(it, survey.growerPhotoLng ?: 0.0) } ?: "Location is stamped when taken",
                            style = MaterialTheme.typography.bodySmall)
                        if (survey.growerPhotoPath != null && !readOnly) Text("Tap to retake", style = MaterialTheme.typography.labelSmall)
                    }
                }
            } else Dropdown("Competitor mill", competitorMills, competitorMills.firstOrNull { it.name == survey.competitorMill },
                { (it.shortName?.let { s -> "$s · " } ?: "") + it.name }, { m -> update { it.copy(competitorMill = m?.name) } },
                Modifier.fillMaxWidth(), enabled = !readOnly)

            Section("Crop") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField("Total land", survey.totalAcres, { v -> update { it.copy(totalAcres = v) } }, Modifier.weight(1f), "ac")
                    NumberField("Empty", survey.emptyAcres, { v -> update { it.copy(emptyAcres = v) } }, Modifier.weight(1f), "ac")
                    NumberField("Cane", survey.cropAcres, { v -> update { it.copy(cropAcres = v) } }, Modifier.weight(1f), "ac")
                }
                Dropdown("Variety", varieties, varieties.firstOrNull { it.name == survey.variety }, { it.name },
                    { v -> update { it.copy(variety = v?.name) } }, Modifier.fillMaxWidth(), enabled = !readOnly)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Plant", "Ratoon").forEach { t ->
                        FilterChip(selected = survey.cropType == t, onClick = { if (!readOnly) update { it.copy(cropType = t) } }, label = { Text(t) })
                    }
                    if (survey.cropType == "Ratoon") NumberField("Ratoon no.", survey.ratoonNo?.toDouble(), { v -> update { it.copy(ratoonNo = v?.toInt()) } }, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Good", "Average", "Poor").forEach { c ->
                        FilterChip(selected = survey.condition == c, onClick = { if (!readOnly) update { it.copy(condition = c) } }, label = { Text(c) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Dropdown("Disease", diseases, diseases.firstOrNull { it.name == survey.disease }, { it.name },
                        { d -> update { it.copy(disease = d?.name, diseasePct = if (d == null) null else it.diseasePct) } },
                        Modifier.weight(2f), allowNone = true, enabled = !readOnly)
                    if (survey.disease != null) NumberField("Disease", survey.diseasePct, { v -> update { it.copy(diseasePct = v) } }, Modifier.weight(1f), "%")
                }
            }

            Section("Field boundary") {
                Text(if (corners.size >= 3) "${corners.size} corners · ${Geo.fmtAcres(acres)}" + (bestAccuracy?.let { " · GPS ±${it.toInt()} m" } ?: "")
                    else "Walk to each corner and press Add corner from GPS, or tap the corners on the map.",
                    style = MaterialTheme.typography.bodySmall)
                if (outside) Text("The field is outside the village boundary — check the village.", color = Warn, style = MaterialTheme.typography.bodySmall)
                Box(Modifier.fillMaxWidth().height(340.dp).clip(RoundedCornerShape(12.dp))) {
                    FieldMap(villageRings, corners.toList(), tapToAdd && !readOnly, { corners.add(it) }, { i, p -> corners[i] = p }, Modifier.fillMaxSize())
                }
                if (!readOnly) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { gpsBusy = true; gps(6) }, enabled = !gpsBusy) {
                        Icon(Icons.Default.AddLocation, null); Text(if (gpsBusy) " Reading GPS…" else " Add corner from GPS")
                    }
                    FilterChip(selected = tapToAdd, onClick = { tapToAdd = !tapToAdd }, label = { Text("Tap to add") },
                        leadingIcon = { Icon(Icons.Default.TouchApp, null, Modifier.size(18.dp)) })
                    OutlinedButton(onClick = { if (corners.isNotEmpty()) corners.removeAt(corners.lastIndex) }, enabled = corners.isNotEmpty()) {
                        Icon(Icons.AutoMirrored.Filled.Undo, null); Text(" Undo")
                    }
                    TextButton(onClick = { corners.clear() }, enabled = corners.isNotEmpty()) { Text("Clear") }
                }
            }

            Section("Photos") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    photos.forEach { p ->
                        Box(Modifier.size(96.dp).clip(RoundedCornerShape(10.dp)).clickable(enabled = !readOnly) { vm.deletePhoto(p) }) {
                            AsyncImage(model = File(p.path), contentDescription = p.caption, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        }
                    }
                    if (!readOnly) OutlinedButton(onClick = { takePhoto() }, modifier = Modifier.size(96.dp)) { Icon(Icons.Default.CameraAlt, "Take photo") }
                }
                if (!readOnly && photos.isNotEmpty()) Text("Tap a photo to remove it.", style = MaterialTheme.typography.labelSmall)
            }

            OutlinedTextField(survey.remarks ?: "", { v -> update { it.copy(remarks = v) } }, label = { Text("Remarks") }, readOnly = readOnly,
                modifier = Modifier.fillMaxWidth(), minLines = 2)

            if (!readOnly) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { vm.save(current(), submit = false, onDone = back) }, modifier = Modifier.weight(1f)) { Text("Save draft") }
                Button(onClick = { vm.save(current(), submit = true, onDone = back) }, modifier = Modifier.weight(1f)) { Text("Submit") }
            }
        }
    }

    blurry?.let { jpeg ->
        AlertDialog(onDismissRequest = { blurry = null },
            title = { Text("Photo looks blurry") },
            text = { Text("Hold the phone still and retake it, or keep this one.") },
            confirmButton = { TextButton(onClick = { blurry = null; takePhoto() }) { Text("Retake") } },
            dismissButton = { TextButton(onClick = { vm.addPhoto(uuid, jpeg, lastFix, "Field"); blurry = null }) { Text("Keep") } })
    }
}

/** Shows 13 CNIC digits as #####-#######-# without changing what is stored. */
private object CnicMask : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val d = text.text
        val out = buildString { d.forEachIndexed { i, c -> if (i == 5 || i == 12) append('-'); append(c) } }
        val map = object : OffsetMapping {
            override fun originalToTransformed(offset: Int) = offset + (if (offset > 5) 1 else 0) + (if (offset > 12) 1 else 0)
            override fun transformedToOriginal(offset: Int) = (offset - (if (offset > 5) 1 else 0) - (if (offset > 13) 1 else 0)).coerceIn(0, d.length)
        }
        return TransformedText(AnnotatedString(out), map)
    }
}

@Composable
private fun GrowerPicker(vm: AppViewModel, survey: SurveyE, readOnly: Boolean, onPick: (GrowerE) -> Unit) {
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<GrowerE>>(emptyList()) }
    LaunchedEffect(q, survey.circle) { results = if (q.length >= 2) vm.searchGrowers(q, survey.circle) else emptyList() }
    if (survey.grower != null) Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(survey.growerName ?: "", fontWeight = FontWeight.SemiBold)
                Text(survey.grower, style = MaterialTheme.typography.bodySmall)
            }
            if (!readOnly) TextButton(onClick = { q = ""; onPick(GrowerE("", "", null, null, null, null, survey.circle ?: "", survey.village ?: "")) }) { Text("Change") }
        }
    }
    if (!readOnly && survey.grower == null) {
        OutlinedTextField(q, { q = it }, label = { Text("Search name, CNIC, ID or passbook") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        results.forEach { g ->
            Card(Modifier.fillMaxWidth().clickable { onPick(g); q = "" }) {
                Column(Modifier.padding(10.dp)) {
                    Text(g.growerName, fontWeight = FontWeight.SemiBold)
                    Text("${g.name} · ${g.cnic ?: ""} · s/o ${g.fatherName ?: "—"}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
