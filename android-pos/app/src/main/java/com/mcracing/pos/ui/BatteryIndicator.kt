package com.mcracing.pos.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.mcracing.pos.ui.theme.ApexRed
import com.mcracing.pos.ui.theme.PitGray
import kotlin.math.roundToInt

/**
 * Live battery level for the reader.
 *
 * ACTION_BATTERY_CHANGED is a sticky broadcast, so registering returns the
 * current value immediately — no polling and no initial "unknown" flash. It is
 * also a protected system broadcast, so this needs NO permission, which matters:
 * the manifest deliberately keeps permissions to Stripe's vetted set, and
 * anything extra risks rejection at app review.
 */
@Composable
private fun batteryState(): Pair<Int, Boolean> {
    val context = LocalContext.current
    var percent by remember { mutableStateOf(-1) }
    var charging by remember { mutableStateOf(false) }

    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (level >= 0 && scale > 0) {
                    percent = (level * 100f / scale).roundToInt().coerceIn(0, 100)
                }
                val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL
            }
        }
        // RECEIVER_NOT_EXPORTED: nothing else may push us fake battery events.
        // System broadcasts still arrive normally.
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        onDispose { runCatching { context.unregisterReceiver(receiver) } }
    }

    return percent to charging
}

/**
 * Always-on battery readout, shown on every screen so staff notice a flat
 * reader before it dies mid-sale rather than after. Turns amber under 20% and
 * red under 10%.
 */
@Composable
fun BatteryIndicator(modifier: Modifier = Modifier) {
    val (percent, charging) = batteryState()
    if (percent < 0) return // not reported yet — show nothing rather than "-1%"

    val color = when {
        charging -> CompletedGreen
        percent <= 10 -> ApexRed
        percent <= 20 -> WarnAmber
        else -> PitGray
    }

    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.End,
    ) {
        Text(
            text = if (charging) "⚡ $percent%" else "$percent%",
            color = color,
            fontSize = 12.sp,
            fontWeight = if (percent <= 20 && !charging) FontWeight.Bold else FontWeight.Normal,
        )
    }
}
