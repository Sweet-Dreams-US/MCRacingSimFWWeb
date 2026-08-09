package com.mcracing.pos.ui

import java.time.LocalDate

// Mirrors src/lib/pricing.ts so the on-reader "new booking" builder can quote a
// price without a round-trip. Keep in sync with the web matrix.
private val WEEKDAY = mapOf(
    1 to mapOf(1 to 45, 2 to 85, 3 to 115),
    2 to mapOf(1 to 90, 2 to 160, 3 to 220),
    3 to mapOf(1 to 130, 2 to 245, 3 to 340),
)
private val WEEKEND = mapOf(
    1 to mapOf(1 to 50, 2 to 95, 3 to 135),
    2 to mapOf(1 to 100, 2 to 180, 3 to 250),
    3 to mapOf(1 to 140, 2 to 275, 3 to 365),
)

/** Weekend = Fri/Sat/Sun (matches src/lib/pricing.ts isWeekend). */
fun isWeekend(isoDate: String): Boolean {
    return try {
        when (LocalDate.parse(isoDate).dayOfWeek.value) {
            5, 6, 7 -> true // Fri, Sat, Sun
            else -> false
        }
    } catch (_: Exception) {
        false
    }
}

// The venue has 3 sims, so the matrix tops out at 3 racers. A bigger group books
// the same rigs and takes turns, so each racer past the third is a flat add-on
// per hour. MUST match SIM_COUNT / EXTRA_RACER_RATE_PER_HOUR in src/lib/pricing.ts.
const val SIM_COUNT = 3
const val EXTRA_RACER_RATE_PER_HOUR = 10 // dollars

/** Bookable session lengths — half-hour steps, matching DURATION_OPTIONS. */
val DURATION_OPTIONS = listOf(1.0, 1.5, 2.0, 2.5, 3.0)

/** "1h" / "1.5h" — chip + summary label. */
fun formatHours(hours: Double): String =
    if (hours % 1.0 == 0.0) "${hours.toInt()}h" else "${hours}h"

/**
 * Session price in cents for (date, any racer count >= 1, 1–3 hours in
 * half-hour steps). The matrix only lists whole hours, so a half hour is the
 * exact midpoint of the whole hours either side. Returns 0 if out of range.
 */
fun sessionPriceCents(isoDate: String, racers: Int, hours: Double): Long {
    val matrix = if (isWeekend(isoDate)) WEEKEND else WEEKDAY
    val seated = racers.coerceIn(1, SIM_COUNT)
    val clamped = hours.coerceIn(1.0, 3.0)
    val lo = Math.floor(clamped).toInt()
    val hi = Math.ceil(clamped).toInt()
    val loPrice = matrix[seated]?.get(lo) ?: return 0L
    val hiPrice = matrix[seated]?.get(hi) ?: return 0L
    val base = loPrice + (hiPrice - loPrice) * (clamped - lo)
    val extras = (racers - SIM_COUNT).coerceAtLeast(0)
    val dollars = base + extras * EXTRA_RACER_RATE_PER_HOUR * clamped
    return Math.round(dollars * 100.0)
}

// Sales tax — MUST match src/lib/tax.ts (SALES_TAX_RATE_BPS) + the backend env.
// The backend is authoritative for what's charged; this only drives the on-reader
// display so the customer sees the same total they'll be charged. If the rate
// changes, update the backend env AND this constant, then rebuild the app.
const val SALES_TAX_RATE_BPS = 700 // 7.00%

/** Tax on a pre-tax subtotal, in cents (rounded to nearest cent, matches backend). */
fun computeTaxCents(subtotalCents: Long): Long {
    if (subtotalCents <= 0) return 0L
    return Math.round(subtotalCents.toDouble() * SALES_TAX_RATE_BPS / 10000.0)
}

/** e.g. "7%" — for the reader's tax line. */
fun taxRateLabel(): String {
    val pct = SALES_TAX_RATE_BPS / 100.0
    return if (pct == Math.floor(pct)) "${pct.toLong()}%" else "%.2f%%".format(pct)
}
