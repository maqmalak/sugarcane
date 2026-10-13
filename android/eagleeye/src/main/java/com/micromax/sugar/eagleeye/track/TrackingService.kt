package com.micromax.sugar.eagleeye.track

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.micromax.sugar.eagleeye.R
import com.micromax.sugar.eagleeye.data.EagleEyeDb
import com.micromax.sugar.eagleeye.data.FieldSettings
import com.micromax.sugar.eagleeye.data.LocationE
import com.micromax.sugar.eagleeye.data.Time
import com.micromax.sugar.eagleeye.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.UUID

/** Records the surveyor's route every few minutes (Sugar Settings → tracking interval) while checked in. */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val battery = (getSystemService(BATTERY_SERVICE) as BatteryManager).getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            val db = EagleEyeDb.get(this@TrackingService)
            scope.launch {
                result.locations.forEach { l ->
                    db.outbox().location(LocationE(UUID.randomUUID().toString(), Time.at(l.time), l.latitude, l.longitude, l.accuracy, l.speed, battery))
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = notification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(1, notification)
        val interval = FieldSettings(this).trackingIntervalS.coerceAtLeast(30) * 1000L
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval).setMinUpdateIntervalMillis(interval / 2).build()
        runCatching { client.requestLocationUpdates(req, callback, Looper.getMainLooper()) }
        return START_STICKY
    }

    override fun onDestroy() {
        client.removeLocationUpdates(callback)
        scope.cancel()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.tracking_channel), NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.tracking_text))
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    companion object {
        private const val CHANNEL = "tracking"
        private const val ACTION_STOP = "stop"
        fun start(context: Context) = ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
        fun stop(context: Context) = context.startService(Intent(context, TrackingService::class.java).setAction(ACTION_STOP))
    }
}
