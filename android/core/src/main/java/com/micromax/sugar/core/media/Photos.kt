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

    /** Sharpness (as above), mean brightness and contrast (std of grey levels) — the same measures the server uses. */
    data class Quality(val sharpness: Double, val brightness: Double, val contrast: Double) {
        fun problems(minSharp: Double, minBright: Double, maxBright: Double, minContrast: Double): List<String> = buildList {
            if (sharpness < minSharp) add("blurred")
            if (brightness < minBright) add("too dark")
            if (brightness > maxBright) add("too bright")
            if (contrast < minContrast) add("faded / unclear")
        }
    }

    fun quality(jpeg: ByteArray): Quality {
        val src = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return Quality(0.0, 0.0, 0.0)
        val s = 256f / maxOf(src.width, src.height)
        val bmp = Bitmap.createScaledBitmap(src, maxOf(3, (src.width * s).toInt()), maxOf(3, (src.height * s).toInt()), true)
        val w = bmp.width; val h = bmp.height
        val px = IntArray(w * h).also { bmp.getPixels(it, 0, w, 0, 0, w, h) }
        val g = DoubleArray(px.size) { i -> val c = px[i]; 0.299 * (c shr 16 and 255) + 0.587 * (c shr 8 and 255) + 0.114 * (c and 255) }
        val mean = g.average()
        val std = kotlin.math.sqrt(g.sumOf { (it - mean) * (it - mean) } / g.size)
        return Quality(sharpness(jpeg), mean, std)
    }

    /**
     * Burn an evidence stamp into the bottom of the photo (point, date-time, GPS, vehicle): a printed or forwarded picture
     * still shows where and when it was taken. Returns a new JPEG.
     */
    fun stamp(jpeg: ByteArray, lines: List<String>, quality: Int = 85): ByteArray {
        val src = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return jpeg
        val bmp = src.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = android.graphics.Canvas(bmp)
        val size = maxOf(14f, bmp.width / 45f)
        val text = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.YELLOW; textSize = size; typeface = android.graphics.Typeface.MONOSPACE
        }
        val band = android.graphics.Paint().apply { color = android.graphics.Color.argb(170, 0, 0, 0) }
        val top = bmp.height - (lines.size * size * 1.3f + size * 0.6f)
        canvas.drawRect(0f, top, bmp.width.toFloat(), bmp.height.toFloat(), band)
        lines.forEachIndexed { i, l -> canvas.drawText(l, size * 0.5f, top + size * 1.2f * (i + 1), text) }
        return ByteArrayOutputStream().use { s -> bmp.compress(Bitmap.CompressFormat.JPEG, quality, s); s.toByteArray() }
    }
}
