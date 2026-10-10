// game-design.md §12: icons, never letters. Every icon carries its name for
// screen readers (aria-label) and as a hover tooltip (<title>).
import type { ComponentChildren } from "preact";
import { BUILDINGS, RESOURCE_NAMES, UNITS, type Building, type Goods, type PowerMode, type Resource, type Unit } from "../../../rules/data/index.ts";
import { num } from "../format.ts";

export const RES_COLOUR: Record<Resource, string> = {
  E: "#ffd166", M: "#c3cedc", V: "#6ee7d7", A: "#f4a261", R: "#b892ff", Mt: "#7bd88f",
};

function Svg(p: { label: string; size: number; view?: number; class?: string; children: ComponentChildren }) {
  const v = p.view ?? 24;
  return (
    <svg class={`ico ${p.class ?? ""}`} width={p.size} height={p.size} viewBox={`0 0 ${v} ${v}`} role="img" aria-label={p.label}
      fill="none" stroke="currentColor" stroke-width={v / 16} stroke-linecap="round" stroke-linejoin="round">
      <title>{p.label}</title>
      {p.children}
    </svg>
  );
}

const RES_ART: Record<Resource, ComponentChildren> = {
  E: <path d="M13.5 2 5 13.5h6L9.5 22 19 9.8h-6.2L13.5 2Z" fill="currentColor" fill-opacity="0.25" />,
  M: <><path d="M3 15.5 7.5 6l7-2.5 6.5 6.5-2 8.5-9 2.5L3 15.5Z" fill="currentColor" fill-opacity="0.2" /><path d="M7.5 6 10 13l-7 2.5M10 13l9.5 4.5M10 13l4.5-9.5" /></>,
  V: <><path d="M12 2.5S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-12.5-7-12.5Z" fill="currentColor" fill-opacity="0.2" /><circle cx="9.5" cy="15.5" r="1.6" /><circle cx="13.5" cy="12" r="1" /></>,
  A: <><path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3L12 2.5Z" fill="currentColor" fill-opacity="0.2" /><circle cx="12" cy="12" r="3.4" /></>,
  R: <><ellipse cx="12" cy="12" rx="10" ry="4" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /></>,
  Mt: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" fill="currentColor" fill-opacity="0.2" /><path d="M3 7.5 12 12l9-4.5M12 12v9M7.5 5.2l9 4.6" /></>,
};

export function ResIcon({ res, size = 16 }: { res: Resource; size?: number }) {
  return <span class="res-ico" style={{ color: RES_COLOUR[res] }}><Svg label={RESOURCE_NAMES[res]} size={size}>{RES_ART[res]}</Svg></span>;
}

export function SolarIcon({ size = 16 }: { size?: number }) {
  return (
    <span class="res-ico" style={{ color: "#ffb35c" }}>
      <Svg label="Solar" size={size}>
        <circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity="0.25" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </Svg>
    </span>
  );
}

// An amount with its icon: "12 [Metals]". Red when you can't cover it.
export function Amt({ res, v, short, sign }: { res: Resource; v: number; short?: boolean; sign?: boolean }) {
  const digits = Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 2 : 1;
  const text = `${sign ? (v >= 0 ? "+" : "−") : ""}${num(Math.abs(v), digits)}`;
  return <span class={`amt ${short ? "short" : sign ? (v < 0 ? "neg" : "pos") : ""}`}>{text}<ResIcon res={res} size={14} /></span>;
}

export function Goodsline({ goods }: { goods: Goods }) {
  const e = Object.entries(goods) as [Resource, number][];
  if (!e.length) return <span class="muted">nothing</span>;
  return <span class="goods">{e.map(([r, v]) => <Amt key={r} res={r} v={v} />)}</span>;
}

// Buildings: 32-unit art, the resource accent on the part that makes it.
const B = 32;
const BUILDING_ART: Record<Exclude<Building, "powerPlant"> | `powerPlant.${PowerMode}`, [string, ComponentChildren]> = {
  "powerPlant.solar": [RES_COLOUR.E, <>
    <circle cx="24" cy="7" r="3" fill="currentColor" fill-opacity="0.35" />
    <path d="M4 22 9 12h14l5 10H4Z" fill="currentColor" fill-opacity="0.15" />
    <path d="M6.5 17h19M13 12l-2 10M19 12l2 10M16 22v6M11 28h10" />
  </>],
  "powerPlant.fission": [RES_COLOUR.E, <>
    <path d="M7 28c2-6 2-13 0-20h12c-2 7-2 14 0 20H7Z" fill="currentColor" fill-opacity="0.15" />
    <path d="M10 4.5c1-1.5 3-1.5 4 0M15 3c1-1.5 3-1.5 4 0" />
    <circle cx="24.5" cy="20" r="1.4" fill="currentColor" />
    <ellipse cx="24.5" cy="20" rx="5" ry="2" /><ellipse cx="24.5" cy="20" rx="5" ry="2" transform="rotate(60 24.5 20)" /><ellipse cx="24.5" cy="20" rx="5" ry="2" transform="rotate(120 24.5 20)" />
  </>],
  "powerPlant.fusion": [RES_COLOUR.E, <>
    <ellipse cx="16" cy="16" rx="12" ry="6.5" fill="currentColor" fill-opacity="0.15" />
    <ellipse cx="16" cy="16" rx="5.5" ry="2.4" />
    <path d="M6 12.5v7M26 12.5v7M11 10v12M21 10v12" />
    <circle cx="16" cy="16" r="1.4" fill="currentColor" />
  </>],
  mine: [RES_COLOUR.M, <>
    <path d="M3 28 10 19l4 3 5-6 10 12H3Z" fill="currentColor" fill-opacity="0.18" />
    <path d="M9 19V4h8v10M9 4l8 7M17 4 9 11M7 4h12" />
    <circle cx="13" cy="7.5" r="1.6" />
    <path d="M22 9.5h6" />
  </>],
  refinery: [RES_COLOUR.V, <>
    <rect x="4" y="12" width="9" height="16" rx="4.5" fill="currentColor" fill-opacity="0.18" />
    <rect x="16" y="16" width="8" height="12" rx="4" fill="currentColor" fill-opacity="0.18" />
    <path d="M27 28V8M27 8c-1.5-1.5-1.5-3 0-5 1.5 2 1.5 3.5 0 5M13 20h3M8.5 12V8h10v8" />
  </>],
  foundry: [RES_COLOUR.A, <>
    <path d="M5 9h14l-2 12H7L5 9Z" fill="currentColor" fill-opacity="0.18" />
    <path d="M19 12c3 0 4 1.5 4 4v5" /><path d="M23 21c0 2.5-1 4-1 5.5a1.5 1.5 0 0 0 3 0c0-1.5-1-3-2-5.5" fill="currentColor" />
    <path d="M3 28h26M9 5l1.5-2M14 5l1.5-2" />
  </>],
  lab: [RES_COLOUR.R, <>
    <path d="M12 3h8M13.5 3v8L6 25a2.5 2.5 0 0 0 2.2 3.5h15.6A2.5 2.5 0 0 0 26 25l-7.5-14V3" />
    <path d="M9.2 19h13.6L26 25a2.5 2.5 0 0 1-2.2 3.5H8.2A2.5 2.5 0 0 1 6 25l3.2-6Z" fill="currentColor" fill-opacity="0.3" />
    <circle cx="14" cy="23.5" r="1.2" fill="currentColor" /><circle cx="18.5" cy="21.5" r="0.9" fill="currentColor" />
  </>],
  factory: [RES_COLOUR.Mt, <>
    <path d="M3 28V14l7 4v-4l7 4v-4l7 4V5h5v23H3Z" fill="currentColor" fill-opacity="0.15" />
    <circle cx="12" cy="23" r="2.6" />
    <path d="M12 18.8v1.6M12 25.6v1.6M7.8 23h1.6M14.6 23h1.6M19 22h3M19 25h3" />
  </>],
  spaceport: ["#7fc8ff", <>
    <path d="M16 3c3 3 4.5 7 4.5 12v6h-9v-6C11.5 10 13 6 16 3Z" fill="currentColor" fill-opacity="0.2" />
    <circle cx="16" cy="12" r="1.8" />
    <path d="M11.5 16 8 20v3h3.5M20.5 16l3.5 4v3h-3.5M14 21v3M18 21v3M3 28h26M6 28v-3h4M26 28v-3h-4" />
  </>],
};

export function BuildingIcon(p: { type: Building; mode?: string; size?: number; boosted?: boolean }) {
  const key = p.type === "powerPlant" ? (`powerPlant.${(p.mode ?? "solar") as PowerMode}` as const) : p.type;
  const [colour, art] = BUILDING_ART[key];
  const label = p.type === "powerPlant" ? `${cap(p.mode ?? "solar")} Power Plant` : BUILDINGS[p.type].name;
  return (
    <span class="b-ico" style={{ color: colour }}>
      <Svg label={p.boosted ? `${label}, boosted by Industry tech` : label} size={p.size ?? 36} view={B}>{art}</Svg>
      {p.boosted && <i class="pip" aria-hidden="true" />}
    </span>
  );
}

const UNIT_ART: Record<Unit, ComponentChildren> = {
  army: <><path d="M5 13a7 7 0 0 1 14 0v2H5v-2Z" fill="currentColor" fill-opacity="0.2" /><path d="M3 15h18M8 15v4h8v-4M12 6V3" /></>,
  colonyShip: <><path d="M3 14h18l-3 4H6l-3-4Z" fill="currentColor" fill-opacity="0.2" /><path d="M6 14a6 6 0 0 1 12 0M12 8V5M9 11l1.5 1.5M15 11l-1.5 1.5" /></>,
  freighter: <><rect x="3" y="8" width="13" height="8" rx="1" fill="currentColor" fill-opacity="0.2" /><path d="M16 9h3l2 3-2 3h-3M7.5 8v8M11.5 8v8" /></>,
  troopTransport: <><path d="M3 9h13l5 3-5 3H3V9Z" fill="currentColor" fill-opacity="0.2" /><circle cx="7" cy="12" r="1" fill="currentColor" /><circle cx="11" cy="12" r="1" fill="currentColor" /></>,
  corvette: <path d="M2 12 14 7l8 5-8 5-12-5Z" fill="currentColor" fill-opacity="0.25" />,
  destroyer: <><path d="M2 12 12 6l10 6-10 6-10-6Z" fill="currentColor" fill-opacity="0.25" /><path d="M8 12h8" /></>,
  battleship: <><path d="M2 12 8 6h8l6 6-6 6H8l-6-6Z" fill="currentColor" fill-opacity="0.25" /><path d="M7 12h10M10 9h4M10 15h4" /></>,
  dreadnought: <><path d="M1.5 12 6 5h12l4.5 7-4.5 7H6l-4.5-7Z" fill="currentColor" fill-opacity="0.3" /><path d="M6 12h12M9 8.5h6M9 15.5h6M12 5v14" /></>,
};

export function UnitIcon({ unit, size = 16 }: { unit: Unit; size?: number }) {
  return <span class="u-ico"><Svg label={UNITS[unit].name} size={size}>{UNIT_ART[unit]}</Svg></span>;
}

export function Units({ units }: { units: Partial<Record<Unit, number>> }) {
  return (
    <span class="goods">
      {(Object.entries(units) as [Unit, number][]).map(([u, n]) => <span key={u} class="amt">{n}<UnitIcon unit={u} /></span>)}
    </span>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
