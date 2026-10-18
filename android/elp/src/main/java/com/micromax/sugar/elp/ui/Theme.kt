package com.micromax.sugar.elp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Brand = Color(0xFFE8590C)
val Navy = Color(0xFF3B1D0A)
val Good = Color(0xFF2F9E44)
val Warn = Color(0xFFE67700)
val Bad = Color(0xFFE03131)

private val Light = lightColorScheme(primary = Brand, onPrimary = Color.White, secondary = Color(0xFF1971C2),
    background = Color(0xFFF7F3F0), surface = Color.White, surfaceVariant = Color(0xFFEFE7E1), error = Bad)
private val Dark = darkColorScheme(primary = Color(0xFFFF922B), onPrimary = Color(0xFF2B1204), secondary = Color(0xFF74C0FC),
    background = Color(0xFF140B06), surface = Color(0xFF22140C), surfaceVariant = Color(0xFF33221A), error = Color(0xFFFF6B6B))

@Composable
fun ElpTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
