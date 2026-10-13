package com.micromax.sugar.core.geo

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class LatLng(val lat: Double, val lng: Double)

/** Field geometry on the phone. Areas are for display; the server re-measures on the WGS84 ellipsoid. */
object Geo {
    private const val R = 6_371_008.8
    const val SQ_M_PER_ACRE = 4046.8564224

    fun distanceM(a: LatLng, b: LatLng): Double {
        val p1 = Math.toRadians(a.lat); val p2 = Math.toRadians(b.lat)
        val dp = p2 - p1; val dl = Math.toRadians(b.lng - a.lng)
        val h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * R * asin(sqrt(h))
    }

    /** Spherical polygon area (m²) of a ring, open or closed. */
    fun areaSqM(ring: List<LatLng>): Double {
        val pts = if (ring.size > 1 && ring.first() == ring.last()) ring.dropLast(1) else ring
        if (pts.size < 3) return 0.0
        var total = 0.0
        for (i in pts.indices) {
            val p1 = pts[i]; val p2 = pts[(i + 1) % pts.size]
            total += Math.toRadians(p2.lng - p1.lng) * (2 + sin(Math.toRadians(p1.lat)) + sin(Math.toRadians(p2.lat)))
        }
        return abs(total * R * R / 2.0)
    }

    fun acres(ring: List<LatLng>) = areaSqM(ring) / SQ_M_PER_ACRE

    fun contains(ring: List<LatLng>, p: LatLng): Boolean {
        var inside = false
        var j = ring.size - 1
        for (i in ring.indices) {
            val a = ring[i]; val b = ring[j]
            if ((a.lat > p.lat) != (b.lat > p.lat) && p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside
            j = i
        }
        return inside
    }

    /** Distance (m) from a point to the nearest edge of a ring (local flat approximation; fine for a few km). */
    fun distanceToEdgeM(ring: List<LatLng>, p: LatLng): Double {
        if (ring.size < 2) return Double.MAX_VALUE
        val kx = 111_320.0 * cos(Math.toRadians(p.lat)); val ky = 110_574.0
        fun xy(q: LatLng) = Pair((q.lng - p.lng) * kx, (q.lat - p.lat) * ky)
        var best = Double.MAX_VALUE
        for (i in ring.indices) {
            val (x1, y1) = xy(ring[i]); val (x2, y2) = xy(ring[(i + 1) % ring.size])
            val dx = x2 - x1; val dy = y2 - y1
            val t = if (dx == 0.0 && dy == 0.0) 0.0 else ((-x1 * dx - y1 * dy) / (dx * dx + dy * dy)).coerceIn(0.0, 1.0)
            val cx = x1 + t * dx; val cy = y1 + t * dy
            best = minOf(best, sqrt(cx * cx + cy * cy))
        }
        return best
    }

    /** Inside any of the rings, or within bufferM metres of one. */
    fun insideFence(rings: List<List<LatLng>>, p: LatLng, bufferM: Double): Boolean =
        rings.any { contains(it, p) || distanceToEdgeM(it, p) <= bufferM }

    fun centroid(pts: List<LatLng>) = LatLng(pts.sumOf { it.lat } / pts.size, pts.sumOf { it.lng } / pts.size)

    /** Outer rings of every polygon in GeoJSON (FeatureCollection / Feature / geometry, as text or element). */
    fun rings(geojson: Any?): List<List<LatLng>> {
        val el: JsonElement = when (geojson) {
            null -> return emptyList()
            is String -> if (geojson.isBlank()) return emptyList() else runCatching { kotlinx.serialization.json.Json.parseToJsonElement(geojson) }.getOrElse { return emptyList() }
            is JsonElement -> geojson
            else -> return emptyList()
        }
        val out = mutableListOf<List<LatLng>>()
        fun ring(a: JsonArray) = a.map { c -> c.jsonArray.let { LatLng(it[1].jsonPrimitive.double, it[0].jsonPrimitive.double) } }
        fun visit(e: JsonElement) {
            val o = e as? JsonObject ?: return
            when (o["type"]?.jsonPrimitive?.content) {
                "FeatureCollection" -> o["features"]?.jsonArray?.forEach { visit(it) }
                "Feature" -> o["geometry"]?.let { visit(it) }
                "Polygon" -> o["coordinates"]?.jsonArray?.firstOrNull()?.let { out += ring(it.jsonArray) }
                "MultiPolygon" -> o["coordinates"]?.jsonArray?.forEach { p -> p.jsonArray.firstOrNull()?.let { out += ring(it.jsonArray) } }
            }
        }
        visit(el)
        return out
    }

    /** GeoJSON Polygon (closed ring, [lng, lat]) for upload. */
    fun polygon(pts: List<LatLng>): JsonObject = buildJsonObject {
        put("type", "Polygon")
        put("coordinates", buildJsonArray {
            add(buildJsonArray {
                (pts + pts.first()).forEach { p -> add(buildJsonArray { add(JsonPrimitive(p.lng)); add(JsonPrimitive(p.lat)) }) }
            })
        })
    }

    fun fmtAcres(acres: Double) = "%.2f acres · %.1f kanal".format(acres, acres * 8)
    @Suppress("unused") private const val TWO_PI = 2 * PI
}
