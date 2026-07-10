package com.mcracing.pos.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    loading: Boolean,
    today: String,
    onRefresh: () -> Unit,
    onPick: (BookingDto) -> Unit,
    onWalkIn: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val open = bookings.filter { !isBookingDone(it.status) }
    val done = bookings.filter { isBookingDone(it.status) }

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
        Spacer(Modifier.height(12.dp))

        if (loading) {
            ConnectingScreen("Loading bookings…")
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
            ) {
                item { SectionHeader("Upcoming (${open.size})") }
                if (open.isEmpty()) {
                    item { Text("No upcoming bookings.", color = PitGray) }
                }
                items(open, key = { it.id }) { b -> BookingCard(b, today, onPick) }

                if (done.isNotEmpty()) {
                    item { Spacer(Modifier.height(8.dp)) }
                    item { SectionHeader("Completed today (${done.size})") }
                    items(done, key = { it.id }) { b -> BookingCard(b, today, onPick) }
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

@Composable
fun SaleScreen(
    draft: SaleDraft,
    connected: Boolean,
    customerQuery: String,
    customerHits: List<CustomerHit>,
    onCustomerQueryChange: (String) -> Unit,
    onCustomerPick: (CustomerHit) -> Unit,
    onClearCustomer: () -> Unit,
    onAmountChange: (String) -> Unit,
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
            Text("Build a session", color = PitGray, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..3).forEach { r ->
                    OutlinedButton(
                        onClick = { bRacers = r; applyBuilder(r, bHours) },
                        modifier = Modifier.weight(1f),
                        colors = if (bRacers == r) ButtonDefaults.outlinedButtonColors(contentColor = ApexRed) else ButtonDefaults.outlinedButtonColors(),
                    ) { Text("$r racer${if (r > 1) "s" else ""}", fontSize = 12.sp) }
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..3).forEach { h ->
                    OutlinedButton(
                        onClick = { bHours = h; applyBuilder(bRacers, h) },
                        modifier = Modifier.weight(1f),
                        colors = if (bHours == h) ButtonDefaults.outlinedButtonColors(contentColor = ApexRed) else ButtonDefaults.outlinedButtonColors(),
                    ) { Text("${h}h", fontSize = 12.sp) }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

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
        // Tax summary — subtotal is what staff entered; customer pays the total.
        val subtotalC = draft.amountCents()
        val taxC = computeTaxCents(subtotalC)
        val totalC = subtotalC + taxC
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

        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(Modifier.height(16.dp))

        Button(
            onClick = onCharge,
            enabled = connected && draft.amountCents() >= 50,
            modifier = Modifier.fillMaxWidth().height(60.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
        ) {
            Text(
                if (draft.amountCents() >= 50) "Charge ${centsToDollars(totalC)} on reader" else "Enter an amount",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        if (!connected) {
            Spacer(Modifier.height(6.dp))
            Text("Reader not connected yet…", color = PitGray, fontSize = 12.sp)
        }

        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = onRecordCash,
            enabled = draft.amountCents() >= 1,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Record ${centsToDollars(totalC)} cash") }

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

private enum class ConfirmAction(val title: String, val body: String) {
    Complete("Mark complete?", "Close out this booking as completed, even if it wasn't fully paid."),
    NoShow("Mark no-show?", "Flag this booking as a no-show."),
    Cancel("Cancel booking?", "Cancel this booking. This can't be undone from the reader."),
}

@Composable
fun CustomerConfirmScreen(
    amountCents: Long,
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
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("YOUR TOTAL", color = PitGray, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            Text(
                centsToDollars(totalCents),
                color = CompletedGreen,
                fontSize = 64.sp,
                fontWeight = FontWeight.Bold,
            )
            if (taxCents > 0) {
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
