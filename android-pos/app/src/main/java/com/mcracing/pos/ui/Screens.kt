package com.mcracing.pos.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mcracing.pos.net.BlockDto
import com.mcracing.pos.net.BookingDto
import com.mcracing.pos.net.CustomerHit
import com.mcracing.pos.ui.theme.ApexRed
import com.mcracing.pos.ui.theme.PitGray
import com.mcracing.pos.ui.theme.TelemetryCyan

fun centsToDollars(cents: Long): String = "$%.2f".format(cents / 100.0)

val CompletedGreen = Color(0xFF4ADE80)
private val DoneCardBg = Color(0xFF141414)

fun prettyTime(t: String): String {
    // "14:30:00" -> "2:30 PM"
    val parts = t.split(":")
    var h = parts.getOrNull(0)?.toIntOrNull() ?: return t
    val m = parts.getOrNull(1) ?: "00"
    val period = if (h >= 12) "PM" else "AM"
    if (h == 0) h = 12 else if (h > 12) h -= 12
    return "$h:$m $period"
}

@Composable
fun ConnectingScreen(statusText: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = TelemetryCyan)
            Spacer(Modifier.height(16.dp))
            Text(statusText, color = PitGray)
        }
    }
}

fun isBookingDone(status: String): Boolean =
    status == "completed" || status == "noshow" || status == "partial_noshow"

fun bookingStatusLabel(status: String): String = when (status) {
    "completed" -> "✓ Completed"
    "noshow" -> "No-show"
    "partial_noshow" -> "Partial no-show"
    else -> status
}

@Composable
fun BookingsScreen(
    bookings: List<BookingDto>,
    blocks: List<BlockDto>,
    loading: Boolean,
    today: String,
    tomorrow: String,
    onRefresh: () -> Unit,
    onPick: (BookingDto) -> Unit,
    onWalkIn: () -> Unit,
    onNewBooking: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    // Group by business day (the API rolls over at 7am, so late-night sessions
    // stay under "today"). ISO date strings compare lexicographically.
    val todayList = bookings.filter { it.sessionDate == today }
    val tomorrowList = bookings.filter { it.sessionDate == tomorrow }
    val upcomingList = bookings.filter { it.sessionDate > tomorrow }

    // Blocks = personal appointments / closures for the same days. Shown flagged
    // (red, not tappable) so staff don't try to sell that time.
    val todayBlocks = blocks.filter { it.blockDate == today }
    val tomorrowBlocks = blocks.filter { it.blockDate == tomorrow }
    val upcomingBlocks = blocks.filter { it.blockDate > tomorrow }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Bookings", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = ApexRed)
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Gear → Stripe device settings (WiFi, screen timeout, passcode).
                // Needed because our kiosk app disables the swipe-to-settings
                // gesture; Stripe still asks for the admin passcode (07139).
                TextButton(onClick = onOpenSettings) {
                    Text("⚙", color = PitGray, fontSize = 22.sp)
                }
                OutlinedButton(onClick = onRefresh) { Text("Refresh") }
            }
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = onWalkIn,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
        ) { Text("Walk-in / new sale") }
        Spacer(Modifier.height(8.dp))
        // Put a session on the books now, take the money later.
        OutlinedButton(
            onClick = onNewBooking,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Add booking — no sale yet") }
        Spacer(Modifier.height(12.dp))

        if (loading) {
            ConnectingScreen("Loading bookings…")
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
            ) {
                item { SectionHeader("Today (${todayList.size})") }
                if (todayList.isEmpty() && todayBlocks.isEmpty()) {
                    item { Text("Nothing on the schedule today.", color = PitGray) }
                }
                items(todayBlocks, key = { "block-${it.id}" }) { bl -> BlockCard(bl) }
                items(todayList, key = { it.id }) { b -> BookingCard(b, today, onPick) }

                item { Spacer(Modifier.height(8.dp)) }
                item { SectionHeader("Tomorrow (${tomorrowList.size})") }
                if (tomorrowList.isEmpty() && tomorrowBlocks.isEmpty()) {
                    item { Text("Nothing on the schedule tomorrow.", color = PitGray) }
                }
                items(tomorrowBlocks, key = { "block-${it.id}" }) { bl -> BlockCard(bl) }
                items(tomorrowList, key = { it.id }) { b -> BookingCard(b, today, onPick) }

                if (upcomingList.isNotEmpty() || upcomingBlocks.isNotEmpty()) {
                    item { Spacer(Modifier.height(8.dp)) }
                    item { SectionHeader("Upcoming (${upcomingList.size})") }
                    items(upcomingBlocks, key = { "block-${it.id}" }) { bl -> BlockCard(bl) }
                    items(upcomingList, key = { it.id }) { b -> BookingCard(b, today, onPick) }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        color = PitGray,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
    )
}

@Composable
private fun BookingCard(b: BookingDto, today: String, onPick: (BookingDto) -> Unit) {
    val done = isBookingDone(b.status)
    val net = b.effectiveNetCents()
    val left = b.remainingCents()
    Card(
        onClick = { onPick(b) },
        modifier = Modifier.fillMaxWidth(),
        // Completed/closed-out bookings are greyed so open work stands out.
        colors = if (done) CardDefaults.cardColors(containerColor = DoneCardBg) else CardDefaults.cardColors(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${if (b.sessionDate == today) "Today" else b.sessionDate} · ${prettyTime(b.startTime)}",
                    color = if (done) PitGray else TelemetryCyan,
                )
                Text(
                    centsToDollars(net),
                    fontWeight = FontWeight.Bold,
                    color = if (done) PitGray else Color.White,
                )
            }
            if (b.discountAmountCents > 0) {
                Text(
                    "Discount ${b.discountCode ?: ""} −${centsToDollars(b.discountAmountCents)}",
                    color = if (done) PitGray else CompletedGreen,
                    fontSize = 10.sp,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                b.customerName ?: "No customer",
                fontWeight = FontWeight.Medium,
                color = if (done) PitGray else Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${b.racerCount} racer${if (b.racerCount > 1) "s" else ""} · ${b.durationHours}h · ${b.id}",
                color = PitGray,
                fontSize = 12.sp,
            )
            if (done) {
                // Green for a clean completion, muted for a no-show.
                Text(
                    bookingStatusLabel(b.status),
                    color = if (b.status == "completed") CompletedGreen else PitGray,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            } else if (left > 0) {
                // Unfinished → red so the balance owed is obvious.
                Text(
                    if (b.paidCents > 0) "Paid ${centsToDollars(b.paidCents)} · ${centsToDollars(left)} left"
                    else "${centsToDollars(left)} due",
                    color = ApexRed,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Text("Paid in full", color = CompletedGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// A staff-set availability block — NOT a sellable session, so the card is not
// clickable and is tinted red so staff know that time is held (personal
// appointment / closure). Whole-day blocks have null start/end.
@Composable
private fun BlockCard(bl: BlockDto) {
    val wholeDay = bl.startTime.isNullOrBlank() || bl.endTime.isNullOrBlank()
    val timeLabel =
        if (wholeDay) "All day" else "${prettyTime(bl.startTime!!)} – ${prettyTime(bl.endTime!!)}"
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A1416)),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "🚫 BLOCKED — PERSONAL",
                    color = ApexRed,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(timeLabel, color = ApexRed, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                bl.reason ?: "Unavailable",
                color = Color.White,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text("Sims held off the booking calendar", color = PitGray, fontSize = 12.sp)
        }
    }
}

@Composable
fun SaleScreen(
    draft: SaleDraft,
    connected: Boolean,
    customerQuery: String,
    customerHits: List<CustomerHit>,
    recentCheckins: List<CustomerHit>,
    onAddRc: (Long) -> Unit,
    onClearRc: () -> Unit,
    onCustomerQueryChange: (String) -> Unit,
    onCustomerPick: (CustomerHit) -> Unit,
    onClearCustomer: () -> Unit,
    onAmountChange: (String) -> Unit,
    onCashPaidChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onCharge: () -> Unit,
    onRecordCash: () -> Unit,
    onMarkComplete: () -> Unit,
    onNoShow: () -> Unit,
    onCancelBooking: () -> Unit,
    onBack: () -> Unit,
) {
    val isBooking = draft.bookingId != null
    var confirm by remember { mutableStateOf<ConfirmAction?>(null) }
    var bRacers by remember { mutableStateOf(1) }
    var bHours by remember { mutableStateOf(1) }

    // Recompute the walk-in session price from the racers/hours selection.
    fun applyBuilder(r: Int, h: Int) {
        val cents = sessionPriceCents(draft.today, r, h)
        if (cents > 0) {
            onAmountChange("%.2f".format(cents / 100.0))
            onDescriptionChange("$r racer${if (r > 1) "s" else ""} · ${h}h session")
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        OutlinedButton(onClick = onBack) { Text("← Bookings") }
        Spacer(Modifier.height(12.dp))

        if (isBooking) {
            Text("Linked booking ${draft.bookingId}", color = TelemetryCyan, fontSize = 13.sp)
            Spacer(Modifier.height(6.dp))
        }

        // Customer: show the selected one, else (walk-in) offer a search.
        if (draft.customerName != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Customer: ${draft.customerName}",
                    color = PitGray,
                    modifier = Modifier.weight(1f),
                )
                if (!isBooking) TextButton(onClick = onClearCustomer) { Text("Change") }
            }
            Spacer(Modifier.height(8.dp))
        } else if (!isBooking) {
            OutlinedTextField(
                value = customerQuery,
                onValueChange = onCustomerQueryChange,
                label = { Text("Find customer (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            customerHits.forEach { hit ->
                Text(
                    "${hit.name}  ·  ${hit.email ?: ""}",
                    color = TelemetryCyan,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onCustomerPick(hit) }
                        .padding(vertical = 8.dp),
                )
            }
            // Just-signed liability forms — the usual case at the counter is the
            // person who signed on the kiosk 30 seconds ago, so offer them by
            // name instead of making staff type a search. Auto-refreshes.
            if (customerQuery.isBlank() && recentCheckins.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text("Just signed a liability form", color = PitGray, fontSize = 11.sp)
                Spacer(Modifier.height(2.dp))
                recentCheckins.take(8).forEach { hit ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onCustomerPick(hit) }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            hit.name,
                            color = TelemetryCyan,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            signedAgo(hit.signedAt),
                            color = PitGray,
                            fontSize = 11.sp,
                        )
                    }
                    HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        val bookingDone = draft.bookingStatus?.let { isBookingDone(it) } == true
        if (bookingDone) {
            Text(
                bookingStatusLabel(draft.bookingStatus!!),
                color = if (draft.bookingStatus == "completed") CompletedGreen else PitGray,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
        } else if (draft.paidCents > 0) {
            val left = (draft.effectiveNetCents() - draft.paidCents).coerceAtLeast(0)
            Text(
                "Paid ${centsToDollars(draft.paidCents)} of ${centsToDollars(draft.effectiveNetCents())} · ${centsToDollars(left)} left",
                color = if (left > 0) ApexRed else CompletedGreen,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
        }
        if (draft.discountAmountCents > 0) {
            Text(
                "Discount ${draft.discountCode ?: ""} applied — −${centsToDollars(draft.discountAmountCents)}",
                color = CompletedGreen,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
        }

        // New-booking builder (walk-in only): pick racers + hours → auto price.
        if (!isBooking) {
            Text("Build a session — simulators", color = PitGray, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..3).forEach { r ->
                    SelectChip(
                        selected = bRacers == r,
                        label = "$r racer${if (r > 1) "s" else ""}",
                        onClick = { bRacers = r; applyBuilder(r, bHours) },
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..3).forEach { h ->
                    SelectChip(
                        selected = bHours == h,
                        label = "${h}h",
                        onClick = { bHours = h; applyBuilder(bRacers, h) },
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // RC car racing — a separate track, upsold on top of whatever's being
        // sold (including an existing booking) while people aren't racing the
        // sims. Each tap adds another $15/$20; it's recorded as RC revenue.
        Text("Build a session — RC car racing (add-on)", color = PitGray, fontSize = 11.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton(
                onClick = { onAddRc(1500) },
                modifier = Modifier.weight(1f),
            ) { Text("+ $15", fontSize = 14.sp, fontWeight = FontWeight.Bold) }
            OutlinedButton(
                onClick = { onAddRc(2000) },
                modifier = Modifier.weight(1f),
            ) { Text("+ $20", fontSize = 14.sp, fontWeight = FontWeight.Bold) }
        }
        if (draft.rcCents > 0) {
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "RC added: ${centsToDollars(draft.rcCents)}",
                    color = TelemetryCyan,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                TextButton(onClick = onClearRc) { Text("Clear", color = PitGray, fontSize = 12.sp) }
            }
        }
        Spacer(Modifier.height(12.dp))

        // Split by person (booking with signed-up racers, still open): charge each
        // their even share with their own email on the receipt.
        if (isBooking && !bookingDone && draft.racers.size > 1) {
            val share = draft.effectiveNetCents() / draft.racers.size
            Text("Split by person (${centsToDollars(share)} each)", color = PitGray, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            draft.racers.forEach { r ->
                OutlinedButton(
                    onClick = {
                        onAmountChange("%.2f".format(share / 100.0))
                        if (!r.email.isNullOrBlank()) onEmailChange(r.email)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "${r.name}${if (!r.email.isNullOrBlank()) " · ${r.email}" else ""}",
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(4.dp))
            }
            Spacer(Modifier.height(12.dp))
        }

        OutlinedTextField(
            value = draft.amountText,
            onValueChange = onAmountChange,
            label = { Text("Amount ($)") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Decimal
            ),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        // Split payment: cash the customer hands over now (of the total). The
        // rest goes on the card. Leave blank for a normal full card/cash sale.
        OutlinedTextField(
            value = draft.cashPaidText,
            onValueChange = onCashPaidChange,
            label = { Text("Cash paid ($) — optional, rest on card") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Decimal
            ),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = draft.description,
            onValueChange = onDescriptionChange,
            label = { Text("Description") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = draft.receiptEmail ?: "",
            onValueChange = onEmailChange,
            label = { Text("Receipt email (optional)") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Email
            ),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        // Tax summary — subtotal is what staff entered PLUS any RC add-on; the
        // customer pays the total.
        val subtotalC = draft.subtotalCents()
        val taxC = computeTaxCents(subtotalC)
        val totalC = subtotalC + taxC
        // Split payment: cash covers part (or all) of the total; card takes the rest.
        val cashC = draft.cashPaidCents().coerceIn(0L, totalC)
        val cardC = totalC - cashC
        val isSplit = cashC > 0 && cardC > 0
        val allCash = cashC > 0 && cardC <= 0
        if (subtotalC >= 1 && taxC > 0) {
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("+ Sales tax (${taxRateLabel()})", color = PitGray, fontSize = 14.sp)
                Text(centsToDollars(taxC), color = PitGray, fontSize = 14.sp)
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(
                    centsToDollars(totalC),
                    color = TelemetryCyan,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        // Split breakdown — shown once a cash amount is entered.
        if (subtotalC >= 1 && cashC > 0) {
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Cash paid", color = PitGray, fontSize = 14.sp)
                Text("− ${centsToDollars(cashC)}", color = PitGray, fontSize = 14.sp)
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(if (allCash) "All cash" else "On card", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(
                    centsToDollars(cardC),
                    color = TelemetryCyan,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(Modifier.height(16.dp))

        // Primary finish button. All-cash needs no reader; a card balance does.
        val cardTooSmall = cardC in 1..49 // Stripe minimum charge is $0.50
        val chargeEnabled = if (allCash) totalC >= 1 else (connected && cardC >= 50)
        Button(
            onClick = onCharge,
            enabled = chargeEnabled,
            modifier = Modifier.fillMaxWidth().height(60.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
        ) {
            Text(
                when {
                    subtotalC < 1 -> "Enter an amount"
                    allCash -> "Take ${centsToDollars(totalC)} cash"
                    isSplit -> "${centsToDollars(cashC)} cash + charge ${centsToDollars(cardC)} card"
                    else -> "Charge ${centsToDollars(totalC)} on reader"
                },
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        if (cardTooSmall) {
            Spacer(Modifier.height(6.dp))
            Text("Card portion must be at least $0.50 — take it all as cash instead.", color = PitGray, fontSize = 12.sp)
        } else if (!connected && !allCash) {
            Spacer(Modifier.height(6.dp))
            Text("Reader not connected yet…", color = PitGray, fontSize = 12.sp)
        }

        // Standalone full-cash button — only when no split is in progress (so a
        // partial cash amount can't be mistakenly recorded as the whole total).
        if (cashC <= 0) {
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onRecordCash,
                enabled = subtotalC >= 1,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Record ${centsToDollars(totalC)} cash") }
        }

        // Booking actions only for OPEN bookings. Once closed out, the reader
        // can't cancel/delete it — that's owner-only from the admin site.
        if (isBooking && !bookingDone) {
            Spacer(Modifier.height(16.dp))
            Text("Booking actions", color = PitGray, fontSize = 11.sp)
            Spacer(Modifier.height(6.dp))
            OutlinedButton(
                onClick = { confirm = ConfirmAction.Complete },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Mark complete / close out") }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { confirm = ConfirmAction.NoShow },
                    modifier = Modifier.weight(1f),
                ) { Text("No-show") }
                OutlinedButton(
                    onClick = { confirm = ConfirmAction.Cancel },
                    modifier = Modifier.weight(1f),
                ) { Text("Cancel") }
            }
        } else if (isBooking && bookingDone) {
            Spacer(Modifier.height(16.dp))
            Text(
                "This booking is closed out. To change or delete it, use the admin site.",
                color = PitGray,
                fontSize = 11.sp,
            )
        }
        Spacer(Modifier.height(24.dp))
    }

    confirm?.let { c ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(c.title) },
            text = { Text(c.body) },
            confirmButton = {
                TextButton(onClick = {
                    val chosen = c
                    confirm = null
                    when (chosen) {
                        ConfirmAction.Complete -> onMarkComplete()
                        ConfirmAction.NoShow -> onNoShow()
                        ConfirmAction.Cancel -> onCancelBooking()
                    }
                }) { Text("Yes") }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Back") } },
        )
    }
}

/**
 * "Add booking — no sale yet": put a session on the books to charge later.
 * Deliberately minimal — time, racers, hours, price. No customer is required;
 * staff can pick the booking off the list and charge it when they pay.
 */
@Composable
fun NewBookingScreen(
    draft: BookingDraft,
    today: String,
    tomorrow: String,
    onChange: (BookingDraft) -> Unit,
    onCreate: () -> Unit,
    onBack: () -> Unit,
) {
    // Re-quote the standard price whenever the session shape changes, unless
    // staff has typed their own number.
    fun retime(next: BookingDraft, priceFollows: Boolean): BookingDraft {
        if (!priceFollows) return next
        val cents = sessionPriceCents(next.date, next.racers, next.hours)
        return if (cents > 0) next.copy(priceText = "%.2f".format(cents / 100.0)) else next
    }

    val standardCents = sessionPriceCents(draft.date, draft.racers, draft.hours)
    val priceIsStandard =
        standardCents > 0 && draft.priceCents() == standardCents

    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("← Back") }
            Spacer(Modifier.weight(1f))
        }
        Text("Add booking", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = ApexRed)
        Text(
            "Puts the session on the books — no money is taken now.",
            color = PitGray,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(16.dp))

        Text("Day", color = PitGray, fontSize = 11.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SelectChip(
                selected = draft.date == today,
                label = "Today",
                onClick = { onChange(retime(draft.copy(date = today), priceIsStandard)) },
            )
            SelectChip(
                selected = draft.date == tomorrow,
                label = "Tomorrow",
                onClick = { onChange(retime(draft.copy(date = tomorrow), priceIsStandard)) },
            )
        }
        Spacer(Modifier.height(12.dp))

        // Time stepper — 30-min slots from noon to 1:30am, matching the web form.
        Text("Start time", color = PitGray, fontSize = 11.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(
                onClick = {
                    val next = (draft.startMinutes - 30).coerceAtLeast(12 * 60)
                    onChange(draft.copy(startMinutes = next))
                },
            ) { Text("−30m") }
            Text(
                prettyTime(draft.startTime()),
                color = TelemetryCyan,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            OutlinedButton(
                onClick = {
                    val next = (draft.startMinutes + 30).coerceAtMost(25 * 60 + 30)
                    onChange(draft.copy(startMinutes = next))
                },
            ) { Text("+30m") }
        }
        Spacer(Modifier.height(12.dp))

        Text("Racers", color = PitGray, fontSize = 11.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (1..3).forEach { r ->
                SelectChip(
                    selected = draft.racers == r,
                    label = "$r racer${if (r > 1) "s" else ""}",
                    onClick = { onChange(retime(draft.copy(racers = r), priceIsStandard)) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("Hours", color = PitGray, fontSize = 11.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (1..3).forEach { h ->
                SelectChip(
                    selected = draft.hours == h,
                    label = "${h}h",
                    onClick = { onChange(retime(draft.copy(hours = h), priceIsStandard)) },
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = draft.priceText,
            onValueChange = { onChange(draft.copy(priceText = it)) },
            label = { Text("Price ($, pre-tax)") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Decimal
            ),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            if (standardCents > 0)
                "Standard is ${centsToDollars(standardCents)} — edit to quote something else. Tax is added when you charge it."
            else
                "Tax is added when you charge it.",
            color = PitGray,
            fontSize = 11.sp,
        )

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = onCreate,
            enabled = draft.date.isNotBlank() && draft.priceCents() >= 0,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
        ) {
            Text(
                "Add booking · ${prettyTime(draft.startTime())}",
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

/**
 * "3m ago" for a waiver timestamp, so staff can tell who just walked up.
 * OffsetDateTime (not Instant) because PostgREST serializes with a "+00:00"
 * offset rather than a bare "Z".
 */
private fun signedAgo(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return try {
        val then = java.time.OffsetDateTime.parse(iso).toInstant()
        val mins = java.time.Duration.between(then, java.time.Instant.now()).toMinutes()
        when {
            mins < 1L -> "just now"
            mins < 60L -> "${mins}m ago"
            else -> "${mins / 60}h ago"
        }
    } catch (_: Exception) {
        ""
    }
}

/**
 * A picker chip that FILLS red when selected (an outlined button with red text
 * reads as unselected at a glance on the reader — staff need to see the current
 * choice from arm's length).
 */
@Composable
private fun RowScope.SelectChip(selected: Boolean, label: String, onClick: () -> Unit) {
    if (selected) {
        Button(
            onClick = onClick,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed, contentColor = Color.White),
        ) { Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = Modifier.weight(1f),
        ) { Text(label, fontSize = 12.sp) }
    }
}

private enum class ConfirmAction(val title: String, val body: String) {
    Complete("Mark complete?", "Close out this booking as completed, even if it wasn't fully paid."),
    NoShow("Mark no-show?", "Flag this booking as a no-show."),
    Cancel("Cancel booking?", "Cancel this booking. This can't be undone from the reader."),
}

@Composable
fun CustomerConfirmScreen(
    amountCents: Long,
    cashCents: Long,
    description: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    // Shown on the reader BEFORE Stripe's tip screen. Staff hands the reader to
    // the customer here — they see the TOTAL, confirm it, and only then does the
    // tip screen (then tap-to-pay) appear. This is the whole point: the customer
    // is never handed a tip prompt as the first thing they see.
    // amountCents is the pre-tax subtotal; the customer is charged subtotal + tax.
    val taxCents = computeTaxCents(amountCents)
    val totalCents = amountCents + taxCents
    // Split payment: some cash was collected; the reader charges only the rest.
    val cash = cashCents.coerceIn(0L, totalCents)
    val cardCents = totalCents - cash
    val isSplit = cash > 0
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (isSplit) "PAYING ON CARD" else "YOUR TOTAL",
                color = PitGray,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                centsToDollars(if (isSplit) cardCents else totalCents),
                color = CompletedGreen,
                fontSize = 64.sp,
                fontWeight = FontWeight.Bold,
            )
            if (isSplit) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Total ${centsToDollars(totalCents)}   ·   Cash paid ${centsToDollars(cash)}",
                    color = PitGray,
                    fontSize = 14.sp,
                )
            } else if (taxCents > 0) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Subtotal ${centsToDollars(amountCents)}   ·   Tax (${taxRateLabel()}) ${centsToDollars(taxCents)}",
                    color = PitGray,
                    fontSize = 14.sp,
                )
            }
            if (description.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(description, color = PitGray, fontSize = 15.sp)
            }
            Spacer(Modifier.height(40.dp))
            Button(
                onClick = onConfirm,
                modifier = Modifier.fillMaxWidth().height(72.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TelemetryCyan),
            ) {
                Text("Confirm & Continue", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                Text("Cancel")
            }
        }
    }
}

@Composable
fun ProcessingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = TelemetryCyan)
            Spacer(Modifier.height(16.dp))
            Text("Follow the prompts on the reader…", color = PitGray)
        }
    }
}

@Composable
fun ResultScreen(
    success: Boolean,
    title: String,
    amountCents: Long,
    message: String,
    onDone: () -> Unit,
) {
    // On success, auto-return to the bookings list after a few seconds so staff
    // don't have to tap "New Sale" between customers. Failures wait for a tap.
    if (success) {
        LaunchedEffect(Unit) {
            delay(3000)
            onDone()
        }
    }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (success) "✓" else "✕", fontSize = 64.sp, color = if (success) CompletedGreen else ApexRed)
            Spacer(Modifier.height(12.dp))
            Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            if (success && amountCents > 0) {
                Spacer(Modifier.height(8.dp))
                Text(centsToDollars(amountCents), fontSize = 32.sp, fontWeight = FontWeight.Bold)
            }
            if (message.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(message, color = PitGray)
            }
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = onDone,
                colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
            ) { Text(if (success) "Done" else "New Sale") }
        }
    }
}
