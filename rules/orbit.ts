// game-design.md §2, §7: positions are a pure function of time; travel and
// launch energy follow from them.
import { BODIES, MAP, TRAVEL, UNITS, ZONE_LAUNCH_COST, type Mod, type Unit } from "./data/index.ts";
import type { Ms } from "./protocol.ts";

const TAU = 2 * Math.PI;
const wrap = (x: number) => x - TAU * Math.floor((x + Math.PI) / TAU); // to [−π, π)

// Heliocentric mean longitude in radians; moons share their parent's.
export function longitude(body: string, t: Ms, seasonStart: Ms): number {
  const o = BODIES[body].orbit;
  const days = MAP.calendarStartJ2000Days + (t - seasonStart) / MAP.dayMs;
  return wrap(((o.l0Deg * Math.PI) / 180) + (TAU * days) / o.periodDays);
}

const system = (body: string) => BODIES[body].parent ?? body;
export const isLocal = (a: string, b: string) => system(a) === system(b);

export function hohmannDays(from: string, to: string): number {
  const a = (BODIES[from].orbit.a + BODIES[to].orbit.a) / 2;
  return TRAVEL.hohmannDaysPerAU * a ** 1.5;
}

export function travelMs(from: string, to: string, units: Partial<Record<Unit, number>>, m: Record<Mod, number>): Ms {
  if (isLocal(from, to)) return TRAVEL.localS * 1000;
  const slowest = Math.min(...Object.entries(units).filter(([u, c]) => c && UNITS[u as Unit].mass > 0)
    .map(([u]) => UNITS[u as Unit].speed));
  return (hohmannDays(from, to) * MAP.dayMs) / ((1 + m.speed) * slowest);
}

// 1 in the window, up to 1 + k at worst.
export function windowPenalty(from: string, to: string, t: Ms, seasonStart: Ms, m: Record<Mod, number>): number {
  if (isLocal(from, to)) return 1;
  const [a1, a2] = [BODIES[from].orbit.a, BODIES[to].orbit.a];
  const ideal = Math.PI * (1 - ((a1 + a2) / (2 * a2)) ** 1.5);
  const phase = longitude(to, t, seasonStart) - longitude(from, t, seasonStart);
  const k = Math.max(0, TRAVEL.windowCoefficient + m.windowCoefficient);
  return 1 + (k * Math.abs(wrap(phase - ideal))) / Math.PI;
}

export const fleetMass = (units: Partial<Record<Unit, number>>) =>
  Object.entries(units).reduce((a, [u, c]) => a + UNITS[u as Unit].mass * (c ?? 0), 0);

export function launchEnergy(
  from: string, to: string, units: Partial<Record<Unit, number>>, t: Ms, seasonStart: Ms, m: Record<Mod, number>,
): number {
  const zone = ZONE_LAUNCH_COST[BODIES[to].zone];
  return fleetMass(units) * zone * Math.max(0, 1 + m.launchCost) * windowPenalty(from, to, t, seasonStart, m);
}
