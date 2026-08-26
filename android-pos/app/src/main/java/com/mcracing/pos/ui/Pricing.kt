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

/** The common session lengths, shown as chips. Longer is still bookable. */
val DURATION_OPTIONS = listOf(1.0, 1.5, 2.0, 2.5, 3.0)

/** Longest bookable session — the venue's whole day (noon to 2am close). */
const val MAX_DURATION_HOURS = 14.0

/** Hours past the 3-hour matrix bill per sim seat, per hour. */
const val LONG_SESSION_RATE_PER_SEAT_HOUR = 30

/** "1h" / "1.5h" — chip + summary label. */
fun formatHours(hours: Double): String =
    if (hours % 1.0 == 0.0) "${hours.toInt()}h" else "${hours}h"

/**
 * Session price in cents for (date, any racer count >= 1, 1–3 hours in
 * half-hour steps). The matrix only lists whole hours; a trailing half hour
 * bills at half the one-hour rate. Returns 0 if out of range.
 */
fun sessionPriceCents(isoDate: String, racers: Int, hours: Double): Long {
    val matrix = if (isWeekend(isoDate)) WEEKEND else WEEKDAY
    val seated = racers.coerceIn(1, SIM_COUNT)
    val withinMatrix = hours.coerceIn(1.0, 3.0)
    val whole = Math.floor(withinMatrix).toInt()
    val hasHalf = withinMatrix - whole >= 0.5
    val wholePrice = matrix[seated]?.get(whole) ?: return 0L
    val oneHourPrice = matrix[seated]?.get(1) ?: return 0L
    // A trailing half hour bills at HALF THE ONE-HOUR RATE — it must NOT
    // interpolate toward the next tier, which would hand out part of the 2h
    // bulk discount. Keep in sync with matrixPrice() in src/lib/pricing.ts.
    val base = wholePrice + (if (hasHalf) oneHourPrice / 2.0 else 0.0)
    // Past 3 hours the matrix runs out — bill the flat per-seat rate per hour.
    val longHours = (hours - 3.0).coerceAtLeast(0.0)
    val longCharge = longHours * LONG_SESSION_RATE_PER_SEAT_HOUR * seated
    val extras = (racers - SIM_COUNT).coerceAtLeast(0)
    val dollars = base + longCharge + extras * EXTRA_RACER_RATE_PER_HOUR * hours
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
