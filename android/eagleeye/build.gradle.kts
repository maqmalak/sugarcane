plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.micromax.sugar.eagleeye"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.micromax.sugar.eagleeye"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // the mill's ERP; can be changed on the sign-in screen
        buildConfigField("String", "DEFAULT_SERVER", "\"${project.findProperty("sugarServer") ?: "http://sugarcane.local:8006"}\"")
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // signed with the debug key until the mill's release keystore is set up (see android/README.md)
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.compose.tooling.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime)
    implementation(libs.osmdroid)
    implementation(libs.coil.compose)
    testImplementation(libs.junit)
}
