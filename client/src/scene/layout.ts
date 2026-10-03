// Where things sit in the scene (game-design.md §12): orbits log-scaled so
// the whole system fits, bodies exaggerated so they read at every zoom.
import { BODIES, REGIONS } from "../../../rules/data/index.ts";
import { longitude } from "../../../rules/orbit.ts";

export type V3 = [number, number, number];

export const orbitRadius = (a: number) => 140 + 260 * Math.log(a / 0.3);

// Mean radii in km. Display size keeps real proportions, compressed by a
// 0.75 power, so Jupiter is ~6 Earths across rather than 11 or 1.
export const RADIUS_KM: Record<string, number> = {
  sun: 696_000, earth: 6371, luna: 1737, mercury: 2440, venus: 6052, mars: 3390, phobos: 11, deimos: 6,
  ceres: 470, vesta: 263, psyche: 113, jupiter: 69_911, io: 1822, europa: 1561, ganymede: 2634, callisto: 2410,
  saturn: 58_232, titan: 2575, enceladus: 252, uranus: 25_362, titania: 789, oberon: 761, neptune: 24_622,
  triton: 1353, pluto: 1188,
};
const EARTH_SIZE = 4;
export const sizeOf = (km: number, min = 0.35) => Math.max(min, EARTH_SIZE * (km / RADIUS_KM.earth) ** 0.75);
export const SIZE: Record<string, number> = Object.fromEntries(
  Object.entries(RADIUS_KM).filter(([k]) => k !== "sun").map(([k, km]) => [k, sizeOf(km)]),
);
export const SUN_SIZE = 46; // compressed further still, or it would swallow Mercury

// Antarctica is a body in the rules but a patch on Earth's globe.
export const sphereOf = (body: string) => (body === "antarctica" ? "earth" : body);
export const SPHERES = Object.keys(BODIES).filter((b) => b !== "antarctica");

const MOON_DAYS_MIN = 8; // slow the fastest moons so they don't strobe

const moons = (parent: string) => SPHERES.filter((b) => BODIES[b].parent === parent);

// Moons sit out from their planet in proportion to its size, clear of rings.
export function moonDistance(id: string): number {
  const parent = BODIES[id].parent!;
  const start = parent === "saturn" ? 2.9 : 2.2;
  return SIZE[parent] * (start + 0.6 * moons(parent).indexOf(id)) + 3;
}

export function position(id: string, t: number, start: number): V3 {
  const b = BODIES[id];
  const parent = b.parent && id !== "antarctica" ? b.parent : null;
  const host = parent ?? sphereOf(id);
  const r = orbitRadius(BODIES[host].orbit.a);
  const th = longitude(host, t, start);
  const p: V3 = [r * Math.cos(th), 0, -r * Math.sin(th)];
  if (!parent) return p;
  const days = (t - start) / 1000;
  const k = moons(parent).indexOf(id);
  const a = (2 * Math.PI * days) / Math.max(MOON_DAYS_MIN, b.moonPeriodDays ?? 30) + k * 2.1;
  const d = moonDistance(id);
  return [p[0] + d * Math.cos(a), 0, p[2] - d * Math.sin(a)];
}

export function latLon(lat: number, lon: number): V3 {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

// One seed per region: Earth's at real geography, others spread evenly.
export function seeds(sphere: string): { region: string; dir: V3 }[] {
  const regions = Object.values(REGIONS).filter((r) => sphereOf(r.body) === sphere);
  if (regions.every((r) => r.lat !== undefined)) return regions.map((r) => ({ region: r.id, dir: latLon(r.lat!, r.lon!) }));
  const n = regions.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  return regions.map((r, i) => {
    const y = n === 1 ? 1 : 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(1 - y * y);
    return { region: r.id, dir: norm([Math.cos(golden * i) * rad, y * 0.85, Math.sin(golden * i) * rad]) };
  });
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Bends patch edges into organic shapes. Mirrored exactly in the region
// shader, so a click lands on the patch you see.
export const WARP = { amp: 0.11, f1: 3.1, f2: 5.3, amp2: 0.045, g1: 9.7, g2: 13.1 };
export function warp(d: V3): V3 {
  const [x, y, z] = d, w = WARP;
  return norm([
    x + w.amp * Math.sin(y * w.f1 + z * w.f2) + w.amp2 * Math.sin(y * w.g1 + z * w.g2),
    y + w.amp * Math.sin(z * w.f1 + x * w.f2) + w.amp2 * Math.sin(z * w.g1 + x * w.g2),
    z + w.amp * Math.sin(x * w.f1 + y * w.f2) + w.amp2 * Math.sin(x * w.g1 + y * w.g2),
  ]);
}

// The region under a direction from the body's centre: the nearest seed.
export function regionAt(sphere: string, dir: V3): string {
  const w = warp(norm(dir));
  let best = "", bestDot = -Infinity;
  for (const s of seeds(sphere)) {
    const d = s.dir[0] * w[0] + s.dir[1] * w[1] + s.dir[2] * w[2];
    if (d > bestDot) [best, bestDot] = [s.region, d];
  }
  return best;
}
