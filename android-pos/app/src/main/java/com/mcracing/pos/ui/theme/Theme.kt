package com.mcracing.pos.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ApexRed = Color(0xFFE62322)
val AsphaltDark = Color(0xFF0D0D0D)
val Asphalt = Color(0xFF1A1A1A)
val GridWhite = Color(0xFFF5F5F5)
val TelemetryCyan = Color(0xFF00AEEF)
val PitGray = Color(0xFF888888)

private val DarkColors = darkColorScheme(
    primary = ApexRed,
    onPrimary = GridWhite,
    background = AsphaltDark,
    onBackground = GridWhite,
    surface = Asphalt,
    onSurface = GridWhite,
    secondary = TelemetryCyan,
    onSecondary = AsphaltDark,
)

@Composable
fun MCRacingTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors, content = content)
}
