// A flat system view until the 3D scene (Stage E): bodies at position(t)
// from the rules, distances log-scaled, fleets moving along their transfer.
import { BODIES, type BodyData } from "../../../rules/data/index.ts";
import { longitude } from "../../../rules/orbit.ts";
import { clock, me, nations, season, selBody, selRegion, tab, world } from "../store.ts";

const A_MIN = 0.387, A_MAX = 39.5, R0 = 34, R1 = 228;
const radius = (a: number) => R0 + ((R1 - R0) * Math.log(a / A_MIN)) / Math.log(A_MAX / A_MIN);
const MOON_DAYS_MIN = 20; // slow fast moons down so they don't strobe

type P = { x: number; y: number };
const polar = (r: number, th: number): P => ({ x: r * Math.cos(th), y: -r * Math.sin(th) });

function pos(b: BodyData, t: number, start: number): P {
  const parent = BODIES[b.parent ?? b.id];
  const p = polar(radius(parent.orbit.a), longitude(parent.id, t, start));
  if (!b.parent || b.id === "antarctica") return p;
  const siblings = Object.values(BODIES).filter((x) => x.parent === b.parent && x.id !== "antarctica");
  const k = siblings.indexOf(b);
  const days = (t - start) / 1000;
  const th = (2 * Math.PI * days) / Math.max(MOON_DAYS_MIN, b.moonPeriodDays ?? 30) + k;
  return { x: p.x + (7 + 3 * k) * Math.cos(th), y: p.y - (7 + 3 * k) * Math.sin(th) };
}

export function select(body: string): void {
  selBody.value = body;
  selRegion.value = null;
  tab.value = "region";
}

export function SystemMap() {
  const sz = season.value, w = world.value;
  if (!sz || !w) return null;
  const t = clock.value, start = sz.startedAt;
  const bodies = Object.values(BODIES).filter((b) => b.id !== "antarctica");
  const planets = bodies.filter((b) => !b.parent);
  const ownerAt = (body: string) => {
    const owners = new Set(w.regions.filter((r) => r.body === body && r.owner).map((r) => r.owner!));
    return [...owners];
  };
  return (
    <svg class="map" viewBox="-240 -240 480 480" role="img" aria-label="Solar system map">
      <circle r="9" class="sun" />
      {planets.map((b) => <circle key={b.id} r={radius(b.orbit.a)} class="orbit" />)}
      {bodies.map((b) => {
        const p = pos(b, t, start);
        const owners = ownerAt(b.id);
        const mine = me.value && owners.includes(me.value);
        const sel = selBody.value === b.id;
        const r = b.parent ? 2.4 : b.zone === "belt" ? 3 : 4.5;
        return (
          <g
            key={b.id}
            class={`body ${sel ? "sel" : ""}`}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            onClick={() => select(b.id)}
          >
            <title>{b.name}</title>
            {owners.slice(0, 3).map((o, i) => (
              <circle key={o} r={r + 2.5 + i * 1.6} class="owner" style={{ stroke: nations.value[o]?.primary }} />
            ))}
            <circle r={r} class={mine ? "planet mine" : "planet"} />
            {sel && <circle r={r + 7} class="selring" />}
            {(!b.parent || sel) && <text y={-r - 4}>{b.name.replace(" orbital", "")}</text>}
          </g>
        );
      })}
      {w.fleets.map((f) => {
        const colour = nations.value[f.owner]?.primary ?? "#fff";
        if (f.transit) {
          const { from, to, departAt, arriveAt } = f.transit;
          const k = Math.min(1, Math.max(0, (t - departAt) / (arriveAt - departAt)));
          const a = pos(BODIES[from], departAt, start), b = pos(BODIES[to], arriveAt, start);
          const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
          const ta = Math.atan2(-a.y, a.x);
          let dt = Math.atan2(-b.y, b.x) - ta;
          dt = ((dt + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
          const p = polar(ra + (rb - ra) * k, ta + dt * k);
          return (
            <g key={f.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="route" style={{ stroke: colour }} />
              <polygon points="0,-4 3.5,3 -3.5,3" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} style={{ fill: colour }}>
                <title>{`${nations.value[f.owner]?.name ?? "Fleet"} → ${BODIES[to].name}`}</title>
              </polygon>
            </g>
          );
        }
        const p = pos(BODIES[f.at!], t, start);
        return <rect key={f.id} x={p.x + 5} y={p.y + 3} width="4" height="4" style={{ fill: colour }}><title>Fleet in orbit</title></rect>;
      })}
    </svg>
  );
}
