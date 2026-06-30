package com.mcracing.pos

import android.app.Application
import com.stripe.stripeterminal.TerminalApplicationDelegate

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // REQUIRED: wires the Stripe Terminal SDK into the app lifecycle.
        TerminalApplicationDelegate.onCreate(this)
    }
}
