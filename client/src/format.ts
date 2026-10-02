// Display helpers: names, numbers, durations, the game calendar.
import { BODIES, BUILDINGS, REGIONS, RESOURCE_NAMES, RUNGS, UNITS, type Goods, type Resource } from "../../rules/data/index.ts";
import type { Command, Ms } from "../../rules/index.ts";

export const regionName = (id: string) => REGIONS[id]?.name ?? id;
export const bodyName = (id: string) => BODIES[id]?.name ?? id;

export function num(x: number, digits = 0): string {
  if (Math.abs(x) >= 10_000) return `${(x / 1000).toFixed(1)}k`;
  return x.toFixed(digits);
}

export const signed = (x: number, digits = 1) => `${x >= 0 ? "+" : "−"}${num(Math.abs(x), digits)}`;

export function dur(ms: Ms): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// 1 game day = 1 real second from 1 Jan 2050 at season start.
export function gameDate(seasonStart: Ms, t: Ms): string {
  const d = new Date(Date.UTC(2050, 0, 1) + Math.max(0, t - seasonStart) * 86_400);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function goods(g: Goods): string {
  return (Object.entries(g) as [Resource, number][]).map(([r, v]) => `${num(v)} ${RESOURCE_NAMES[r]}`).join(", ") || "nothing";
}

export function describe(c: Command): string {
  switch (c.type) {
    case "build": return `Build ${BUILDINGS[c.building]?.name ?? c.building} in ${regionName(c.region)}`;
    case "demolish": return `Demolish in ${regionName(c.region)}`;
    case "cancelBuild": return `Cancel in ${regionName(c.region)}`;
    case "setMode": return `Switch Power Plant to ${c.mode}`;
    case "research": return `Research ${RUNGS[c.tech]?.name ?? c.tech}`;
    case "cancelResearch": return "Cancel research";
    case "train": return `Train ${c.count} Army in ${regionName(c.region)}`;
    case "buildShip": return `Build ${c.count} ${UNITS[c.unit]?.name ?? c.unit}`;
    case "launch": return `Launch to ${bodyName(c.to)}`;
    case "colonise": return `Colonise ${regionName(c.region)}`;
    case "invade": return `Invade ${regionName(c.region)}`;
    case "march": return `March to ${regionName(c.to)}`;
    case "join": return `Start in ${regionName(c.region)}`;
    case "exchange": return `Exchange ${c.amount} ${RESOURCE_NAMES[c.give]}`;
    default: return c.type.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase());
  }
}
