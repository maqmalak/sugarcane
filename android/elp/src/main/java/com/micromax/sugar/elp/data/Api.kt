package com.micromax.sugar.elp.data

import com.micromax.sugar.core.net.FrappeResponse
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** sugarcane.api.v1.elp on the mill's Frappe site (sign-in shared with EagleEye, as the "Vehicle Tracking" app). */
interface ElpApi {
    @FormUrlEncoded
    @POST("api/method/sugarcane.api.v1.survey.login")
    suspend fun login(
        @Field("usr") usr: String,
        @Field("pwd") pwd: String,
        @Field("android_id") androidId: String,
        @Field("device_name") deviceName: String,
        @Field("app_version") appVersion: String,
        @Field("os_version") osVersion: String,
        @Field("app") app: String = "Vehicle Tracking",
    ): FrappeResponse<LoginResult>

    @GET("api/method/sugarcane.api.v1.elp.masters")
    suspend fun masters(): FrappeResponse<Masters>

    @POST("api/method/sugarcane.api.v1.elp.upload")
    suspend fun upload(@Body body: UploadBody): FrappeResponse<UploadResult>

    @GET("api/method/sugarcane.api.v1.elp.mine")
    suspend fun mine(@Query("days") days: Int = 3): FrappeResponse<List<MyLoad>>

    @FormUrlEncoded
    @POST("api/method/sugarcane.api.v1.elp.cancel")
    suspend fun cancel(@Field("name") name: String, @Field("reason") reason: String): FrappeResponse<JsonObject>
}

@Serializable
data class LoginResult(
    val status: String, val message: String? = null, val device: String? = null, val user: String? = null,
    @SerialName("full_name") val fullName: String? = null, @SerialName("api_key") val apiKey: String? = null,
    @SerialName("api_secret") val apiSecret: String? = null,
)

@Serializable
data class Masters(
    @SerialName("server_time") val serverTime: String = "",
    val season: String? = null,
    @SerialName("can_register") val canRegister: Boolean = false,
    @SerialName("can_gate") val canGate: Boolean = false,
    val points: List<MPoint> = emptyList(),
    val rules: Rules = Rules(),
    @SerialName("vehicle_types") val vehicleTypes: List<String> = emptyList(),
    val vehicles: List<MVehicle> = emptyList(),
    val indents: List<MIndent> = emptyList(),
    @SerialName("in_transit") val inTransit: List<MTransit> = emptyList(),
    val mill: Mill = Mill(),
)

@Serializable data class MPoint(val type: String, val name: String, val title: String, val circle: String? = null,
    val latitude: Double? = null, val longitude: Double? = null, @SerialName("radius_m") val radiusM: Double = 0.0,
    val geofence: String? = null, @SerialName("journey_min") val journeyMin: Int = 0)
@Serializable data class Rules(@SerialName("min_sharpness") val minSharpness: Double = 60.0, @SerialName("min_brightness") val minBrightness: Double = 40.0,
    @SerialName("max_brightness") val maxBrightness: Double = 225.0, @SerialName("min_contrast") val minContrast: Double = 20.0,
    @SerialName("required_views") val requiredViews: List<String> = listOf("Number Plate", "Indent", "Driver", "Body Left"),
    @SerialName("buffer_m") val bufferM: Double = 30.0, @SerialName("require_indent") val requireIndent: Int = 1)
@Serializable data class MVehicle(@SerialName("registration_no") val no: String, @SerialName("vehicle_type") val type: String? = null,
    @SerialName("driver_name") val driverName: String? = null, @SerialName("driver_cnic") val driverCnic: String? = null,
    @SerialName("driver_mobile") val driverMobile: String? = null, @SerialName("is_blacklisted") val blacklisted: Int = 0)
@Serializable data class MIndent(val name: String, val grower: String? = null, @SerialName("grower_name") val growerName: String? = null,
    @SerialName("father_name") val fatherName: String? = null, val cnic: String? = null, val circle: String? = null,
    @SerialName("village_name") val village: String? = null, @SerialName("valid_from") val validFrom: String = "",
    @SerialName("valid_to") val validTo: String = "", @SerialName("load_maund") val loadMaund: Double = 0.0)
@Serializable data class MTransit(val name: String, @SerialName("vehicle_no") val vehicleNo: String, @SerialName("point_name") val point: String? = null,
    val indent: String? = null, @SerialName("grower_name") val growerName: String? = null, @SerialName("registered_at") val registeredAt: String = "",
    @SerialName("expected_arrival") val expected: String? = null, @SerialName("vehicle_type") val vehicleType: String? = null)
@Serializable data class Mill(val latitude: Double? = null, val longitude: Double? = null, val boundary: String? = null,
    @SerialName("buffer_m") val bufferM: Double = 500.0)

@Serializable data class UploadBody(val registrations: List<JsonObject> = emptyList(), val arrivals: List<JsonObject> = emptyList())
@Serializable data class ItemResult(val uuid: String? = null, val status: String, val name: String? = null, val message: String? = null)
@Serializable data class UploadResult(val registrations: List<ItemResult> = emptyList(), val arrivals: List<ItemResult> = emptyList())

@Serializable data class MyLoad(val name: String, val status: String, @SerialName("vehicle_no") val vehicleNo: String,
    @SerialName("point_name") val point: String? = null, @SerialName("grower_name") val growerName: String? = null,
    val indent: String? = null, @SerialName("registered_at") val registeredAt: String? = null,
    @SerialName("arrived_at") val arrivedAt: String? = null, @SerialName("reject_reason") val rejectReason: String? = null,
    @SerialName("registration_uuid") val uuid: String? = null, val overdue: Boolean = false)
