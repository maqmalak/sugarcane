plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.micromax.sugar.core"
    compileSdk = 34
    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(libs.androidx.core.ktx)
    api(libs.retrofit)
    api(libs.retrofit.serialization)
    api(libs.okhttp)
    api(libs.serialization.json)
    api(libs.play.location)
    implementation(libs.okhttp.logging)
    implementation(libs.security.crypto)
    implementation(libs.exifinterface)
    testImplementation(libs.junit)
}
