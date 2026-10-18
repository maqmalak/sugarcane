package com.micromax.sugar.elp.data

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
import kotlinx.coroutines.flow.Flow

object Kind { const val REG = "REG"; const val ARR = "ARR" }
object State { const val READY = "READY"; const val SENT = "SENT"; const val ERROR = "ERROR" }

/** One registration (at a loading point) or arrival (at the gate) waiting to be sent, with its photo files. */
@Entity(tableName = "outbox")
data class LoadE(
    @PrimaryKey val uuid: String,
    val kind: String,
    val title: String,
    val subtitle: String,
    val indent: String? = null,
    val payload: String,       // JSON of the record without photos
    val photos: String,        // JSON array: [{view, path, latitude, longitude, taken_at, sharpness}]
    val state: String = State.READY,
    val error: String? = null,
    val serverName: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY createdAt DESC LIMIT 300") fun all(): Flow<List<LoadE>>
    @Query("SELECT * FROM outbox WHERE state = 'READY' ORDER BY createdAt LIMIT :limit") suspend fun ready(limit: Int): List<LoadE>
    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'READY'") fun readyCount(): Flow<Int>
    @Query("SELECT indent FROM outbox WHERE kind = 'REG' AND state != 'ERROR' AND indent IS NOT NULL")
    suspend fun usedIndents(): List<String>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(e: LoadE)
    @Query("UPDATE outbox SET state = :state, error = :error, serverName = :name WHERE uuid = :uuid")
    suspend fun mark(uuid: String, state: String, error: String?, name: String?)
    @Query("UPDATE outbox SET state = 'READY', error = NULL WHERE uuid = :uuid") suspend fun retry(uuid: String)
    @Query("DELETE FROM outbox WHERE uuid = :uuid") suspend fun delete(uuid: String)
    @Query("DELETE FROM outbox WHERE state = 'SENT' AND createdAt < :before") suspend fun purgeSent(before: Long)
}

@Database(entities = [LoadE::class], version = 1, exportSchema = true)
abstract class ElpDb : RoomDatabase() {
    abstract fun outbox(): OutboxDao

    companion object {
        @Volatile private var instance: ElpDb? = null
        fun get(context: Context): ElpDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, ElpDb::class.java, "elp.db").build().also { instance = it }
        }
    }
}
