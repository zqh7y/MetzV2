import React, { useEffect, useMemo, useRef } from "react";
import { View, Image, StyleSheet, Animated, Easing } from "react-native";

/**
 * The little map on a For You card (the web's `.foryou-map` / `.mini-pin`).
 *
 * The web mounts a real MapLibre instance per card, but has to cap how many
 * live at once and evict the ones furthest from the viewport, because a dozen
 * GL contexts in a scroller is expensive. These maps are non-interactive by
 * design, so on mobile the same picture comes from raster tiles dropped
 * straight into <Image> — no WebView per card, nothing to evict.
 *
 * Tiles are 256px squares of a Web Mercator projection. Rather than centre one
 * tile and hope the venue is near its middle, this works out the exact world
 * pixel of the coordinate and shifts the tile grid so that pixel lands dead
 * centre — which is what makes the pin sit on the venue rather than near it.
 */
const TILE = 256;
// The web mounts these at zoom 14.2. Tile URLs only exist at whole zooms, so
// the grid is fetched at 14 and scaled by the remaining 0.2 of a doubling —
// which is exactly what a GL map does between integer zoom levels.
const TILE_ZOOM = 14;
const ZOOM = 14.2;
const SCALE = Math.pow(2, ZOOM - TILE_ZOOM);
const SUBDOMAINS = ["a", "b", "c", "d"];

function tileUrl(x, y, z, dark) {
  const style = dark ? "dark_all" : "rastertiles/voyager";
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  return `https://${s}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`;
}

/** Longitude/latitude to world pixel coordinates at a given zoom. */
function project(lat, lng, z) {
  const scale = TILE * Math.pow(2, z);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function MiniMap({ lat, lng, width, height, accent, glow, dark, reduceMotion, style }) {
  // The tile grid is laid out in unscaled pixels and then scaled up, so it has
  // to cover a correspondingly smaller slice of the card.
  const viewW = width / SCALE;
  const viewH = height / SCALE;

  const tiles = useMemo(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const { x: worldX, y: worldY } = project(lat, lng, TILE_ZOOM);
    // The rectangle of world pixels the card actually shows, centred on the venue.
    const left = worldX - viewW / 2;
    const top = worldY - viewH / 2;

    const firstX = Math.floor(left / TILE);
    const firstY = Math.floor(top / TILE);
    const lastX = Math.floor((left + viewW) / TILE);
    const lastY = Math.floor((top + viewH) / TILE);

    const max = Math.pow(2, TILE_ZOOM);
    const out = [];
    for (let ty = firstY; ty <= lastY; ty += 1) {
      for (let tx = firstX; tx <= lastX; tx += 1) {
        // Wrap horizontally at the date line; vertical is clamped by Mercator.
        const wrappedX = ((tx % max) + max) % max;
        if (ty < 0 || ty >= max) continue;
        out.push({
          key: `${tx}/${ty}`,
          uri: tileUrl(wrappedX, ty, TILE_ZOOM, dark),
          left: tx * TILE - left,
          top: ty * TILE - top,
        });
      }
    }
    return out;
  }, [lat, lng, viewW, viewH, dark]);

  /**
   * .mini-pin::after — miniPulse 2.4s ease-out, scale 0.5 → 1.6.
   *
   * The web runs this forever; here it stops after three beats. A shelf holds a
   * dozen of these, and an animation that never ends means the screen never
   * stops compositing — part of why the app could not go idle. Three pulses
   * still pulls the eye to the pin on arrival, then lets the screen settle.
   */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      { iterations: 3 }
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  if (!tiles) return null;

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      {/* Unscaled grid, blown up to the card's size around its own centre. */}
      <View
        style={[
          styles.grid,
          {
            width: viewW,
            height: viewH,
            left: (width - viewW) / 2,
            top: (height - viewH) / 2,
            transform: [{ scale: SCALE }],
          },
        ]}
      >
        {tiles.map((t) => (
          <Image
            key={t.key}
            source={{ uri: t.uri }}
            style={[styles.tile, { left: t.left, top: t.top }]}
            fadeDuration={0}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.pulse,
          {
            backgroundColor: glow || accent,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
          },
        ]}
      />
      <View style={[styles.pin, { backgroundColor: accent }]} />
    </View>
  );
}

// Everything here is derived from the props, and the pulse runs on its own
// Animated value, so an unchanged coordinate never needs redrawing.
export default React.memo(MiniMap);

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    // .foryou-map's translucent white plate, which is what shows through while
    // the tiles are still loading.
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { position: "absolute" },
  tile: { position: "absolute", width: TILE, height: TILE },
  pulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pin: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
