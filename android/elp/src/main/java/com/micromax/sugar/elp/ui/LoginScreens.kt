package com.micromax.sugar.elp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.micromax.sugar.elp.BuildConfig
import kotlinx.coroutines.launch

@Composable
private fun Brand(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Navy, Color(0xFF7A2E0B), Brand))).systemBarsPadding().imePadding(),
        contentAlignment = Alignment.Center) {
        Card(Modifier.padding(20.dp).fillMaxWidth()) {
            Column(Modifier.padding(22.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("ELP · Electronic Loading Point", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("MicroMax Sugar Mills · loading points & gate", color = MaterialTheme.colorScheme.onSurfaceVariant)
                content()
            }
        }
    }
}

@Composable
fun LoginScreen(vm: AppViewModel, done: () -> Unit) {
    var server by remember { mutableStateOf(vm.repo.session.serverUrl) }
    var email by remember { mutableStateOf(vm.repo.session.user ?: "") }
    var password by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Brand {
        OutlinedTextField(server, { server = it }, label = { Text("Server") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = { IconButton(onClick = { show = !show }) { Icon(Icons.Default.Visibility, "Show password") } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(enabled = !busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth(), onClick = {
            busy = true; error = null
            scope.launch {
                vm.login(server, email, password).onSuccess { done() }.onFailure { error = it.message }
                busy = false
            }
        }) { Text(if (busy) "Signing in…" else "Sign in") }
        Text("Device ${vm.repo.deviceId}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("A new phone must be approved by the Cane Manager (Survey Device) before it can sign in. LP operators must be assigned to their loading point.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun PinPad(title: String, hint: String, error: String?, onPin: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }
    Brand {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.size(8.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
        }
        Text(hint, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(8) }, label = { Text("PIN") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(enabled = pin.length >= 4, modifier = Modifier.fillMaxWidth(), onClick = { onPin(pin); pin = "" }) { Text("Continue") }
    }
}

@Composable
fun SetPinScreen(vm: AppViewModel, done: () -> Unit) {
    var first by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    PinPad(if (first == null) "Set an app PIN" else "Repeat the PIN",
        "The app locks after 2 minutes in the background. 4–8 digits.", error) { pin ->
        when {
            first == null -> { first = pin; error = null }
            first == pin -> { vm.setPin(pin); done() }
            else -> { first = null; error = "The PINs didn't match — start again" }
        }
    }
}

@Composable
fun LockScreen(vm: AppViewModel) {
    var error by remember { mutableStateOf<String?>(null) }
    var tries by remember { mutableStateOf(0) }
    PinPad("Locked", "Signed in as ${vm.repo.session.fullName ?: vm.repo.session.user}", error) { pin ->
        if (!vm.unlock(pin)) {
            tries++
            error = if (tries >= 5) "Too many wrong PINs — sign in again from Settings after unlocking with your password" else "Wrong PIN"
            if (tries >= 5) { vm.signOut(); vm.repo.session.pinHash = null }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(vm: AppViewModel, back: () -> Unit, signedOut: () -> Unit) {
    val s = vm.repo.session
    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }) }) { pad ->
        Column(Modifier.padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Info("User", "${s.fullName ?: ""} · ${s.user ?: ""}")
            Info("Server", s.serverUrl)
            Info("Device", "${s.deviceName ?: "—"} · ${vm.repo.deviceId}")
            Info("Season", vm.masters.value.season ?: "—")
            Info("My points", vm.masters.value.points.joinToString { it.title }.ifBlank { "—" })
            Info("Last sync", s.lastSync ?: "never")
            Info("App", "ELP ${BuildConfig.VERSION_NAME}")
            HorizontalDivider()
            OutlinedButton(onClick = { vm.syncNow() }, modifier = Modifier.fillMaxWidth()) { Text("Sync now") }
            OutlinedButton(onClick = { vm.repo.session.pinHash = null; vm.repo.session.pinSalt = null; back() }, modifier = Modifier.fillMaxWidth()) { Text("Remove app PIN") }
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.signOut(); signedOut() }, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
            Text("Unsent loads stay on the phone and go up after you sign in again.", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Info(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value)
    }
}
