package com.mcracing.pos

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.mcracing.pos.terminal.TerminalManager
import com.mcracing.pos.ui.PosApp
import com.mcracing.pos.ui.theme.MCRacingTheme

class MainActivity : ComponentActivity() {

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
                startTerminal()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MCRacingTheme { PosApp() } }
        ensureLocationThenStart()
    }

    private fun ensureLocationThenStart() {
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            startTerminal()
        } else {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
            )
        }
    }

    private fun startTerminal() {
        // Stripe Terminal requires location permission AND location services on.
        TerminalManager.init(applicationContext)
        TerminalManager.connect(onError = { /* surfaced via connection status in UI */ })
    }
}
