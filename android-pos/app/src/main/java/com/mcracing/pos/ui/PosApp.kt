package com.mcracing.pos.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcracing.pos.net.ApiClient
import com.mcracing.pos.net.BookingActionRequest
import com.mcracing.pos.net.BookingDto
import com.mcracing.pos.net.CashPaymentRequest
import com.mcracing.pos.net.CustomerHit
import com.mcracing.pos.terminal.TerminalManager
import com.stripe.stripeterminal.external.models.ConnectionStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

/** Editable sale being charged. */
data class SaleDraft(
    val amountText: String = "",
    val description: String = "",
    val saleType: String = "in_person_sale",
    val customerId: String? = null,
    val customerName: String? = null,
    val bookingId: String? = null,
    val receiptEmail: String? = null,
    val sessionPriceCents: Long = 0,
    val paidCents: Long = 0,
) {
    fun amountCents(): Long {
        val v = amountText.toDoubleOrNull() ?: return 0L
        return (v * 100).roundToLong()
    }
}

private enum class Stage { Bookings, Sale, Processing, Result }

@Composable
fun PosApp() {
    val scope = rememberCoroutineScope()
    val connStatus by TerminalManager.connectionStatus.collectAsStateWithLifecycle()
    val connected = connStatus == ConnectionStatus.CONNECTED

    var stage by remember { mutableStateOf(Stage.Bookings) }
    var bookings by remember { mutableStateOf<List<BookingDto>>(emptyList()) }
    var today by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(SaleDraft()) }
    var resultSuccess by remember { mutableStateOf(false) }
    var resultTitle by remember { mutableStateOf("") }
    var resultAmount by remember { mutableStateOf(0L) }
    var resultMessage by remember { mutableStateOf("") }
    var customerQuery by remember { mutableStateOf("") }
    var customerHits by remember { mutableStateOf<List<CustomerHit>>(emptyList()) }

    fun showResult(success: Boolean, title: String, amountCents: Long = 0L, message: String = "") {
        resultSuccess = success
        resultTitle = title
        resultAmount = amountCents
        resultMessage = message
        stage = Stage.Result
    }

    fun loadBookings() {
        loading = true
        scope.launch {
            try {
                val resp = ApiClient.service.bookings()
                bookings = resp.bookings
                today = resp.today
            } catch (_: Exception) {
                // leave list as-is; walk-in flow still works
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadBookings() }

    // Debounced customer search for the walk-in flow.
    LaunchedEffect(customerQuery, draft.customerId) {
        if (draft.customerId != null || customerQuery.trim().length < 2) {
            customerHits = emptyList()
            return@LaunchedEffect
        }
        delay(250)
        customerHits = try {
            ApiClient.service.customersSearch(customerQuery.trim()).customers
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun recordCash() {
        stage = Stage.Processing
        scope.launch {
            val ok = try {
                ApiClient.service.cashPayment(
                    CashPaymentRequest(
                        bookingId = draft.bookingId,
                        customerId = draft.customerId,
                        amountCents = draft.amountCents(),
                        description = draft.description.ifBlank { "Cash payment" },
                        receiptEmail = draft.receiptEmail,
                        saleType = draft.saleType,
                    )
                ).success
            } catch (_: Exception) {
                false
            }
            if (ok) showResult(true, "Cash recorded", draft.amountCents())
            else showResult(false, "Couldn't record cash")
        }
    }

    fun doBookingAction(action: String, doneTitle: String) {
        val id = draft.bookingId ?: return
        stage = Stage.Processing
        scope.launch {
            val ok = try {
                ApiClient.service.bookingAction(BookingActionRequest(id, action)).success
            } catch (_: Exception) {
                false
            }
            if (ok) showResult(true, doneTitle) else showResult(false, "Action failed")
        }
    }

    when (stage) {
        Stage.Bookings -> BookingsScreen(
            bookings = bookings,
            loading = loading,
            today = today,
            onRefresh = { loadBookings() },
            onPick = { b ->
                // Prefill the REMAINING balance so a partly-paid booking is one
                // tap to finish; full price if nothing's been paid yet.
                val remaining = (b.sessionPriceCents - b.paidCents).coerceAtLeast(0)
                val prefill = if (remaining > 0) remaining else b.sessionPriceCents
                draft = SaleDraft(
                    amountText = "%.2f".format(prefill / 100.0),
                    description = "${if (b.sessionDate == today) "Today" else b.sessionDate} ${prettyTime(b.startTime)} — ${b.racerCount} racer(s), ${b.durationHours}h",
                    saleType = "booking_income",
                    customerId = b.customerId,
                    customerName = b.customerName,
                    bookingId = b.id,
                    receiptEmail = b.customerEmail,
                    sessionPriceCents = b.sessionPriceCents,
                    paidCents = b.paidCents,
                )
                stage = Stage.Sale
            },
            onWalkIn = {
                draft = SaleDraft()
                customerQuery = ""
                customerHits = emptyList()
                stage = Stage.Sale
            },
        )

        Stage.Sale -> SaleScreen(
            draft = draft,
            connected = connected,
            customerQuery = customerQuery,
            customerHits = customerHits,
            onCustomerQueryChange = { customerQuery = it },
            onCustomerPick = { hit ->
                draft = draft.copy(
                    customerId = hit.id,
                    customerName = hit.name,
                    receiptEmail = hit.email ?: draft.receiptEmail,
                )
                customerQuery = ""
                customerHits = emptyList()
            },
            onClearCustomer = {
                draft = draft.copy(customerId = null, customerName = null)
                customerQuery = ""
            },
            onAmountChange = { draft = draft.copy(amountText = it) },
            onDescriptionChange = { draft = draft.copy(description = it) },
            onEmailChange = { draft = draft.copy(receiptEmail = it) },
            onCharge = {
                stage = Stage.Processing
                scope.launch {
                    val result = TerminalManager.processSale(
                        amountCents = draft.amountCents(),
                        description = draft.description.ifBlank { "In-person sale" },
                        saleType = draft.saleType,
                        customerId = draft.customerId,
                        bookingId = draft.bookingId,
                        receiptEmail = draft.receiptEmail,
                    )
                    when (result) {
                        is TerminalManager.SaleResult.Success ->
                            showResult(true, "Payment approved", result.amountCents)
                        is TerminalManager.SaleResult.Failure ->
                            showResult(false, "Payment failed", 0L, result.message)
                    }
                }
            },
            onRecordCash = { recordCash() },
            onMarkComplete = { doBookingAction("complete", "Booking completed") },
            onNoShow = { doBookingAction("noshow", "Marked no-show") },
            onCancelBooking = { doBookingAction("cancel", "Booking cancelled") },
            onBack = { stage = Stage.Bookings },
        )

        Stage.Processing -> ProcessingScreen()

        Stage.Result -> ResultScreen(
            success = resultSuccess,
            title = resultTitle,
            amountCents = resultAmount,
            message = resultMessage,
            onDone = {
                draft = SaleDraft()
                customerQuery = ""
                customerHits = emptyList()
                loadBookings()
                stage = Stage.Bookings
            },
        )
    }
}
