package com.micromax.sugar.core.location

import android.annotation.SuppressLint
import android.content.Context
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

data class Fix(val lat: Double, val lng: Double, val accuracy: Float, val readings: Int, val time: Long)

/** GPS with averaging: listen for a few seconds and average the readings within 2 × the best accuracy. */
object Locator {
    @SuppressLint("MissingPermission")
    suspend fun fix(context: Context, seconds: Int = 8): Fix? {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val reads = mutableListOf<android.location.Location>()
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) { reads += result.locations }
        }
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).setMinUpdateIntervalMillis(500).build()
        client.requestLocationUpdates(req, callback, Looper.getMainLooper())
        try {
            delay(seconds * 1000L)
        } finally {
            client.removeLocationUpdates(callback)
        }
        if (reads.isEmpty()) {
            return suspendCancellableCoroutine { cont ->
                client.lastLocation.addOnSuccessListener { l -> cont.resume(l?.let { Fix(it.latitude, it.longitude, it.accuracy, 1, it.time) }) }
                    .addOnFailureListener { cont.resume(null) }
            }
        }
        val best = reads.minOf { it.accuracy }
        val good = reads.filter { it.accuracy <= best * 2 }
        return Fix(good.sumOf { it.latitude } / good.size, good.sumOf { it.longitude } / good.size, best, good.size, System.currentTimeMillis())
    }
}
