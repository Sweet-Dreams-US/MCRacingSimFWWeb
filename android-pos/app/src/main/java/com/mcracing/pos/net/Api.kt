package com.mcracing.pos.net

import com.mcracing.pos.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

// ---- DTOs (match the Next.js /api/terminal/* JSON exactly) ------------------

data class ConnectionTokenResponse(val secret: String)

data class BookingDto(
    val id: String,
    val sessionDate: String,
    val startTime: String,
    val durationHours: Int,
    val racerCount: Int,
    val sessionPriceCents: Long,
    val paidCents: Long = 0,
    val status: String,
    val customerId: String?,
    val customerName: String?,
    val customerEmail: String?,
    val customerPhone: String?,
)

data class BookingsResponse(val bookings: List<BookingDto>, val today: String)

data class CreatePaymentRequest(
    val amountCents: Long,
    val description: String,
    val saleType: String,        // "booking_income" | "in_person_sale" | "other_income"
    val customerId: String?,
    val bookingId: String?,
    val receiptEmail: String?,
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
