package com.micromax.sugar.elp.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.micromax.sugar.core.location.Fix
import com.micromax.sugar.core.media.Photos
import java.io.File

/**
 * The photo views for a load: tap a tile to take that view with the camera. Each photo is checked at once —
 * blurred, dark or faded ones are thrown away with the reason ("auto image cancellation") — and stamped.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShotGrid(vm: AppViewModel, views: List<String>, required: Set<String>, shots: List<Shot>, placeTitle: String, vehicleNo: String,
    fix: Fix?, onShot: (Shot) -> Unit) {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<Pair<String, File>?>(null) }
    var refused by remember { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val (view, f) = pending ?: return@rememberLauncherForActivityResult
        pending = null
        if (!ok) return@rememberLauncherForActivityResult
        val jpeg = runCatching { Photos.compress(context, Uri.fromFile(f), 1600, 82) }.getOrNull()
        f.delete()
        if (jpeg == null) { refused = "Could not read the photo — take it again"; return@rememberLauncherForActivityResult }
        val (shot, problems) = vm.shot(jpeg, view, placeTitle, vehicleNo, fix)
        if (shot != null) onShot(shot) else refused = "The $view photo was refused: ${problems.joinToString()}. Hold the phone steady, in good light, and take it again."
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        views.forEach { view ->
            val s = shots.lastOrNull { it.view == view }
            Column(Modifier.width(150.dp)) {
                Box(Modifier.aspectRatio(4f / 3f).clip(RoundedCornerShape(10.dp))
                    .border(1.dp, if (s == null && view in required) MaterialTheme.colorScheme.primary else Color.Gray.copy(alpha = .4f), RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable {
                        val (f, u) = cameraUri(context, "elp-${System.currentTimeMillis()}.jpg")
                        pending = view to f
                        camera.launch(u)
                    }, contentAlignment = Alignment.Center) {
                    if (s != null) {
                        AsyncImage(model = File(s.path), contentDescription = view, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        Icon(Icons.Default.CheckCircle, null, tint = Good, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp))
                    } else Icon(Icons.Default.CameraAlt, "Take $view", tint = MaterialTheme.colorScheme.primary)
                }
                Text(view + if (view in required) " *" else "", style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (view in required) FontWeight.SemiBold else FontWeight.Normal)
                if (s != null) Text("sharp ${s.sharpness.toInt()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    refused?.let { msg ->
        AlertDialog(onDismissRequest = { refused = null }, confirmButton = { TextButton(onClick = { refused = null }) { Text("OK") } },
            title = { Text("Photo cancelled") }, text = { Text(msg) })
    }
}
