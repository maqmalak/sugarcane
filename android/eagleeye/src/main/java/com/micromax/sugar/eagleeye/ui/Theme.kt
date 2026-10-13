package com.micromax.sugar.eagleeye.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val CaneGreen = Color(0xFF2F9E44)
val Navy = Color(0xFF0F3D2E)
val Warn = Color(0xFFE67700)
val Bad = Color(0xFFE03131)

private val Light = lightColorScheme(primary = CaneGreen, onPrimary = Color.White, secondary = Color(0xFF1971C2),
    background = Color(0xFFF1F4F2), surface = Color.White, surfaceVariant = Color(0xFFE6ECE8), error = Bad)
private val Dark = darkColorScheme(primary = Color(0xFF51CF66), onPrimary = Color(0xFF052E16), secondary = Color(0xFF74C0FC),
    background = Color(0xFF07140F), surface = Color(0xFF0E2219), surfaceVariant = Color(0xFF173226), error = Color(0xFFFF6B6B))

@Composable
fun EagleEyeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
