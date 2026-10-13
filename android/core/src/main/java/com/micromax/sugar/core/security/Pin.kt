package com.micromax.sugar.core.security

import android.util.Base64
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** App-lock PIN: PBKDF2-SHA256 with a random salt; only the hash is stored (encrypted prefs). */
object Pin {
    private const val ROUNDS = 60_000

    fun newSalt(): String = Base64.encodeToString(ByteArray(16).also { SecureRandom().nextBytes(it) }, Base64.NO_WRAP)

    fun hash(pin: String, salt: String): String {
        val spec = PBEKeySpec(pin.toCharArray(), Base64.decode(salt, Base64.NO_WRAP), ROUNDS, 256)
        val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return Base64.encodeToString(key, Base64.NO_WRAP)
    }

    fun matches(pin: String, salt: String?, expected: String?): Boolean =
        salt != null && expected != null && java.security.MessageDigest.isEqual(hash(pin, salt).toByteArray(), expected.toByteArray())
}
