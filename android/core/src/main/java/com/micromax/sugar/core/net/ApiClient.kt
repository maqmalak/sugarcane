package com.micromax.sugar.core.net

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

val SugarJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    coerceInputValues = true
}

/** Frappe wraps every whitelisted method's return value in {"message": …}. */
@kotlinx.serialization.Serializable
data class FrappeResponse<T>(val message: T)

object ApiClient {
    /** Retrofit for a Frappe site: token auth + X-Device-Id on every call (the server checks the device binding). */
    fun <T> create(service: Class<T>, session: Session, deviceId: String, debug: Boolean = false): T {
        val http = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val b = chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .header("X-Device-Id", deviceId)
                session.token?.let { b.header("Authorization", it) }
                chain.proceed(b.build())
            }
            .apply { if (debug) addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }) }
            .build()
        return Retrofit.Builder()
            .baseUrl(session.serverUrl.trimEnd('/') + "/")
            .client(http)
            .addConverterFactory(SugarJson.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(service)
    }

    /** A readable message from a Frappe error response (exception text or _server_messages). */
    fun errorMessage(t: Throwable): String {
        if (t is HttpException) {
            val body = runCatching { t.response()?.errorBody()?.string() }.getOrNull()
            if (body != null) {
                runCatching {
                    val o = SugarJson.parseToJsonElement(body).jsonObject
                    o["_server_messages"]?.jsonPrimitive?.content?.let { raw ->
                        val first = SugarJson.parseToJsonElement(raw).jsonArray.firstOrNull()?.jsonPrimitive?.content
                        if (first != null) {
                            val msg = runCatching { SugarJson.parseToJsonElement(first).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
                            return stripHtml(msg ?: first)
                        }
                    }
                    (o["message"] ?: o["exception"])?.let { return stripHtml(text(it)) }
                }
            }
            return when (t.code()) {
                401 -> "Wrong email or password"
                403 -> "Not permitted — is this phone approved?"
                429 -> "Too many attempts, wait a minute"
                else -> "Server error ${t.code()}"
            }
        }
        return t.message ?: t.javaClass.simpleName
    }

    private fun text(e: JsonElement): String = if (e is JsonObject) e.toString() else e.jsonPrimitive.content
    private fun stripHtml(s: String) = s.replace(Regex("<[^>]+>"), "").trim()
}
