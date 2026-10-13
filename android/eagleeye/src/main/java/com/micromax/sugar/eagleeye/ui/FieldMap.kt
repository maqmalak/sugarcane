package com.micromax.sugar.eagleeye.ui

import android.graphics.Color as AColor
import android.view.MotionEvent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.micromax.sugar.core.geo.LatLng
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay

/** ESRI World Imagery — the same satellite tiles as the web map. */
private val EsriImagery = object : OnlineTileSourceBase("EsriWorldImagery", 1, 19, 256, ".jpg",
    arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/")) {
    override fun getTileURLString(index: Long): String =
        "$baseUrl${MapTileIndex.getZoom(index)}/${MapTileIndex.getY(index)}/${MapTileIndex.getX(index)}"
}

/**
 * Satellite map for a field boundary: village outline (yellow), corners (numbered pins, draggable) and the field polygon
 * (green). Tapping the map adds a corner when tapToAdd is on.
 */
@Composable
fun FieldMap(villageRings: List<List<LatLng>>, corners: List<LatLng>, tapToAdd: Boolean, onAdd: (LatLng) -> Unit,
    onMove: (Int, LatLng) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val add by rememberUpdatedState(onAdd)
    val move by rememberUpdatedState(onMove)
    val tap by rememberUpdatedState(tapToAdd)
    val map = remember {
        MapView(context).apply {
            setTileSource(EsriImagery)
            setMultiTouchControls(true)
            isTilesScaledToDpi = true
            controller.setZoom(16.0)
            overlays.add(MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean { if (tap) add(LatLng(p.latitude, p.longitude)); return tap }
                override fun longPressHelper(p: GeoPoint) = false
            }))
            overlays.add(MyLocationNewOverlay(GpsMyLocationProvider(context), this).apply { if (hasLocation(context)) enableMyLocation() })
            // keep the parent scroll view from stealing map drags
            setOnTouchListener { v, e -> if (e.action == MotionEvent.ACTION_DOWN) v.parent?.requestDisallowInterceptTouchEvent(true); false }
        }
    }
    DisposableEffect(Unit) {
        map.onResume()
        onDispose { map.onPause(); map.onDetach() }
    }
    val framed = remember { booleanArrayOf(false) }
    AndroidView(factory = { map }, modifier = modifier, update = { m ->
        m.overlays.removeAll { it is Polygon || it is Marker }
        villageRings.forEach { ring ->
            m.overlays.add(Polygon(m).apply {
                points = ring.map { GeoPoint(it.lat, it.lng) }
                outlinePaint.color = AColor.rgb(252, 196, 25); outlinePaint.strokeWidth = 4f
                fillPaint.color = AColor.argb(18, 252, 196, 25)
                setOnClickListener { _, _, _ -> false }
            })
        }
        if (corners.size >= 3) m.overlays.add(Polygon(m).apply {
            points = corners.map { GeoPoint(it.lat, it.lng) }
            outlinePaint.color = AColor.rgb(16, 185, 129); outlinePaint.strokeWidth = 6f
            fillPaint.color = AColor.argb(80, 16, 185, 129)
            setOnClickListener { _, _, _ -> false }
        })
        corners.forEachIndexed { i, c ->
            m.overlays.add(Marker(m).apply {
                position = GeoPoint(c.lat, c.lng)
                title = "Corner ${i + 1}"
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                isDraggable = true
                setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                    override fun onMarkerDrag(marker: Marker) {}
                    override fun onMarkerDragStart(marker: Marker) {}
                    override fun onMarkerDragEnd(marker: Marker) { move(i, LatLng(marker.position.latitude, marker.position.longitude)) }
                })
            })
        }
        if (!framed[0]) {
            val pts = (corners.ifEmpty { villageRings.flatten() }).map { GeoPoint(it.lat, it.lng) }
            if (pts.size >= 2) {
                m.post { m.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts).increaseByScale(1.3f), false); }
                framed[0] = true
            } else if (pts.size == 1) { m.controller.setCenter(pts[0]); framed[0] = true }
        }
        m.invalidate()
    })
}
