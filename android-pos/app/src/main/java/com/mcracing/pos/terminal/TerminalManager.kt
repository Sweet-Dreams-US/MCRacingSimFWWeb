package com.mcracing.pos.terminal

import android.content.Context
import com.mcracing.pos.net.ApiClient
import com.mcracing.pos.net.CapturePaymentRequest
import com.mcracing.pos.net.CreatePaymentRequest
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.AppsOnDevicesListener
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.CollectPaymentIntentConfiguration
import com.stripe.stripeterminal.external.models.ConfirmPaymentIntentConfiguration
import com.stripe.stripeterminal.external.models.ConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.models.DisconnectReason
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration
import com.stripe.stripeterminal.external.models.EasyConnectConfiguration
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.PaymentIntentStatus
import com.stripe.stripeterminal.external.models.PaymentStatus
import com.stripe.stripeterminal.external.models.Reader
import com.stripe.stripeterminal.external.models.ReaderEvent
import com.stripe.stripeterminal.external.models.TerminalException
import com.stripe.stripeterminal.log.LogLevel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Owns the Stripe Terminal lifecycle for Apps on Devices: init, connect (to the
 * reader this app is running ON), and the on-device payment flow.
 *
 * SDK: com.stripe:stripeterminal-{core,appsondevices,ktx}:5.6.0
 * The ktx artifact provides the suspend extensions retrievePaymentIntent /
 * processPaymentIntent used below.
 */
object TerminalManager {

    private val ioScope = CoroutineScope(Dispatchers.IO)

    val connectionStatus = MutableStateFlow(ConnectionStatus.NOT_CONNECTED)
    val readerLabel = MutableStateFlow<String?>(null)

    val isConnected: StateFlow<ConnectionStatus> get() = connectionStatus

    // --- Connection token: fetched from OUR backend -------------------------
    private val tokenProvider = object : ConnectionTokenProvider {
        override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
            ioScope.launch {
                try {
                    val token = ApiClient.service.connectionToken().secret
                    callback.onSuccess(token)
                } catch (e: Exception) {
                    callback.onFailure(
                        ConnectionTokenException("Failed to fetch connection token", e)
                    )
                }
            }
        }
    }

    private val terminalListener = object : TerminalListener {
        override fun onConnectionStatusChange(status: ConnectionStatus) {
            connectionStatus.value = status
        }
        override fun onPaymentStatusChange(status: PaymentStatus) { /* no-op */ }
    }

    /** Call once after location permission is granted + GPS is on. */
    fun init(context: Context) {
        if (!Terminal.isInitialized()) {
            Terminal.init(
                context.applicationContext,
                LogLevel.VERBOSE,
                tokenProvider,
                terminalListener,
                null, // offlineListener (required arg, nullable)
            )
        }
    }

    /** Discover + connect to the on-device reader in one call (Apps on Devices). */
    fun connect(onError: (String) -> Unit = {}) {
        val discoveryConfig = DiscoveryConfiguration.AppsOnDevicesDiscoveryConfiguration()
        val connectionConfig = ConnectionConfiguration.AppsOnDevicesConnectionConfiguration(
            object : AppsOnDevicesListener {
                override fun onDisconnect(reason: DisconnectReason) {
                    connectionStatus.value = ConnectionStatus.NOT_CONNECTED
                    readerLabel.value = null
                }
                override fun onReportReaderEvent(event: ReaderEvent) { /* log if needed */ }
            }
        )
        Terminal.getInstance().easyConnect(
            EasyConnectConfiguration.AppsOnDevicesEasyConnectionConfiguration(
                discoveryConfiguration = discoveryConfig,
                connectionConfiguration = connectionConfig,
            ),
            object : ReaderCallback {
                override fun onSuccess(reader: Reader) {
                    readerLabel.value = reader.label ?: reader.id ?: "Reader"
                    connectionStatus.value = ConnectionStatus.CONNECTED
                }
                override fun onFailure(e: TerminalException) {
                    onError(e.errorMessage)
                }
            }
        )
    }

    // --- Payment: create (backend) → collect+confirm (device) → capture ------

    sealed class SaleResult {
        data class Success(val amountCents: Long) : SaleResult()
        data class Failure(val message: String) : SaleResult()
    }

    /**
     * Runs a full sale on the reader. The Stripe Reader app takes over for card
     * capture + the on-reader tip screen during processPaymentIntent.
     */
    suspend fun processSale(
        amountCents: Long,
        description: String,
        saleType: String,
        customerId: String?,
        bookingId: String?,
        receiptEmail: String?,
    ): SaleResult {
        return try {
            // 1. Create the PaymentIntent on our backend (manual capture).
            val created = ApiClient.service.createPaymentIntent(
                CreatePaymentRequest(
                    amountCents = amountCents,
                    description = description,
                    saleType = saleType,
                    customerId = customerId,
                    bookingId = bookingId,
                    receiptEmail = receiptEmail,
                )
            )

            // 2. Pull it into the SDK by client secret.
            val intent = retrievePaymentIntent(created.secret)

            // 3. Collect + confirm ON the device — the Stripe Reader app shows the
            //    on-reader tip screen here (skipTipping = false).
            val processed = collectAndConfirm(intent)

            if (processed.status != PaymentIntentStatus.REQUIRES_CAPTURE) {
                return SaleResult.Failure("Payment not ready to capture (${processed.status}).")
            }

            // 4. Capture on the backend (final amount includes the tip).
            val captured = ApiClient.service.capturePaymentIntent(
                CapturePaymentRequest(created.paymentIntentId)
            )
            SaleResult.Success(captured.amountCents ?: amountCents)
        } catch (e: TerminalException) {
            SaleResult.Failure(e.errorMessage)
        } catch (e: Exception) {
            SaleResult.Failure(e.message ?: "Sale failed")
        }
    }

    // The SDK's payment methods are callback-based; wrap them as suspend funcs.
    private suspend fun retrievePaymentIntent(secret: String): PaymentIntent =
        suspendCancellableCoroutine { cont ->
            Terminal.getInstance().retrievePaymentIntent(
                secret,
                object : PaymentIntentCallback {
                    override fun onSuccess(paymentIntent: PaymentIntent) = cont.resume(paymentIntent)
                    override fun onFailure(e: TerminalException) = cont.resumeWithException(e)
                },
            )
        }

    private suspend fun collectAndConfirm(intent: PaymentIntent): PaymentIntent =
        suspendCancellableCoroutine { cont ->
            Terminal.getInstance().processPaymentIntent(
                intent,
                CollectPaymentIntentConfiguration.Builder().skipTipping(false).build(),
                ConfirmPaymentIntentConfiguration.Builder().build(),
                object : PaymentIntentCallback {
                    override fun onSuccess(paymentIntent: PaymentIntent) = cont.resume(paymentIntent)
                    override fun onFailure(e: TerminalException) = cont.resumeWithException(e)
                },
            )
        }
}
