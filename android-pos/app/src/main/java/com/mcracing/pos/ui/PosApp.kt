package com.mcracing.pos.ui

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcracing.pos.net.ApiClient
import com.mcracing.pos.net.BookingActionRequest
import com.mcracing.pos.net.BookingDto
import com.mcracing.pos.net.CashPaymentRequest
import com.mcracing.pos.net.CreateBookingRequest
import com.mcracing.pos.net.CustomerHit
import com.mcracing.pos.net.RacerDto
import com.mcracing.pos.terminal.TerminalManager
import com.stripe.stripeterminal.external.models.ConnectionStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

/**
 * Open the Stripe reader's admin/device settings (WiFi, screen timeout,
 * passcode, diagnostics). On Apps-on-Devices, once our app is the kiosk
 * launcher Stripe DISABLES the swipe-from-left-edge settings gesture — the
 * only supported way in is this deep link, which our app must expose. Stripe
 * still gates the menu behind the admin passcode (default 07139).
 */
private fun openStripeSettings(context: android.content.Context) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW).setData(Uri.parse("stripe://settings/"))
        )
    } catch (e: Exception) {
        // Non-Stripe hardware (e.g. an emulator) won't resolve the deep link.
        Toast.makeText(context, "Device settings unavailable on this hardware", Toast.LENGTH_SHORT).show()
    }
}

/** Editable sale being charged. */
data class SaleDraft(
    val amountText: String = "",
    // Optional split payment: cash the customer hands over (tax-INCLUSIVE dollars);
    // the remainder of the total goes on the card. Empty/0 = pay it all on card.
    val cashPaidText: String = "",
    val description: String = "",
    val saleType: String = "in_person_sale",
    val customerId: String? = null,
    val customerName: String? = null,
    val bookingId: String? = null,
    val receiptEmail: String? = null,
    val sessionPriceCents: Long = 0,
    val netPriceCents: Long = 0,
    val discountAmountCents: Long = 0,
    val discountCode: String? = null,
    val paidCents: Long = 0,
    val bookingStatus: String? = null,
    val racers: List<RacerDto> = emptyList(),
    val today: String = "",
    // RC car racing upsell (pre-tax cents) added on top of this sale — separate
    // from the sims, recorded as RC revenue rather than simulator revenue.
    val rcCents: Long = 0,
) {
    /** Discounted total to collect (falls back to session price when no discount). */
    fun effectiveNetCents(): Long = if (netPriceCents > 0) netPriceCents else sessionPriceCents
    fun amountCents(): Long {
        val v = amountText.toDoubleOrNull() ?: return 0L
        return (v * 100).roundToLong()
    }
    /** Cash the customer is handing over (tax-inclusive), for a split payment. */
    fun cashPaidCents(): Long {
        val v = cashPaidText.toDoubleOrNull() ?: return 0L
        return (v * 100).roundToLong().coerceAtLeast(0L)
    }
    /**
     * The full PRE-TAX subtotal for this sale: what staff typed plus any RC
     * upsell. Everything downstream (tax, total, the split, the confirm screen)
     * derives from this, so RC can never be silently left out of the charge.
     */
    fun subtotalCents(): Long = amountCents() + rcCents
}

/** "Add booking — no sale yet": a session put on the books to charge later. */
data class BookingDraft(
    val date: String = "", // ISO "YYYY-MM-DD"
    // Minutes from midnight, 12:00 (720) → 01:30 next morning (1530), matching
    // the web invite form's slot list. Converted to "HH:MM" for the API.
    val startMinutes: Int = 18 * 60,
    val racers: Int = 1,
    val hours: Int = 1,
    val priceText: String = "",
    val customerId: String? = null,
    val customerName: String? = null,
) {
    fun startTime(): String = "%02d:%02d".format((startMinutes / 60) % 24, startMinutes % 60)
    fun priceCents(): Long {
        val v = priceText.toDoubleOrNull() ?: return 0L
        return (v * 100).roundToLong().coerceAtLeast(0L)
    }
}

private enum class Stage { Bookings, Sale, NewBooking, CustomerConfirm, Processing, Result }

@Composable
fun PosApp() {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val connStatus by TerminalManager.connectionStatus.collectAsStateWithLifecycle()
    val connected = connStatus == ConnectionStatus.CONNECTED

    var stage by remember { mutableStateOf(Stage.Bookings) }
    var bookings by remember { mutableStateOf<List<BookingDto>>(emptyList()) }
    var today by remember { mutableStateOf("") }
    var tomorrow by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(SaleDraft()) }
    var resultSuccess by remember { mutableStateOf(false) }
    var resultTitle by remember { mutableStateOf("") }
    var resultAmount by remember { mutableStateOf(0L) }
    var resultMessage by remember { mutableStateOf("") }
    var customerQuery by remember { mutableStateOf("") }
    var customerHits by remember { mutableStateOf<List<CustomerHit>>(emptyList()) }
    var recentCheckins by remember { mutableStateOf<List<CustomerHit>>(emptyList()) }
    var bookingDraft by remember { mutableStateOf(BookingDraft()) }

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
                tomorrow = resp.tomorrow
            } catch (_: Exception) {
                // leave list as-is; walk-in flow still works
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadBookings() }

    // Recent liability forms. Someone signs at the kiosk then walks to the
    // counter, so this has to be fresh: reload on entering the sale screen and
    // keep polling while it's open (the effect cancels when the stage changes).
    LaunchedEffect(stage) {
        if (stage != Stage.Sale) return@LaunchedEffect
        while (true) {
            try {
                recentCheckins = ApiClient.service.recentCheckins().customers
            } catch (_: Exception) {
                // keep whatever we last had; the search box still works
            }
            delay(20_000)
        }
    }

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

    // Runs the sale on the Stripe reader (tip screen → tap card). Called only
    // AFTER the customer taps Confirm on our total screen, so the reader is
    // handed over showing the TOTAL — never the tip screen first.
    //
    // Split payments: if a cash amount was entered, record that cash first, then
    // charge the remaining balance on the card. The card portion carries the
    // full sales tax; the cash portion is recorded with tax_cents = 0 so the
    // two rows still sum to the correct total AND the correct tax.
    // The RC upsell is recorded in rc_cents, but name it on the receipt too so
    // the transaction reads as RC car racing rather than simulator time.
    fun withRc(base: String): String =
        if (draft.rcCents > 0) "$base · RC car racing ${centsToDollars(draft.rcCents)}" else base

    fun runSale() {
        stage = Stage.Processing
        scope.launch {
            val subtotal = draft.subtotalCents() // sale + any RC upsell, pre-tax
            val tax = computeTaxCents(subtotal)
            val total = subtotal + tax
            val cash = draft.cashPaidCents().coerceIn(0L, total)
            val card = total - cash

            // 1. Record the cash portion (if any).
            if (cash > 0) {
                val cashTax = if (card > 0) 0L else tax // all-cash → tax lives here
                val cashOk = try {
                    ApiClient.service.cashPayment(
                        CashPaymentRequest(
                            bookingId = draft.bookingId,
                            customerId = draft.customerId,
                            amountCents = cash,
                            description = withRc(draft.description.ifBlank { "Cash payment" }),
                            receiptEmail = draft.receiptEmail,
                            saleType = draft.saleType,
                            amountIncludesTax = true,
                            taxCents = cashTax,
                            // All-cash → the RC portion is recorded on this row;
                            // on a split it rides with the card leg instead.
                            rcCents = if (card > 0) 0L else draft.rcCents,
                        )
                    ).success
                } catch (_: Exception) {
                    false
                }
                if (!cashOk) {
                    showResult(false, "Couldn't record cash")
                    return@launch
                }
            }

            // 2. Nothing left for the card → it was an all-cash sale.
            if (card <= 0) {
                showResult(true, "Cash recorded", cash)
                return@launch
            }

            // 3. Charge the remaining balance on the card (tax-inclusive; the
            //    reader's tip screen runs on this portion).
            val result = TerminalManager.processSale(
                amountCents = card,
                description = withRc(draft.description.ifBlank { "In-person sale" }),
                saleType = draft.saleType,
                customerId = draft.customerId,
                bookingId = draft.bookingId,
                receiptEmail = draft.receiptEmail,
                amountIncludesTax = true,
                taxCents = tax,
                rcCents = draft.rcCents,
            )
            when (result) {
                is TerminalManager.SaleResult.Success ->
                    showResult(
                        true,
                        if (cash > 0) "Split payment approved" else "Payment approved",
                        result.amountCents + cash, // card (incl. tip) + cash collected
                    )
                is TerminalManager.SaleResult.Failure ->
                    showResult(
                        false,
                        if (cash > 0) "Card declined — $${"%.2f".format(cash / 100.0)} cash was recorded"
                        else "Payment failed",
                        0L,
                        result.message,
                    )
            }
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
                        amountCents = draft.subtotalCents(),
                        description = withRc(draft.description.ifBlank { "Cash payment" }),
                        receiptEmail = draft.receiptEmail,
                        saleType = draft.saleType,
                        rcCents = draft.rcCents,
                    )
                ).success
            } catch (_: Exception) {
                false
            }
            // Show the taxed total actually recorded (backend adds tax to the subtotal).
            if (ok) showResult(true, "Cash recorded", draft.subtotalCents() + computeTaxCents(draft.subtotalCents()))
            else showResult(false, "Couldn't record cash")
        }
    }

    // "Add booking — no sale yet": puts the session on the books so staff can
    // charge it later off the bookings list. No customer needed.
    fun createBooking() {
        stage = Stage.Processing
        scope.launch {
            val resp = try {
                ApiClient.service.createBooking(
                    CreateBookingRequest(
                        sessionDate = bookingDraft.date.ifBlank { today },
                        startTime = bookingDraft.startTime(),
                        durationHours = bookingDraft.hours,
                        racerCount = bookingDraft.racers,
                        priceCents = bookingDraft.priceCents(),
                        customerId = bookingDraft.customerId,
                    )
                )
            } catch (e: Exception) {
                showResult(false, "Couldn't add booking", 0L, e.message ?: "")
                return@launch
            }
            if (resp.success) {
                loadBookings() // so it shows in the list straight away
                showResult(true, "Booking added", bookingDraft.priceCents())
            } else {
                showResult(false, "Couldn't add booking", 0L, resp.error ?: "")
            }
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
            tomorrow = tomorrow,
            onRefresh = { loadBookings() },
            onOpenSettings = { openStripeSettings(context) },
            onPick = { b ->
                // Prefill the REMAINING balance (net of any online discount) so a
                // partly-paid booking is one tap to finish; the discounted total
                // if nothing's been paid yet.
                val remaining = b.remainingCents()
                val prefill = if (remaining > 0) remaining else b.effectiveNetCents()
                draft = SaleDraft(
                    amountText = "%.2f".format(prefill / 100.0),
                    description = "${if (b.sessionDate == today) "Today" else b.sessionDate} ${prettyTime(b.startTime)} — ${b.racerCount} racer(s), ${b.durationHours}h",
                    saleType = "booking_income",
                    customerId = b.customerId,
                    customerName = b.customerName,
                    bookingId = b.id,
                    receiptEmail = b.customerEmail,
                    sessionPriceCents = b.sessionPriceCents,
                    netPriceCents = b.netPriceCents,
                    discountAmountCents = b.discountAmountCents,
                    discountCode = b.discountCode,
                    paidCents = b.paidCents,
                    bookingStatus = b.status,
                    racers = b.racers,
                    today = today,
                )
                stage = Stage.Sale
            },
            onWalkIn = {
                draft = SaleDraft(today = today)
                customerQuery = ""
                customerHits = emptyList()
                stage = Stage.Sale
            },
            onNewBooking = {
                // Default to the standard price for 1 racer / 1 hour today.
                val d = today
                bookingDraft = BookingDraft(
                    date = d,
                    priceText = "%.2f".format(sessionPriceCents(d, 1, 1) / 100.0),
                )
                stage = Stage.NewBooking
            },
        )

        Stage.NewBooking -> NewBookingScreen(
            draft = bookingDraft,
            today = today,
            tomorrow = tomorrow,
            onChange = { bookingDraft = it },
            onCreate = { createBooking() },
            onBack = { stage = Stage.Bookings },
        )

        Stage.Sale -> SaleScreen(
            draft = draft,
            connected = connected,
            customerQuery = customerQuery,
            customerHits = customerHits,
            recentCheckins = recentCheckins,
            // RC car racing: each tap adds another $15/$20 on top of the sale.
            onAddRc = { cents -> draft = draft.copy(rcCents = draft.rcCents + cents) },
            onClearRc = { draft = draft.copy(rcCents = 0) },
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
            onCashPaidChange = { draft = draft.copy(cashPaidText = it) },
            onDescriptionChange = { draft = draft.copy(description = it) },
            onEmailChange = { draft = draft.copy(receiptEmail = it) },
            // Hand-off: show the customer the total to confirm BEFORE Stripe's
            // tip screen appears. runSale() (→ tip → tap card) fires on confirm.
            // If cash covers the whole total (no card balance), skip the reader
            // hand-off and record it straight away.
            onCharge = {
                val total = draft.subtotalCents() + computeTaxCents(draft.subtotalCents())
                val cash = draft.cashPaidCents().coerceIn(0L, total)
                if (total - cash > 0) stage = Stage.CustomerConfirm else runSale()
            },
            onRecordCash = { recordCash() },
            onMarkComplete = { doBookingAction("complete", "Booking completed") },
            onNoShow = { doBookingAction("noshow", "Marked no-show") },
            onCancelBooking = { doBookingAction("cancel", "Booking cancelled") },
            onBack = { stage = Stage.Bookings },
        )

        Stage.CustomerConfirm -> CustomerConfirmScreen(
            amountCents = draft.subtotalCents(),
            cashCents = draft.cashPaidCents().coerceIn(
                0L,
                draft.subtotalCents() + computeTaxCents(draft.subtotalCents()),
            ),
            description = draft.description.ifBlank { "In-person sale" },
            onConfirm = { runSale() },
            onCancel = { stage = Stage.Sale },
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
