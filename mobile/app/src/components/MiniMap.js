import React, { useMemo } from "react";
import { View, Image, StyleSheet } from "react-native";

/**
 * The little map at the top of a For You card (the web's `.card-map`).
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
const ZOOM = 14;
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

export default function MiniMap({ lat, lng, width, height, accent, dark, style }) {
  const tiles = useMemo(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    const { x: worldX, y: worldY } = project(lat, lng, ZOOM);
    // The rectangle of world pixels the card actually shows, centred on the venue.
    const left = worldX - width / 2;
    const top = worldY - height / 2;

    const firstX = Math.floor(left / TILE);
    const firstY = Math.floor(top / TILE);
    const lastX = Math.floor((left + width) / TILE);
    const lastY = Math.floor((top + height) / TILE);

    const max = Math.pow(2, ZOOM);
    const out = [];
    for (let ty = firstY; ty <= lastY; ty += 1) {
      for (let tx = firstX; tx <= lastX; tx += 1) {
        // Wrap horizontally at the date line; vertical is clamped by Mercator.
        const wrappedX = ((tx % max) + max) % max;
        if (ty < 0 || ty >= max) continue;
        out.push({
          key: `${tx}/${ty}`,
          uri: tileUrl(wrappedX, ty, ZOOM, dark),
          left: tx * TILE - left,
          top: ty * TILE - top,
        });
      }
    }
    return out;
  }, [lat, lng, width, height, dark]);

  if (!tiles) return null;

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri }}
          style={[styles.tile, { left: t.left, top: t.top }]}
          fadeDuration={0}
        />
      ))}
      <View style={[styles.pin, { backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#dfe3ea" },
  tile: { position: "absolute", width: TILE, height: TILE },
  pin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
    marginLeft: -8,
    marginTop: -8,
  },
});
