package com.micromax.sugar.core.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File

object Photos {
    /** Decode, rotate per EXIF, scale the long side to maxPx and re-encode as JPEG. */
    fun compress(context: Context, uri: Uri, maxPx: Int = 1600, quality: Int = 80): ByteArray {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxPx) sample *= 2
        val bmp = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: error("Could not read the photo")
        val rotation = context.contentResolver.openInputStream(uri)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f
        val scale = minOf(1f, maxPx.toFloat() / maxOf(bmp.width, bmp.height))
        val m = Matrix().apply { postRotate(rotation); postScale(scale, scale) }
        val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        return ByteArrayOutputStream().use { s -> out.compress(Bitmap.CompressFormat.JPEG, quality, s); s.toByteArray() }
    }

    fun save(context: Context, bytes: ByteArray, name: String): File =
        File(context.filesDir, "photos").apply { mkdirs() }.resolve(name).apply { writeBytes(bytes) }

    fun base64(file: File): String = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)

    /**
     * Sharpness: variance of the Laplacian on a 256-px grey copy. Blurry photos score low (below ~60 is usually
     * unusable). Used to ask the user to retake before the photo is queued.
     */
    fun sharpness(jpeg: ByteArray): Double {
        val src = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return 0.0
        val s = 256f / maxOf(src.width, src.height)
        val bmp = Bitmap.createScaledBitmap(src, maxOf(3, (src.width * s).toInt()), maxOf(3, (src.height * s).toInt()), true)
        val w = bmp.width; val h = bmp.height
        val px = IntArray(w * h).also { bmp.getPixels(it, 0, w, 0, 0, w, h) }
        val g = DoubleArray(px.size) { i -> val c = px[i]; 0.299 * (c shr 16 and 255) + 0.587 * (c shr 8 and 255) + 0.114 * (c and 255) }
        var sum = 0.0; var sq = 0.0; var n = 0
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i]
            sum += lap; sq += lap * lap; n++
        }
        if (n == 0) return 0.0
        val mean = sum / n
        return sq / n - mean * mean
    }

    const val BLUR_THRESHOLD = 60.0
}
