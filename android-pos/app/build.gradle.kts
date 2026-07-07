import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Load BACKEND_URL + DEVICE_KEY from local.properties (never commit it).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun localProp(key: String, default: String) =
    (localProps.getProperty(key) ?: System.getenv(key) ?: default)

// Release signing — keystore + passwords come from local.properties (gitignored).
val keystoreFile = rootProject.file(localProp("KEYSTORE_FILE", "release.keystore"))

android {
    namespace = "com.mcracing.pos"
    compileSdk = 35

    signingConfigs {
        create("release") {
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = localProp("KEYSTORE_PASSWORD", "")
                keyAlias = localProp("KEY_ALIAS", "mcracing")
                keyPassword = localProp("KEY_PASSWORD", "")
            }
        }
    }

    defaultConfig {
        applicationId = "com.mcracing.pos"
        minSdk = 28
        targetSdk = 35
        versionCode = 5
        versionName = "1.4"

        // Backend base URL (Next.js) + device key, injected at build time.
        buildConfigField(
            "String",
            "BACKEND_URL",
            "\"${localProp("BACKEND_URL", "https://www.mcracingfortwayne.com/api/terminal/")}\""
        )
        buildConfigField(
            "String",
            "DEVICE_KEY",
            "\"${localProp("DEVICE_KEY", "")}\""
        )
    }

    buildTypes {
        release {
            // Keep R8 off to start — avoids stripping Stripe SDK reflection.
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystoreFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // --- Stripe Terminal: Apps on Devices (S700/S710). Pinned to one version. ---
    // IMPORTANT: do NOT also add com.stripe:stripeterminal (top-level) — mixing
    // it with the appsondevices artifact breaks the build/connection.
    implementation("com.stripe:stripeterminal-core:5.6.0")
    implementation("com.stripe:stripeterminal-appsondevices:5.6.0")
    implementation("com.stripe:stripeterminal-ktx:5.6.0")

    // --- Networking to our backend ---
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // --- Coroutines ---
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")

    // --- Compose UI ---
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
}
