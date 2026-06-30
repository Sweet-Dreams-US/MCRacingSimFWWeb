# R8 is disabled for release in build.gradle.kts to be safe with the Stripe
# Terminal SDK's reflection. If you later enable minification, keep the Stripe
# SDK and your data models.
-keep class com.stripe.** { *; }
-keep class com.mcracing.pos.net.** { *; }
