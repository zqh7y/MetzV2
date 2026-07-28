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
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${config.background}; }
  .leaflet-container { background: ${config.background}; font: inherit; }
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
    white-space: nowrap; pointer-events: none;
  }
  .metz-drop { box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%;
               border: 3px solid #fff;
               background: ${config.accent}; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
  /* "You are here" — the web's .me-marker: a pulsing halo behind an avatar */
  .metz-me { position: relative; width: 30px; height: 30px; }
  .metz-me-pulse {
    position: absolute; inset: 0; border-radius: 50%;
    background: rgba(66,133,244,0.35);
    animation: metzMePulse 1.8s ease-out infinite;
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

  L.tileLayer(init.tiles.url, { attribution: init.tiles.attribution, maxZoom: 19 }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  var markerLayer = L.layerGroup().addTo(map);
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

  function pinIcon(kind) {
    // Distinct gradient ids — several of these share one document, and a
    // repeated id would make every pin use whichever was defined first.
    var html = kind === "online"
      ? teardrop("metz-g-online", "#4facfe", "#2b6ef5")
      : teardrop("metz-g-inperson", init.accent, init.accentStrong);
    return L.divIcon({
      className: "",
      html: html,
      iconSize: [33, 43],
      iconAnchor: [16.5, 43],
    });
  }

  window.setMarkers = function (markers) {
    markerLayer.clearLayers();
    markers.forEach(function (m) {
      if (typeof m.lat !== "number" || typeof m.lng !== "number") return;
      L.marker([m.lat, m.lng], { icon: pinIcon(m.kind) })
        .on("click", function () { send({ type: "marker", id: m.id }); })
        .addTo(markerLayer);
      if (m.title) {
        // Sits just under the pin's tip, like the web's text-anchor: top.
        L.marker([m.lat, m.lng], {
          interactive: false,
          icon: L.divIcon({ className: "metz-label", html: m.title, iconSize: [120, 16], iconAnchor: [60, -5] }),
        }).addTo(markerLayer);
      }
    });
  };

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
          tiles,
          accent: theme?.accent || "#0d9c8a",
          accentStrong: theme?.accentStrong || "#0a7a6c",
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
