// game-design.md §12: each body's region map, built by scripts/worlds.ts.
// One index per pixel (0 = none); the shader tints from it, picking reads it.
import * as THREE from "three";
import { regionsOn, type V3 } from "./layout.ts";

export const STEP = 8; // matches scripts/worlds.ts
export interface RegionMap { w: number; h: number; px: Uint8Array; tex: THREE.DataTexture }

const maps = new Map<string, RegionMap>();

export async function loadRegionMap(sphere: string): Promise<RegionMap> {
  const res = await fetch(`/static/worlds/${sphere}.regions.png`);
  const img = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, img.width, img.height).data;
  const px = new Uint8Array(img.width * img.height);
  for (let i = 0; i < px.length; i++) px[i] = Math.round(rgba[i * 4] / STEP);
  const tex = new THREE.DataTexture(px, img.width, img.height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const m = { w: img.width, h: img.height, px, tex };
  maps.set(sphere, m);
  return m;
}

// The region under a direction from the body's centre, or null (ocean,
// orbit-only body, or map not loaded yet).
export function regionAt(sphere: string, d: V3): string | null {
  const m = maps.get(sphere);
  if (!m) return null;
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1] / Math.hypot(...d))));
  const lon = Math.atan2(-d[2], d[0]);
  const x = Math.min(m.w - 1, Math.floor((lon / (2 * Math.PI) + 0.5) * m.w));
  const y = Math.min(m.h - 1, Math.floor((0.5 - lat / Math.PI) * m.h));
  const k = m.px[y * m.w + x];
  return k ? regionsOn(sphere)[k - 1].id : null;
}

// Bodies with a real map (scripts/worlds.ts SOURCES); the rest stay procedural.
export const TEXTURED = new Set([
  "mercury", "venus", "earth", "luna", "mars", "jupiter", "saturn", "uranus", "neptune", "io", "europa", "ganymede",
  "callisto", "titan", "enceladus", "vesta", "phobos", "deimos", "titania", "oberon", "triton", "pluto",
]);
export type Tier = "512" | "2k" | "top";

const loader = new THREE.TextureLoader();
export async function loadTexture(name: string, tier: Tier): Promise<THREE.Texture> {
  const t = await loader.loadAsync(`/static/worlds/${name}.${tier}.webp`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
