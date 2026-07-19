package com.mcracing.pos.net

import com.mcracing.pos.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

// ---- DTOs (match the Next.js /api/terminal/* JSON exactly) ------------------

data class ConnectionTokenResponse(val secret: String)

data class RacerDto(
    val name: String,
    val email: String?,
)

data class BookingDto(
    val id: String,
    val sessionDate: String,
    val startTime: String,
    val durationHours: Int,
    val racerCount: Int,
    val sessionPriceCents: Long,
    // What staff should actually collect: session price minus any online discount.
    val netPriceCents: Long = 0,
    val discountAmountCents: Long = 0,
    val discountCode: String? = null,
    val paidCents: Long = 0,
    val status: String,
    val customerId: String?,
    val customerName: String?,
    val customerEmail: String?,
    val customerPhone: String?,
    val racers: List<RacerDto> = emptyList(),
) {
    /** Amount owed = discounted price minus anything already paid (never below 0). */
    fun remainingCents(): Long {
        val net = if (netPriceCents > 0) netPriceCents else sessionPriceCents
        return (net - paidCents).coerceAtLeast(0)
    }
    fun effectiveNetCents(): Long = if (netPriceCents > 0) netPriceCents else sessionPriceCents
}

// A staff-set availability block (personal appointment / closure). The sims are
// held off the booking calendar during this window; shown flagged on the
// bookings screen so staff know NOT to sell that time. startTime/endTime are
// null for a whole-day block.
data class BlockDto(
    val id: String,
    val blockDate: String,
    val startTime: String? = null,
    val endTime: String? = null,
    val reason: String? = null,
)

data class BookingsResponse(
    val bookings: List<BookingDto>,
    // Additive field (older builds ignore it via Gson). Personal-appointment /
    // closure blocks for the same window as the bookings.
    val blocks: List<BlockDto> = emptyList(),
    val today: String,
    val tomorrow: String = "",
)

data class CreatePaymentRequest(
    val amountCents: Long,
    val description: String,
    val saleType: String,        // "booking_income" | "in_person_sale" | "other_income"
    val customerId: String?,
    val bookingId: String?,
    val receiptEmail: String?,
    // Split payments: when true, amountCents is the exact (tax-inclusive) card
    // amount and taxCents is its tax portion — the backend won't re-add tax.
    val amountIncludesTax: Boolean = false,
    val taxCents: Long = 0,
    // RC car racing upsell (pre-tax) already included in amountCents — broken
    // out so it's recorded as RC revenue, not simulator revenue.
    val rcCents: Long = 0,
)

data class PaymentIntentResponse(val paymentIntentId: String, val secret: String)

data class UpdatePaymentRequest(val paymentIntentId: String, val receiptEmail: String?)

data class CapturePaymentRequest(val paymentIntentId: String)

data class CaptureResponse(
    val paymentIntentId: String,
    val secret: String?,
    val amountCents: Long?,
    val status: String?,
)

data class CustomerHit(
    val id: String,
    val name: String,
    val email: String?,
    val phone: String?,
    // Only set by recent_checkins — when they signed the liability form.
    val signedAt: String? = null,
)

data class CustomersResponse(val customers: List<CustomerHit>)

data class BookingActionRequest(
    val bookingId: String,
    val action: String, // "complete" | "noshow" | "cancel" | "note"
    val note: String? = null,
)

data class CashPaymentRequest(
    val bookingId: String?,
    val customerId: String?,
    val amountCents: Long,
    val description: String,
    val receiptEmail: String?,
    val saleType: String?,
    // Split payments: when true, amountCents is the exact (tax-inclusive) cash
    // amount and taxCents is its tax portion — the backend won't re-add tax.
    val amountIncludesTax: Boolean = false,
    val taxCents: Long = 0,
    val rcCents: Long = 0,
)

data class CreateBookingRequest(
    val sessionDate: String,   // "YYYY-MM-DD"
    val startTime: String,     // "HH:MM" 24-hour
    val durationHours: Int,
    val racerCount: Int,
    val priceCents: Long,
    val customerId: String? = null,
    val sendCustomerEmail: Boolean = false,
)

data class CreateBookingResponse(
    val success: Boolean = false,
    val bookingId: String? = null,
    val error: String? = null,
)

data class ActionResponse(
    val success: Boolean = false,
    val error: String? = null,
    val transactionId: String? = null,
)

// ---- Retrofit service -------------------------------------------------------

interface BackendService {
    // Trailing slashes are intentional: the Next.js backend runs trailingSlash:true,
    // so the slash-less form 308-redirects. Hitting the canonical URL avoids a
    // redirect hop on every call.
    @POST("connection_token/")
    suspend fun connectionToken(): ConnectionTokenResponse

    @GET("bookings/")
    suspend fun bookings(): BookingsResponse

    @POST("create_payment_intent/")
    suspend fun createPaymentIntent(@Body body: CreatePaymentRequest): PaymentIntentResponse

    @POST("update_payment_intent/")
    suspend fun updatePaymentIntent(@Body body: UpdatePaymentRequest): PaymentIntentResponse

    @POST("capture_payment_intent/")
    suspend fun capturePaymentIntent(@Body body: CapturePaymentRequest): CaptureResponse

    @GET("customers/search/")
    suspend fun customersSearch(@Query("q") q: String): CustomersResponse

    @POST("booking_action/")
    suspend fun bookingAction(@Body body: BookingActionRequest): ActionResponse

    @POST("cash_payment/")
    suspend fun cashPayment(@Body body: CashPaymentRequest): ActionResponse

    /** Recent liability forms — who just signed the waiver at the kiosk. */
    @GET("customers/recent_checkins/")
    suspend fun recentCheckins(): CustomersResponse

    /** "Add booking — no sale yet": put a session on the books, charge later. */
    @POST("create_booking/")
    suspend fun createBooking(@Body body: CreateBookingRequest): CreateBookingResponse
}

// ---- Client -----------------------------------------------------------------

object ApiClient {
    val service: BackendService by lazy {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                // Device-key auth on every call (matches POS_DEVICE_KEY on the server).
                val req = chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer ${BuildConfig.DEVICE_KEY}")
                    .addHeader("Content-Type", "application/json")
                    .build()
                chain.proceed(req)
            }
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            })
            .build()

        Retrofit.Builder()
            .baseUrl(BuildConfig.BACKEND_URL) // must end with "/"
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(BackendService::class.java)
    }
}
