package com.micromax.sugar.eagleeye.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.location.Locator
import kotlinx.coroutines.launch
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Dropdown(label: String, options: List<T>, selected: T?, text: (T) -> String, onSelect: (T?) -> Unit,
    modifier: Modifier = Modifier, allowNone: Boolean = false, enabled: Boolean = true) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { if (enabled) open = it }, modifier = modifier) {
        OutlinedTextField(value = selected?.let(text) ?: "", onValueChange = {}, readOnly = true, enabled = enabled, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) }, singleLine = true,
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable))
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (allowNone) DropdownMenuItem(text = { Text("—") }, onClick = { onSelect(null); open = false })
            options.forEach { o -> DropdownMenuItem(text = { Text(text(o)) }, onClick = { onSelect(o); open = false }) }
        }
    }
}

@Composable
fun NumberField(label: String, value: Double?, onChange: (Double?) -> Unit, modifier: Modifier = Modifier, suffix: String? = null) {
    var text by remember(value == null) { mutableStateOf(value?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "") }
    OutlinedTextField(value = text, onValueChange = { t -> text = t.filter { it.isDigit() || it == '.' }; onChange(text.toDoubleOrNull()) },
        label = { Text(label) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        suffix = suffix?.let { { Text(it) } }, modifier = modifier)
}

/** Camera that asks the phone for the front lens (most camera apps honour one of these extras). */
class TakeSelfie : ActivityResultContracts.TakePicture() {
    override fun createIntent(context: Context, input: Uri): Intent = super.createIntent(context, input)
        .putExtra("android.intent.extras.CAMERA_FACING", 1)
        .putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
        .putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
}

fun cameraUri(context: Context, name: String): Pair<File, Uri> {
    val file = File(context.cacheDir, "camera").apply { mkdirs() }.resolve(name)
    return file to FileProvider.getUriForFile(context, "${context.packageName}.files", file)
}

fun hasLocation(context: Context) =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

/** Returns a function that gets a GPS fix, asking for the location permission first when needed. */
@Composable
fun rememberGps(onFix: (Fix?) -> Unit): (Int) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingSeconds by remember { mutableStateOf(8) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) scope.launch { onFix(Locator.fix(context, pendingSeconds)) } else onFix(null)
    }
    return { seconds ->
        pendingSeconds = seconds
        if (hasLocation(context)) scope.launch { onFix(Locator.fix(context, seconds)) }
        else ask.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }
}

@Composable
fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleSmall,
            color = androidx.compose.material3.MaterialTheme.colorScheme.primary)
        content()
    }
}
