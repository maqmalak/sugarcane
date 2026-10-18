package com.micromax.sugar.core.device

import android.annotation.SuppressLint
import android.content.Context
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellIdentityNr
import android.telephony.TelephonyManager

/** The serving cell tower id (best effort: needs a SIM and the location permission; null otherwise). */
object CellTower {
    @SuppressLint("MissingPermission")
    fun id(context: Context): String? = runCatching {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        val cell = tm.allCellInfo?.firstOrNull { it.isRegistered } ?: return null
        when (cell) {
            is CellInfoLte -> cell.cellIdentity.ci.takeIf { it != Int.MAX_VALUE }?.toString()
            is CellInfoGsm -> cell.cellIdentity.cid.takeIf { it != Int.MAX_VALUE }?.toString()
            is CellInfoWcdma -> cell.cellIdentity.cid.takeIf { it != Int.MAX_VALUE }?.toString()
            else -> if (android.os.Build.VERSION.SDK_INT >= 29 && cell is CellInfoNr) (cell.cellIdentity as CellIdentityNr).nci.toString() else null
        }
    }.getOrNull()
}
