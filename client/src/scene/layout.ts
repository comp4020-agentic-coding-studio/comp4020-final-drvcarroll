// Where things sit in the scene (game-design.md §12): orbits log-scaled so
// the whole system fits, bodies exaggerated so they read at every zoom.
import { BODIES, REGIONS } from "../../../rules/data/index.ts";
import { longitude } from "../../../rules/orbit.ts";

export type V3 = [number, number, number];

export const orbitRadius = (a: number) => 60 + 110 * Math.log(a / 0.3);

export const SIZE: Record<string, number> = {
  earth: 4, luna: 1.3, mercury: 2, venus: 3.7, mars: 2.6, phobos: 0.45, deimos: 0.4,
  ceres: 1.2, vesta: 1, psyche: 1, jupiter: 11, io: 1.4, europa: 1.25, ganymede: 1.9, callisto: 1.75,
  saturn: 9.5, titan: 1.85, enceladus: 0.8, uranus: 6.5, titania: 1, oberon: 1, neptune: 6.3, triton: 1.15, pluto: 1.1,
};

// Antarctica is a body in the rules but a patch on Earth's globe.
export const sphereOf = (body: string) => (body === "antarctica" ? "earth" : body);
export const SPHERES = Object.keys(BODIES).filter((b) => b !== "antarctica");

const MOON_DAYS_MIN = 8; // slow the fastest moons so they don't strobe

const moons = (parent: string) => SPHERES.filter((b) => BODIES[b].parent === parent);

export function moonDistance(id: string): number {
  const parent = BODIES[id].parent!;
  return SIZE[parent] * 2.4 + 3.2 * moons(parent).indexOf(id);
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
