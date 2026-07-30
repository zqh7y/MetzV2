import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

/**
 * A map that needs no native module.
 *
 * MapLibre only exists in a dev build, so in Expo Go the map screens had
 * nothing to show. Leaflet inside a WebView renders anywhere react-native-webview
 * runs — which includes Expo Go — at the cost of talking to the map over
 * postMessage instead of props.
 *
 * Coordinates are [lng, lat] on the React Native side, matching the MapLibre
 * code this stands in for; Leaflet wants [lat, lng], so every crossing point
 * flips them rather than leaving two conventions loose in the same file.
 */

const TILES = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, © CARTO",
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap, © CARTO",
  },
};

/** JSON that is safe to drop inside a <script> tag. */
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildHtml(config) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<!-- MarkerCluster.css carries the zoom-in/out animation classes. Its Default
     skin is deliberately not loaded — the cluster icons are drawn to match the
     web's own layers, not markercluster's default bubbles. -->
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${config.background}; }
  .leaflet-container { background: ${config.background}; font: inherit; }
  /* Leaflet's default attribution is sized for a desktop page and covered most
     of a 240px map here. Kept legible and present — it is a tile licence
     requirement — but no longer the loudest thing on the map. */
  .leaflet-control-attribution {
    font-size: 8.5px;
    line-height: 1.35;
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.72);
  }
  .leaflet-control-attribution a { color: #4a5568; }
  /* The zoom buttons had the same problem. */
  .leaflet-control-zoom a {
    width: 26px; height: 26px; line-height: 26px; font-size: 15px;
  }
  /* Leaflet gives div icons a white card by default, which boxes in the pins. */
  .leaflet-div-icon { background: none; border: none; }
  .metz-pin {
    box-sizing: border-box;
    width: 18px; height: 18px; border-radius: 50%;
    border: 3px solid ${config.pinStroke};
    box-shadow: 0 1px 4px rgba(0,0,0,0.35);
  }
  .metz-label {
    background: none; border: none; box-shadow: none;
    font-size: 11.5px; font-weight: 600; text-align: center;
    color: ${config.labelColor};
    text-shadow: 0 0 3px ${config.labelHalo}, 0 0 3px ${config.labelHalo}, 0 0 3px ${config.labelHalo};
    /* text-max-width: 9 on the web's symbol layer — 9em, wrapped, not clipped */
    width: 9em; line-height: 1.25; pointer-events: none;
  }
  /* Clusters: the web's cluster-glow + clusters + cluster-count layers, which
     step their radius and colour with the number of meetings inside. */
  .metz-cluster { position: relative; }
  .metz-cluster-glow {
    position: absolute; left: 50%; top: 50%; border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.25; filter: blur(6px);
  }
  .metz-cluster-body {
    position: absolute; left: 50%; top: 50%; border-radius: 50%;
    transform: translate(-50%, -50%);
    box-sizing: border-box; border: 3px solid #ffffff;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 700;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  /* Pins drop in rather than appearing. transform/opacity only, so the
     compositor handles it without a layout pass per frame. The stagger is
     applied per marker in setMarkers() and capped, so a big result set does
     not turn into a several-second wave. */
  .metz-pin-drop {
    animation: metzPinDrop 380ms cubic-bezier(0.22, 1.2, 0.36, 1) both;
    transform-origin: 50% 100%;
    will-change: transform, opacity;
  }
  @keyframes metzPinDrop {
    0%   { transform: translateY(-18px) scale(0.72); opacity: 0; }
    100% { transform: none; opacity: 1; }
  }
  /* Clusters swell into place instead of popping. */
  .metz-cluster { animation: metzClusterIn 260ms cubic-bezier(0.22, 1.2, 0.36, 1) both; }
  @keyframes metzClusterIn {
    0%   { transform: scale(0.6); opacity: 0; }
    100% { transform: none; opacity: 1; }
  }
  .metz-drop { box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%;
               border: 3px solid #fff;
               background: ${config.accent}; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
  /* "You are here" — the web's .me-marker: a pulsing halo behind an avatar */
  .metz-me { position: relative; width: 30px; height: 30px; }
  /* Six beats rather than infinite: a WebView animating forever keeps the
     whole native view tree compositing behind it, so the screen can never go
     idle. Long enough to find yourself on the map, then it stops. */
  .metz-me-pulse {
    position: absolute; inset: 0; border-radius: 50%;
    background: rgba(66,133,244,0.35);
    animation: metzMePulse 1.8s ease-out 6;
  }
  .metz-me-avatar {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 12px; font-weight: 700;
  }
  @keyframes metzMePulse {
    0%   { transform: scale(1);   opacity: 0.9; }
    100% { transform: scale(2.6); opacity: 0; }
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var init = ${inlineJson(config.init)};
  var send = function (payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  };

  // Leaflet is loaded from a CDN, so a device with no route to it would
  // otherwise fail silently with a blank rectangle.
  if (typeof L === "undefined") {
    send({ type: "error", message: "leaflet-unavailable" });
    return;
  }

  var map = L.map("map", { zoomControl: false, attributionControl: true })
    .setView([init.center[1], init.center[0]], init.zoom);

  // detectRetina swaps {r} for "@2x" on a high-density screen. Without it the
  // 256px tiles were being stretched across ~2.75 device pixels each, which is
  // why the basemap looked soft and its place names came out oversized.
  L.tileLayer(init.tiles.url, {
    attribution: init.tiles.attribution,
    maxZoom: 19,
    detectRetina: true,
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // The web clusters its meetings source with clusterRadius 55 and
  // clusterMaxZoom 14. markercluster counts maxClusterRadius the same way, and
  // "cluster up to 14" is "stop clustering at 15".
  //
  // Labels are kept out of the cluster group: they are decoration attached to a
  // pin, and letting them be counted would make every cluster read double.
  var CLUSTERED = typeof L.markerClusterGroup === "function";
  var markerLayer = CLUSTERED
    ? L.markerClusterGroup({
        maxClusterRadius: 55,
        disableClusteringAtZoom: 15,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        iconCreateFunction: function (cluster) {
          var n = cluster.getChildCount();
          // ['step', ['get','point_count'], base, 10, strong, 30, deep]
          var color = n < 10 ? init.accent : (n < 30 ? init.accentStrong : init.accentDeep);
          // circle-radius steps 18/23/28, and the glow's 26/32/38.
          var r = n < 10 ? 18 : (n < 30 ? 23 : 28);
          var gr = n < 10 ? 26 : (n < 30 ? 32 : 38);
          var box = gr * 2;
          return L.divIcon({
            className: "",
            iconSize: [box, box],
            html:
              '<div class="metz-cluster" style="width:' + box + 'px;height:' + box + 'px">'
              + '<div class="metz-cluster-glow" style="width:' + (gr * 2) + 'px;height:' + (gr * 2)
              + 'px;background:' + color + '"></div>'
              + '<div class="metz-cluster-body" style="width:' + (r * 2) + 'px;height:' + (r * 2)
              + 'px;background:' + color + '">' + n + "</div>"
              + "</div>",
          });
        },
      })
    : L.layerGroup();
  markerLayer.addTo(map);

  // Labels ride in their own layer so clustering never swallows or counts them.
  var labelLayer = L.layerGroup().addTo(map);
  // Route sits under everything else, so pins stay tappable along its path.
  var routeLayer = L.layerGroup().addTo(map);
  var dropMarker = null;
  var userMarker = null;

  // The web's pinImage(): a teardrop with a diagonal gradient fill, a white
  // stroke, a soft ground shadow and a white dot in the head. Drawn at the
  // same 33x43 the map uses after its icon-size: 0.5, and anchored at the
  // point so the tip sits on the coordinate.
  function teardrop(id, from, to) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="33" height="43" viewBox="0 0 33 43">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/>'
      + '</linearGradient></defs>'
      + '<ellipse cx="16.5" cy="40" rx="5.5" ry="2" fill="rgba(20,25,50,0.22)"/>'
      + '<path d="M16.5 1.5C9.6 1.5 4 7.1 4 14c0 8.8 11 22.5 12 23.6.3.3.8.3 1.1 0C18 36.5 29 22.8 29 14c0-6.9-5.6-12.5-12.5-12.5z" '
      + 'fill="url(#' + id + ')" stroke="#ffffff" stroke-width="2.4"/>'
      + '<circle cx="16.5" cy="14" r="5" fill="#ffffff"/>'
      + '</svg>';
  }

  function pinIcon(kind, order) {
    // Distinct gradient ids — several of these share one document, and a
    // repeated id would make every pin use whichever was defined first.
    var html = kind === "online"
      ? teardrop("metz-g-online", "#4facfe", "#2b6ef5")
      : teardrop("metz-g-inperson", init.accent, init.accentStrong);
    // Cap the stagger: past a dozen pins the tail would still be arriving
    // long after the map looked settled.
    var delay = Math.min(order || 0, 12) * 28;
    // The animation goes on an inner wrapper, never on the icon element
    // itself: Leaflet positions markers by writing transform: translate3d()
    // onto that element, and animating transform there replaces the
    // positioning — which drops every pin off its coordinate.
    return L.divIcon({
      className: "",
      html: '<div class="metz-pin-drop" style="animation-delay:' + delay + 'ms">' + html + "</div>",
      iconSize: [33, 43],
      iconAnchor: [16.5, 43],
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // pin marker -> its label marker, so labels can follow their pin in and out
  // of clusters.
  var labelled = [];

  window.setMarkers = function (markers) {
    markerLayer.clearLayers();
    labelLayer.clearLayers();
    labelled = [];
    var pins = [];
    markers.forEach(function (m, i) {
      if (typeof m.lat !== "number" || typeof m.lng !== "number") return;
      var pin = L.marker([m.lat, m.lng], { icon: pinIcon(m.kind, i) })
        .on("click", function () { send({ type: "marker", id: m.id }); });
      pins.push(pin);
      if (m.title) {
        // Sits just under the pin's tip, like the web's text-anchor: top.
        labelled.push({
          pin: pin,
          label: L.marker([m.lat, m.lng], {
            interactive: false,
            icon: L.divIcon({
              className: "metz-label",
              html: escapeHtml(m.title),
              iconSize: [104, 0],
              iconAnchor: [52, -5],
            }),
          }),
        });
      }
    });
    // addLayers in one call: markercluster rebuilds its tree per insertion
    // otherwise, which is the difference between one pass and one per pin.
    if (CLUSTERED) markerLayer.addLayers(pins);
    else pins.forEach(function (p) { p.addTo(markerLayer); });
    syncLabels();
  };

  /**
   * A label belongs to a pin, so it is shown exactly when that pin is drawn on
   * its own and hidden when a cluster is standing in for it.
   *
   * This is what the web gets for free: its labels live on the meeting-pins
   * layer, which is filtered to features without a point_count, so a
   * clustered meeting has no pin and therefore no label. Keying off zoom alone
   * would be wrong — an isolated meeting stays unclustered at low zoom and
   * keeps its label there.
   */
  function syncLabels() {
    labelled.forEach(function (pair) {
      var visible = !CLUSTERED || markerLayer.getVisibleParent(pair.pin) === pair.pin;
      if (visible && !labelLayer.hasLayer(pair.label)) labelLayer.addLayer(pair.label);
      else if (!visible && labelLayer.hasLayer(pair.label)) labelLayer.removeLayer(pair.label);
    });
  }

  map.on("zoomend moveend", syncLabels);
  if (CLUSTERED) markerLayer.on("animationend", syncLabels);

  window.setPin = function (pin) {
    if (dropMarker) { map.removeLayer(dropMarker); dropMarker = null; }
    if (!pin) return;
    dropMarker = L.marker([pin.lat, pin.lng], {
      icon: L.divIcon({ className: "", html: '<div class="metz-drop"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(map);
  };

  window.flyTo = function (center, zoom) {
    map.flyTo([center[1], center[0]], zoom, { duration: 0.9 });
  };

  /**
   * Draw the road route as the web does: a wide soft glow beneath a solid
   * line, which reads over busy tiles far better than a single stroke.
   *
   * Coordinates arrive as OSRM gives them, [lng, lat], and are flipped once
   * here rather than leaving both conventions loose in the file.
   */
  window.setRoute = function (coords, fit) {
    routeLayer.clearLayers();
    if (!coords || !coords.length) return;

    var latlngs = coords.map(function (c) { return [c[1], c[0]]; });

    L.polyline(latlngs, {
      color: init.accent, weight: 14, opacity: 0.22, lineCap: "round", lineJoin: "round",
    }).addTo(routeLayer);
    L.polyline(latlngs, {
      color: init.accentStrong, weight: 4.5, opacity: 0.95, lineCap: "round", lineJoin: "round",
    }).addTo(routeLayer);

    if (fit) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [34, 34], animate: true, duration: 0.8 });
    }
  };

  if (init.tapToPin) {
    map.on("click", function (e) {
      send({ type: "press", lat: e.latlng.lat, lng: e.latlng.lng });
    });
  }

  // The position comes from expo-location on the native side rather than the
  // WebView's navigator.geolocation, which never gets a permission prompt
  // inside Expo Go and so silently returned nothing.
  window.setMe = function (me) {
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (!me) return;
    var inner = me.initial
      ? '<div class="metz-me-avatar" style="background:' + (me.color || "#4285f4") + '">' + me.initial + "</div>"
      : '<div class="metz-me-avatar" style="background:#4285f4"></div>';
    userMarker = L.marker([me.lat, me.lng], {
      interactive: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "",
        html: '<div class="metz-me"><div class="metz-me-pulse"></div>' + inner + "</div>",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(map);
  };

  window.setMarkers(init.markers || []);
  if (init.pin) window.setPin(init.pin);
  if (init.me) window.setMe(init.me);
  if (init.route) window.setRoute(init.route, true);
  send({ type: "ready" });
})();
</script>
</body>
</html>`;
}

const WebMap = forwardRef(function WebMap(
  {
    markers = [],
    pin = null,
    me = null,
    route = null,
    center = [35.2137, 31.7683],
    zoom = 11,
    onMarkerPress,
    onMapPress,
    showUserLocation = false,
    theme,
    style,
  },
  ref
) {
  const webRef = useRef(null);
  const readyRef = useRef(false);

  const dark = theme?.scheme === "dark";
  const tiles = dark ? TILES.dark : TILES.light;

  // Rebuilding the HTML remounts the map and loses its camera, so it is built
  // once from the values that matter at load time; everything after arrives
  // through injected calls.
  const html = useMemo(
    () =>
      buildHtml({
        background: theme?.surface3 || "#eef0f5",
        accent: theme?.accent || "#0d9c8a",
        accentStrong: theme?.accentStrong || "#0a7a6c",
        pinStroke: theme?.surface || "#ffffff",
        labelColor: theme?.mapLabel || "#2c3e50",
        labelHalo: theme?.mapLabelHalo || "#ffffff",
        init: {
          center,
          zoom,
          markers,
          pin,
          me,
          route,
          tiles,
          accent: theme?.accent || "#0d9c8a",
          accentStrong: theme?.accentStrong || "#0a7a6c",
          // Third step of the cluster colour ramp (30+ meetings).
          accentDeep: theme?.accentDeep || "#075f55",
          tapToPin: !!onMapPress,
          showUserLocation,
        },
      }),
    // Only the theme may rebuild the document — a marker or pin change is
    // pushed in below instead.
    [dark] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function run(js) {
    if (readyRef.current) webRef.current?.injectJavaScript(`${js}; true;`);
  }

  useEffect(() => {
    run(`window.setMarkers(${JSON.stringify(markers)})`);
  }, [markers]);

  useEffect(() => {
    run(`window.setPin(${JSON.stringify(pin)})`);
  }, [pin]);

  useEffect(() => {
    run(`window.setMe(${JSON.stringify(me)})`);
  }, [me]);

  // A route arriving after load is worth framing; the map has been sitting on
  // the destination alone until now.
  useEffect(() => {
    run(`window.setRoute(${JSON.stringify(route)}, true)`);
  }, [route]);

  useImperativeHandle(ref, () => ({
    flyTo({ center: to, zoom: z = 15 }) {
      run(`window.flyTo(${JSON.stringify(to)}, ${z})`);
    },
  }));

  function handleMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }
    if (msg.type === "ready") {
      readyRef.current = true;
      // State that changed while the document was still loading.
      run(`window.setMarkers(${JSON.stringify(markers)})`);
      if (pin) run(`window.setPin(${JSON.stringify(pin)})`);
      if (me) run(`window.setMe(${JSON.stringify(me)})`);
      if (route) run(`window.setRoute(${JSON.stringify(route)}, true)`);
    } else if (msg.type === "marker") {
      onMarkerPress?.(msg.id);
    } else if (msg.type === "press") {
      onMapPress?.({ latitude: msg.lat, longitude: msg.lng });
    }
  }

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={showUserLocation}
        onMessage={handleMessage}
        style={styles.web}
        // The map draws its own background; without this the WebView flashes
        // white before the tiles arrive, which is very visible in dark mode.
        backgroundColor="transparent"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  web: { flex: 1, backgroundColor: "transparent" },
});

export default WebMap;
