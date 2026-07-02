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

/** Session price in cents for (date, racers 1-3, hours 1-3), 0 if out of range. */
fun sessionPriceCents(isoDate: String, racers: Int, hours: Int): Long {
    val matrix = if (isWeekend(isoDate)) WEEKEND else WEEKDAY
    val dollars = matrix[racers]?.get(hours) ?: return 0L
    return dollars.toLong() * 100L
}
