package com.micromax.sugar.eagleeye.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

// ---------------------------------------------------------------- masters (downloaded)
@Entity(tableName = "circle") data class CircleE(@PrimaryKey val name: String, val code: String?, val lat: Double?, val lng: Double?, val polygon: String?)
@Entity(tableName = "village") data class VillageE(@PrimaryKey val name: String, val title: String, val code: String?, val circle: String,
    val sector: String?, val lat: Double?, val lng: Double?, val polygon: String?)
@Entity(tableName = "variety") data class VarietyE(@PrimaryKey val name: String, val expectedYield: Double?, val color: String?)
@Entity(tableName = "disease") data class DiseaseE(@PrimaryKey val name: String, val severity: String?)
@Entity(tableName = "grower") data class GrowerE(@PrimaryKey val name: String, val growerName: String, val fatherName: String?, val cnic: String?,
    val passbookNo: String?, val mobile: String?, val circle: String, val village: String)
@Entity(tableName = "target") data class TargetE(@PrimaryKey val name: String, val circle: String?, val targetAcres: Double, val targetSurveys: Int)

// ---------------------------------------------------------------- outbox (made on the phone)
object SyncState {
    const val DRAFT = "Draft"
    const val READY = "Ready"
    const val SYNCED = "Synced"
    const val ERROR = "Error"
}

@Entity(tableName = "survey")
data class SurveyE(
    @PrimaryKey val uuid: String,
    val state: String = SyncState.DRAFT,
    val serverName: String? = null,
    val error: String? = null,
    val surveyFor: String = "Company",
    val competitorMill: String? = null,
    val grower: String? = null,
    val growerName: String? = null,
    val circle: String? = null,
    val village: String? = null,
    val murabbaNo: String? = null,
    val killaNo: String? = null,
    val totalAcres: Double? = null,
    val emptyAcres: Double? = null,
    val cropAcres: Double? = null,
    val variety: String? = null,
    val cropType: String = "Plant",
    val ratoonNo: Int? = null,
    val condition: String = "Good",
    val disease: String? = null,
    val diseasePct: Double? = null,
    val polygon: String? = null, // GeoJSON Polygon
    val measuredAcres: Double = 0.0,
    val gpsAccuracy: Double? = null,
    val remarks: String? = null,
    val capturedAt: String,
    val updatedAt: Long = System.currentTimeMillis(),
    val overlapStatus: String? = null,
)

@Entity(tableName = "photo")
data class PhotoE(@PrimaryKey val uuid: String, val surveyUuid: String, val path: String, val caption: String?, val lat: Double?,
    val lng: Double?, val takenAt: String, val sharpness: Double)

@Entity(tableName = "attendance")
data class AttendanceE(
    @PrimaryKey val uuid: String,
    val date: String,
    val timeIn: String,
    val latIn: Double, val lngIn: Double, val accIn: Float,
    val selfieIn: String?,
    val insideIn: Boolean,
    val timeOut: String? = null,
    val latOut: Double? = null, val lngOut: Double? = null, val accOut: Float? = null,
    val selfieOut: String? = null,
    val insideOut: Boolean? = null,
    val sentIn: Boolean = false,
    val sentOut: Boolean = false,
    val serverName: String? = null,
    val error: String? = null,
)

@Entity(tableName = "location")
data class LocationE(@PrimaryKey val uuid: String, val loggedAt: String, val lat: Double, val lng: Double, val accuracy: Float,
    val speed: Float, val battery: Int, val synced: Boolean = false)

@Dao
interface MastersDao {
    @Upsert suspend fun circles(rows: List<CircleE>)
    @Upsert suspend fun villages(rows: List<VillageE>)
    @Upsert suspend fun varieties(rows: List<VarietyE>)
    @Upsert suspend fun diseases(rows: List<DiseaseE>)
    @Upsert suspend fun growers(rows: List<GrowerE>)
    @Query("DELETE FROM target") suspend fun clearTargets()
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun targets(rows: List<TargetE>)
    @Query("DELETE FROM grower WHERE name IN (:names)") suspend fun deleteGrowers(names: List<String>)
    @Query("DELETE FROM circle") suspend fun clearCircles()
    @Query("DELETE FROM village") suspend fun clearVillages()
    @Query("DELETE FROM grower") suspend fun clearGrowers()

    @Query("SELECT * FROM circle ORDER BY code") fun circles(): Flow<List<CircleE>>
    @Query("SELECT * FROM circle WHERE name IN (:names)") suspend fun circlesNamed(names: List<String>): List<CircleE>
    @Query("SELECT * FROM village WHERE circle = :circle ORDER BY title") fun villages(circle: String): Flow<List<VillageE>>
    @Query("SELECT * FROM village WHERE name = :name") suspend fun village(name: String): VillageE?
    @Query("SELECT * FROM variety ORDER BY name") fun varieties(): Flow<List<VarietyE>>
    @Query("SELECT * FROM disease ORDER BY name") fun diseases(): Flow<List<DiseaseE>>
    @Query("SELECT * FROM target") fun targets(): Flow<List<TargetE>>
    @Query("SELECT * FROM target") suspend fun targetList(): List<TargetE>
    @Query("""SELECT * FROM grower WHERE (:circle IS NULL OR circle = :circle) AND (growerName LIKE '%' || :q || '%'
        OR cnic LIKE '%' || :q || '%' OR name LIKE '%' || :q || '%' OR passbookNo LIKE '%' || :q || '%') ORDER BY growerName LIMIT 40""")
    suspend fun searchGrowers(q: String, circle: String?): List<GrowerE>
    @Query("SELECT COUNT(*) FROM grower") fun growerCount(): Flow<Int>
}

@Dao
interface OutboxDao {
    @Upsert suspend fun save(s: SurveyE)
    @Query("SELECT * FROM survey WHERE uuid = :uuid") suspend fun survey(uuid: String): SurveyE?
    @Query("SELECT * FROM survey ORDER BY updatedAt DESC") fun surveys(): Flow<List<SurveyE>>
    @Query("SELECT * FROM survey WHERE state = 'Ready' ORDER BY updatedAt LIMIT :limit") suspend fun ready(limit: Int): List<SurveyE>
    @Query("UPDATE survey SET state = :state, serverName = :name, error = :error WHERE uuid = :uuid")
    suspend fun mark(uuid: String, state: String, name: String?, error: String?)
    @Query("UPDATE survey SET overlapStatus = :status WHERE serverName = :name") suspend fun overlap(name: String, status: String?)
    @Query("DELETE FROM survey WHERE uuid = :uuid AND state != 'Synced'") suspend fun deleteDraft(uuid: String)
    @Query("SELECT COUNT(*) FROM survey WHERE state = 'Ready' OR state = 'Error'") fun pendingSurveys(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun photo(p: PhotoE)
    @Query("SELECT * FROM photo WHERE surveyUuid = :uuid ORDER BY takenAt") fun photos(uuid: String): Flow<List<PhotoE>>
    @Query("SELECT * FROM photo WHERE surveyUuid = :uuid ORDER BY takenAt") suspend fun photoList(uuid: String): List<PhotoE>
    @Query("DELETE FROM photo WHERE uuid = :uuid") suspend fun deletePhoto(uuid: String)

    @Upsert suspend fun attendance(a: AttendanceE)
    @Query("SELECT * FROM attendance WHERE date = :date LIMIT 1") suspend fun attendanceOn(date: String): AttendanceE?
    @Query("SELECT * FROM attendance WHERE date = :date LIMIT 1") fun attendanceFlow(date: String): Flow<AttendanceE?>
    @Query("SELECT * FROM attendance WHERE sentIn = 0 OR (timeOut IS NOT NULL AND sentOut = 0)") suspend fun unsentAttendance(): List<AttendanceE>
    @Query("SELECT * FROM attendance WHERE timeOut IS NULL ORDER BY timeIn DESC LIMIT 1") suspend fun openAttendance(): AttendanceE?

    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun location(l: LocationE)
    @Query("SELECT * FROM location WHERE synced = 0 ORDER BY loggedAt LIMIT :limit") suspend fun unsentLocations(limit: Int): List<LocationE>
    @Query("UPDATE location SET synced = 1 WHERE uuid IN (:uuids)") suspend fun markLocations(uuids: List<String>)
    @Query("DELETE FROM location WHERE synced = 1 AND loggedAt < :before") suspend fun pruneLocations(before: String)
    @Query("SELECT COUNT(*) FROM location WHERE synced = 0") fun pendingLocations(): Flow<Int>
}

@Database(entities = [CircleE::class, VillageE::class, VarietyE::class, DiseaseE::class, GrowerE::class, TargetE::class,
    SurveyE::class, PhotoE::class, AttendanceE::class, LocationE::class], version = 1, exportSchema = true)
abstract class EagleEyeDb : RoomDatabase() {
    abstract fun masters(): MastersDao
    abstract fun outbox(): OutboxDao

    companion object {
        @Volatile private var instance: EagleEyeDb? = null
        fun get(context: Context): EagleEyeDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, EagleEyeDb::class.java, "eagleeye.db").build().also { instance = it }
        }
    }
}
