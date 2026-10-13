package com.micromax.sugar.eagleeye.sync

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
import com.micromax.sugar.eagleeye.data.Repository
import retrofit2.HttpException
import java.util.concurrent.TimeUnit

/** Uploads the outbox, then pulls changed masters. Runs every 15 minutes on a network, and on demand. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = Repository(applicationContext)
        if (!repo.session.isSignedIn) return Result.success()
        return try {
            val summary = repo.push()
            repo.pullMasters(full = inputData.getBoolean(KEY_FULL, false))
            Result.success(workDataOf(KEY_SUMMARY to summary))
        } catch (e: HttpException) {
            if (e.code() in listOf(401, 403)) Result.failure(workDataOf(KEY_SUMMARY to ApiClient.errorMessage(e)))
            else Result.retry()
        } catch (e: Exception) {
            if (runAttemptCount < 5) Result.retry() else Result.failure(workDataOf(KEY_SUMMARY to (e.message ?: "Sync failed")))
        }
    }

    companion object {
        const val KEY_SUMMARY = "summary"
        const val KEY_FULL = "full"
        const val NOW = "sync-now"
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(network)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun now(context: Context, full: Boolean = false) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(network)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setInputData(workDataOf(KEY_FULL to full))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
        }
    }
}
