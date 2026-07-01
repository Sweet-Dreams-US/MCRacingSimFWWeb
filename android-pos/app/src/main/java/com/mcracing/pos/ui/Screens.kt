package com.mcracing.pos.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mcracing.pos.net.BookingDto
import com.mcracing.pos.ui.theme.ApexRed
import com.mcracing.pos.ui.theme.PitGray
import com.mcracing.pos.ui.theme.TelemetryCyan

fun centsToDollars(cents: Long): String = "$%.2f".format(cents / 100.0)

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

@Composable
fun BookingsScreen(
    bookings: List<BookingDto>,
    loading: Boolean,
    today: String,
    onRefresh: () -> Unit,
    onPick: (BookingDto) -> Unit,
    onWalkIn: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Bookings", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = ApexRed)
            OutlinedButton(onClick = onRefresh) { Text("Refresh") }
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
        } else if (bookings.isEmpty()) {
            Text("No upcoming bookings.", color = PitGray)
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
            ) {
                items(bookings) { b ->
                    Card(
                        onClick = { onPick(b) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(),
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    "${if (b.sessionDate == today) "Today" else b.sessionDate} · ${prettyTime(b.startTime)}",
                                    color = TelemetryCyan,
                                )
                                Text(centsToDollars(b.sessionPriceCents), fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                b.customerName ?: "No customer",
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                "${b.racerCount} racer${if (b.racerCount > 1) "s" else ""} · ${b.durationHours}h · ${b.id}",
                                color = PitGray,
                                fontSize = 12.sp,
                            )
                            if (b.paidCents > 0) {
                                val left = (b.sessionPriceCents - b.paidCents).coerceAtLeast(0)
                                Text(
                                    if (left > 0)
                                        "Paid ${centsToDollars(b.paidCents)} · ${centsToDollars(left)} left"
                                    else "Paid in full",
                                    color = TelemetryCyan,
                                    fontSize = 10.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SaleScreen(
    draft: SaleDraft,
    connected: Boolean,
    onAmountChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onCharge: () -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedButton(onClick = onBack) { Text("← Bookings") }
        Spacer(Modifier.height(12.dp))

        if (draft.bookingId != null) {
            Text("Linked booking ${draft.bookingId}", color = TelemetryCyan, fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
        }
        draft.customerName?.let {
            Text("Customer: $it", color = PitGray)
            Spacer(Modifier.height(8.dp))
        }
        if (draft.paidCents > 0) {
            val left = (draft.sessionPriceCents - draft.paidCents).coerceAtLeast(0)
            Text(
                "Paid ${centsToDollars(draft.paidCents)} of ${centsToDollars(draft.sessionPriceCents)} · ${centsToDollars(left)} left",
                color = TelemetryCyan,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
        }

        OutlinedTextField(
            value = draft.amountText,
            onValueChange = onAmountChange,
            label = { Text("Amount ($)") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                keyboardType = KeyboardType.Decimal
            ),
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
        Spacer(Modifier.height(20.dp))
        HorizontalDivider()
        Spacer(Modifier.height(20.dp))

        Button(
            onClick = onCharge,
            enabled = connected && draft.amountCents() >= 50,
            modifier = Modifier.fillMaxWidth().height(64.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
        ) {
            Text(
                if (draft.amountCents() >= 50) "Charge ${centsToDollars(draft.amountCents())}" else "Enter an amount",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        if (!connected) {
            Spacer(Modifier.height(8.dp))
            Text("Reader not connected yet…", color = PitGray, fontSize = 12.sp)
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
fun ResultScreen(success: Boolean, amountCents: Long, message: String, onDone: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (success) "✓" else "✕", fontSize = 64.sp, color = if (success) TelemetryCyan else ApexRed)
            Spacer(Modifier.height(12.dp))
            Text(
                if (success) "Payment Approved" else "Payment Failed",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
            )
            if (success) {
                Spacer(Modifier.height(8.dp))
                Text(centsToDollars(amountCents), fontSize = 32.sp, fontWeight = FontWeight.Bold)
            } else if (message.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(message, color = PitGray)
            }
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = onDone,
                colors = ButtonDefaults.buttonColors(containerColor = ApexRed),
            ) { Text("New Sale") }
        }
    }
}
