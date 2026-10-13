package com.micromax.sugar.eagleeye.data

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

/** sugarcane.api.v1.survey on the mill's Frappe site. */
interface EagleEyeApi {
    @FormUrlEncoded
    @POST("api/method/sugarcane.api.v1.survey.login")
    suspend fun login(
        @Field("usr") usr: String,
        @Field("pwd") pwd: String,
        @Field("android_id") androidId: String,
        @Field("device_name") deviceName: String,
        @Field("app_version") appVersion: String,
        @Field("os_version") osVersion: String,
        @Field("app") app: String = "EagleEye",
    ): FrappeResponse<LoginResult>

    @GET("api/method/sugarcane.api.v1.survey.masters")
    suspend fun masters(@Query("since") since: String?): FrappeResponse<Masters>

    @POST("api/method/sugarcane.api.v1.survey.upload")
    suspend fun upload(@Body body: UploadBody): FrappeResponse<UploadResult>
}

@Serializable
data class LoginResult(
    val status: String,
    val message: String? = null,
    val device: String? = null,
    val user: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("api_key") val apiKey: String? = null,
    @SerialName("api_secret") val apiSecret: String? = null,
)

@Serializable
data class Masters(
    @SerialName("server_time") val serverTime: String,
    val full: Boolean = false,
    val settings: MasterSettings,
    val circles: List<MCircle> = emptyList(),
    val villages: List<MVillage> = emptyList(),
    val varieties: List<MVariety> = emptyList(),
    val diseases: List<MDisease> = emptyList(),
    val growers: List<MGrower> = emptyList(),
    @SerialName("competitor_mills") val competitorMills: List<MCompetitorMill> = emptyList(),
    val targets: List<MTarget> = emptyList(),
    @SerialName("my_surveys") val mySurveys: List<MSurvey> = emptyList(),
)

@Serializable
data class MasterSettings(
    val season: String? = null,
    @SerialName("geofence_radius_m") val geofenceRadiusM: Double = 200.0,
    @SerialName("tracking_interval_s") val trackingIntervalS: Int = 300,
    @SerialName("min_gps_accuracy_m") val minGpsAccuracyM: Double = 20.0,
    @SerialName("max_photo_mb") val maxPhotoMb: Double = 5.0,
    @SerialName("overlap_tolerance_pct") val overlapTolerancePct: Double = 5.0,
    val company: String? = null,
    @SerialName("mill_latitude") val millLatitude: Double? = null,
    @SerialName("mill_longitude") val millLongitude: Double? = null,
)

@Serializable data class MCircle(val name: String, @SerialName("circle_code") val code: String? = null, val zone: String? = null,
    val latitude: Double? = null, val longitude: Double? = null, val polygon: String? = null, @SerialName("is_active") val isActive: Int = 1)
@Serializable data class MVillage(val name: String, @SerialName("village_name") val title: String, @SerialName("village_code") val code: String? = null,
    val circle: String, val sector: String? = null, val latitude: Double? = null, val longitude: Double? = null, val polygon: String? = null,
    @SerialName("is_active") val isActive: Int = 1)
@Serializable data class MVariety(val name: String, @SerialName("expected_yield") val expectedYield: Double? = null,
    @SerialName("map_color") val color: String? = null, @SerialName("is_active") val isActive: Int = 1)
@Serializable data class MDisease(val name: String, val severity: String? = null)
@Serializable data class MGrower(val name: String, @SerialName("grower_name") val growerName: String, @SerialName("father_name") val fatherName: String? = null,
    val cnic: String? = null, @SerialName("passbook_no") val passbookNo: String? = null, val mobile: String? = null,
    val circle: String, val village: String, val disabled: Int = 0, @SerialName("grower_photo") val growerPhoto: String? = null)
@Serializable data class MCompetitorMill(val name: String, @SerialName("short_name") val shortName: String? = null,
    val latitude: Double? = null, val longitude: Double? = null, @SerialName("is_active") val isActive: Int = 1)
@Serializable data class MTarget(val name: String, val circle: String? = null, @SerialName("target_acres") val targetAcres: Double = 0.0,
    @SerialName("target_surveys") val targetSurveys: Int = 0)
@Serializable data class MSurvey(val name: String, @SerialName("survey_uuid") val uuid: String? = null,
    @SerialName("grower_name") val growerName: String? = null, val village: String? = null, val variety: String? = null,
    @SerialName("calc_area_acres") val acres: Double = 0.0, @SerialName("overlap_status") val overlapStatus: String? = null,
    @SerialName("survey_date") val surveyDate: String? = null)

@Serializable
data class UploadBody(val surveys: List<JsonObject> = emptyList(), val attendance: List<JsonObject> = emptyList(),
    val locations: List<JsonObject> = emptyList())

@Serializable data class ItemResult(val uuid: String? = null, val status: String, val name: String? = null, val message: String? = null)
@Serializable data class LocationResult(val received: Int = 0, val inserted: Int = 0)
@Serializable data class UploadResult(val surveys: List<ItemResult> = emptyList(), val attendance: List<ItemResult> = emptyList(),
    val locations: LocationResult = LocationResult(), @SerialName("server_time") val serverTime: String? = null)
