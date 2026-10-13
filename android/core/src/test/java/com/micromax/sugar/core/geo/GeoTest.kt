package com.micromax.sugar.core.geo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoTest {
    private val lat = 32.10
    private val lng = 72.70
    private val mLat = 1 / 110_880.0 // degrees per metre north at 32°N
    private fun mLng() = 1 / (111_320.0 * Math.cos(Math.toRadians(lat)))
    private fun square(side: Double) = listOf(
        LatLng(lat, lng), LatLng(lat, lng + side * mLng()), LatLng(lat + side * mLat, lng + side * mLng()), LatLng(lat + side * mLat, lng))

    @Test fun oneAcre() = assertEquals(1.0, Geo.acres(square(63.6149)), 0.01)

    @Test fun hundredMetreSquare() = assertEquals(10_000.0, Geo.areaSqM(square(100.0)), 60.0)

    @Test fun closedRingSameArea() {
        val sq = square(100.0)
        assertEquals(Geo.areaSqM(sq), Geo.areaSqM(sq + sq.first()), 0.001)
    }

    @Test fun containsAndFence() {
        val sq = square(100.0)
        assertTrue(Geo.contains(sq, LatLng(lat + 50 * mLat, lng + 50 * mLng())))
        val north = LatLng(lat + 130 * mLat, lng + 50 * mLng()) // 30 m north of the square
        assertFalse(Geo.contains(sq, north))
        assertEquals(30.0, Geo.distanceToEdgeM(sq, north), 1.0)
        assertTrue(Geo.insideFence(listOf(sq), north, 40.0))
        assertFalse(Geo.insideFence(listOf(sq), north, 20.0))
    }

    @Test fun distance() = assertEquals(1000.0, Geo.distanceM(LatLng(lat, lng), LatLng(lat + 1000 * mLat, lng)), 6.0)

    @Test fun ringsFromFeatureCollection() {
        val fc = """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":
            {"type":"Polygon","coordinates":[[[72.7,32.1],[72.71,32.1],[72.71,32.11],[72.7,32.1]]]}}]}"""
        val rings = Geo.rings(fc)
        assertEquals(1, rings.size)
        assertEquals(LatLng(32.1, 72.7), rings[0][0])
        assertTrue(Geo.rings("").isEmpty())
    }

    @Test fun polygonRoundTrip() {
        val sq = square(50.0)
        val back = Geo.rings(Geo.polygon(sq).toString()).first()
        assertEquals(sq.size + 1, back.size) // closed ring
        assertEquals(Geo.areaSqM(sq), Geo.areaSqM(back), 0.01)
    }
}
