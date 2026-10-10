// Where things sit in the scene (game-design.md §12): orbits log-scaled so
// the whole system fits, bodies exaggerated so they read at every zoom.
import { BODIES, MAP, REGIONS } from "../../../rules/data/index.ts";
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
  charon: 606, mimas: 198, tethys: 531, dione: 561, rhea: 764, iapetus: 735, amalthea: 84, miranda: 236,
  ariel: 579, umbriel: 585, eris: 1163, makemake: 715, haumea: 780, sedna: 500,
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

// Decorative, non-colonisable bodies (§12 "A full, busy system"): moons by
// real period in days; dwarf planets by orbit (AU, days, degrees).
interface Minor { name: string; parent?: string; periodDays: number; a?: number; l0Deg?: number; incDeg?: number }
export const MINOR: Record<string, Minor> = {
  charon: { name: "Charon", parent: "pluto", periodDays: 6.4 },
  mimas: { name: "Mimas", parent: "saturn", periodDays: 0.94 },
  tethys: { name: "Tethys", parent: "saturn", periodDays: 1.89 },
  dione: { name: "Dione", parent: "saturn", periodDays: 2.74 },
  rhea: { name: "Rhea", parent: "saturn", periodDays: 4.52 },
  iapetus: { name: "Iapetus", parent: "saturn", periodDays: 79.3 },
  amalthea: { name: "Amalthea", parent: "jupiter", periodDays: 0.5 },
  miranda: { name: "Miranda", parent: "uranus", periodDays: 1.41 },
  ariel: { name: "Ariel", parent: "uranus", periodDays: 2.52 },
  umbriel: { name: "Umbriel", parent: "uranus", periodDays: 4.14 },
  eris: { name: "Eris", a: 67.9, periodDays: 204_199, l0Deg: 205, incDeg: 44 },
  makemake: { name: "Makemake", a: 45.4, periodDays: 111_845, l0Deg: 168, incDeg: 29 },
  haumea: { name: "Haumea", a: 43.2, periodDays: 103_774, l0Deg: 218, incDeg: 28 },
  sedna: { name: "Sedna", a: 506, periodDays: 4_160_000, l0Deg: 358, incDeg: 12 },
};

export const parentOf = (id: string): string | undefined => (MINOR[id] ?? BODIES[id]).parent;

// Each planet's moons in real order, playable and decorative together.
const MOON_ORDER: Record<string, string[]> = {
  earth: ["luna"], mars: ["phobos", "deimos"], pluto: ["charon"], neptune: ["triton"],
  jupiter: ["amalthea", "io", "europa", "ganymede", "callisto"],
  saturn: ["mimas", "enceladus", "tethys", "dione", "rhea", "titan", "iapetus"],
  uranus: ["miranda", "ariel", "umbriel", "titania", "oberon"],
};

// Moons sit out from their planet in proportion to its size, clear of rings.
export function moonDistance(id: string): number {
  const parent = parentOf(id)!;
  const start = parent === "saturn" ? 2.9 : 2.2;
  return SIZE[parent] * (start + 0.6 * MOON_ORDER[parent].indexOf(id)) + 3;
}

// Real order kept, but compressed so the fastest moons don't strobe.
const moonDays = (real: number) => 6 + 4 * Math.sqrt(real);

export function position(id: string, t: number, start: number): V3 {
  const minor = MINOR[id];
  if (minor && !minor.parent) {
    const r = orbitRadius(minor.a!);
    const days = MAP.calendarStartJ2000Days + (t - start) / MAP.dayMs;
    const th = (minor.l0Deg! * Math.PI) / 180 + (2 * Math.PI * days) / minor.periodDays;
    const y = r * Math.sin((minor.incDeg! * Math.PI) / 180) * Math.sin(th) * 0.5;
    return [r * Math.cos(th), y, -r * Math.sin(th)];
  }
  const parent = id === "antarctica" ? null : parentOf(id) ?? null;
  const host = parent ?? sphereOf(id);
  const r = orbitRadius(BODIES[host].orbit.a);
  const th = longitude(host, t, start);
  const p: V3 = [r * Math.cos(th), 0, -r * Math.sin(th)];
  if (!parent) return p;
  const days = (t - start) / 1000;
  const k = MOON_ORDER[parent].indexOf(id);
  const a = (2 * Math.PI * days) / moonDays(minor?.periodDays ?? BODIES[id].moonPeriodDays ?? 30) + k * 2.1;
  const d = moonDistance(id);
  return [p[0] + d * Math.cos(a), 0, p[2] - d * Math.sin(a)];
}

export function latLon(lat: number, lon: number): V3 {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

// Regions on a sphere in map order: index i + 1 on its region map.
export const regionsOn = (sphere: string) => Object.values(REGIONS).filter((r) => sphereOf(r.body) === sphere);

// Gas-giant regions are orbits (game-design.md §4): bands at these radii,
// in body radii, clear of the rings except Saturn's ring station.
export const BANDS: Record<string, number> = {
  r_jupiter_jupiter_low_orbit: 1.45, r_jupiter_jupiter_high_orbit: 2.0,
  r_saturn_saturn_ring_station: 1.75, r_saturn_saturn_high_orbit: 2.7,
  r_uranus: 2.2, r_neptune: 1.6,
};

// Where a region's label and fly-to point sit, in body radii from the
// centre: its map.ts anchor on the surface, or a point on its band.
export const TILT: Record<string, number> = { saturn: 0.47, uranus: 1.4 }; // ring plane, radians

export function anchor(region: string): V3 {
  const band = BANDS[region];
  if (band) {
    const t = TILT[REGIONS[region].body] ?? 0, z = band * Math.SQRT1_2;
    return [z, -z * Math.sin(t), z * Math.cos(t)];
  }
  const d = latLon(REGIONS[region].lat, REGIONS[region].lon);
  return [d[0] * 1.01, d[1] * 1.01, d[2] * 1.01];
}
