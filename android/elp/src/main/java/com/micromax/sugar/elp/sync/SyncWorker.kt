package com.micromax.sugar.elp.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.micromax.sugar.core.net.ApiClient
import com.micromax.sugar.elp.data.Repository
import retrofit2.HttpException
import java.util.concurrent.TimeUnit

/** Sends waiting registrations / arrivals, then refreshes masters. Every 15 minutes on a network, and right after saving. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = Repository(applicationContext)
        if (!repo.session.isSignedIn) return Result.success()
        return try {
            val summary = repo.push()
            repo.pullMasters()
            Result.success(workDataOf(KEY_SUMMARY to summary))
        } catch (e: HttpException) {
            if (e.code() in listOf(401, 403)) Result.failure(workDataOf(KEY_SUMMARY to ApiClient.errorMessage(e))) else Result.retry()
        } catch (e: Exception) {
            if (runAttemptCount < 8) Result.retry() else Result.failure(workDataOf(KEY_SUMMARY to (e.message ?: "Sync failed")))
        }
    }

    companion object {
        const val KEY_SUMMARY = "summary"
        const val NOW = "elp-sync-now"
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(network)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("elp-sync-periodic", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun now(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(network)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
        }
    }
}
