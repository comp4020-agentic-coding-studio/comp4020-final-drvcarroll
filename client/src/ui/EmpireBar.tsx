// game-design.md §12 empire bar: every region you hold, grouped by body. The
// selected one drops down to its slots and output; a second click flies
// there. Doubles as the keyboard route into the map (goals.md P7).
import { useState } from "preact/hooks";
import { BODIES, BUILDINGS, REGIONS, RESOURCES, UNITS, type Building, type Resource, type Unit } from "../../../rules/data/index.ts";
import { slotsOf } from "../../../rules/economy.ts";
import type { Region } from "../../../rules/index.ts";
import { bodyName, dur, perDay } from "../format.ts";
import { eco, mirror } from "../mirror.ts";
import { clock, me, selFleet, selRegion, world, you } from "../store.ts";
import { focusOn, picked, selectFleet } from "./SceneHost.tsx";
import { Tutorial } from "./Side.tsx";

export function EmpireBar() {
  const w = world.value!;
  const [open, setOpen] = useState(innerWidth > 720);
  const [all, setAll] = useState(false);
  const mine = w.regions.filter((r) => r.owner === me.value);
  const byBody: Record<string, Region[]> = {};
  for (const r of mine) (byBody[r.body] ??= []).push(r);
  const fleets = w.fleets.filter((f) => f.owner === me.value);
  return (
    <nav class={`hud empire ${open ? "" : "closed"}`} aria-label="Your empire">
      <button class="hud-title" aria-expanded={open} onClick={() => setOpen(!open)}>Empire {open ? "▾" : "▸"}</button>
      {open && (
        <div class="scroll">
          <h4>Territory <small>{mine.length}</small></h4>
          <ul class="list tight">
            {Object.entries(byBody).map(([body, rs]) => (
              <li key={body}>
                <button class="row body" onClick={() => focusOn(body)}><b>{bodyName(body)}</b><small>{rs.length}</small></button>
                <ul class="list tight sub">
                  {rs.map((r) => <RegionRow key={r.id} r={r} />)}
                </ul>
              </li>
            ))}
          </ul>
          <h4>Fleets <small>{fleets.length || ""}</small></h4>
          {fleets.length === 0 && <p class="hint">None yet.</p>}
          <ul class="list tight">
            {fleets.map((f) => (
              <li key={f.id}>
                <button class={`row ${selFleet.value === f.id ? "on" : ""}`} onClick={() => selectFleet(f.id)}>
                  <span>{(Object.entries(f.units) as [Unit, number][]).map(([u, n]) => `${n} ${UNITS[u].name}`).join(", ")}</span>
                  <small>{f.transit ? `→ ${bodyName(f.transit.to)} ${dur(f.transit.arriveAt - clock.value)}` : `@ ${bodyName(f.at!)}`}</small>
                </button>
              </li>
            ))}
          </ul>
          <Tutorial />
          <button class="hud-title small" aria-expanded={all} onClick={() => setAll(!all)}>All bodies {all ? "▾" : "▸"}</button>
          {all && (
            <ul class="list tight">
              {Object.values(BODIES).filter((b) => b.id !== "antarctica").map((b) => (
                <li key={b.id}><button class="row" onClick={() => focusOn(b.id)}>{b.name}<small>{b.zone}</small></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}

function RegionRow({ r }: { r: Region }) {
  const on = selRegion.value === r.id;
  const total = mirror.value ? slotsOf(mirror.value, r.id) : 0;
  return (
    <li>
      <button class={`row ${on ? "on" : ""}`} aria-expanded={on} title={on ? "Fly there" : "Show slots and output"}
        onClick={() => (on ? focusOn(r.body, r.id) : picked(r.body, r.id))}>
        {REGIONS[r.id].name}<small>{r.buildings?.length ?? 0}/{total} ▣ ⚔{r.armies ?? 0}</small>
      </button>
      {on && <Drop r={r} total={total} />}
    </li>
  );
}

// Slots (built, under construction, empty) and the region's flows per day.
function Drop({ r, total }: { r: Region; total: number }) {
  const built = r.buildings ?? [];
  const building = (you.value?.queues[r.id] ?? []).filter((q) => q.item in BUILDINGS);
  const free = Math.max(0, total - built.length - building.length);
  const lines = eco.value?.lines.filter((l) => l.region === r.id) ?? [];
  const sum = (sign: number) => RESOURCES
    .map((res) => [res, lines.filter((l) => l.res === res && Math.sign(l.amt) === sign).reduce((a, l) => a + l.amt, 0)] as [Resource, number])
    .filter(([, v]) => Math.abs(v) > 1e-9);
  return (
    <div class="drop">
      <ul class="slots" aria-label="Building slots">
        {built.map((b, i) => (
          <li key={i} class="slot">{b.type === "powerPlant" ? `${cap(b.mode ?? "solar")} plant` : BUILDINGS[b.type].name}</li>
        ))}
        {building.map((q) => (
          <li key={q.startAt} class="slot busy">{BUILDINGS[q.item as Building].name}<small> {dur(q.finishAt - clock.value)}</small></li>
        ))}
        {Array.from({ length: free }, (_, i) => <li key={`e${i}`} class="slot empty">Empty slot</li>)}
      </ul>
      <Flows label="Output" items={sum(1)} />
      <Flows label="Upkeep" items={sum(-1)} />
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Flows({ label, items }: { label: string; items: [Resource, number][] }) {
  if (!items.length) return null;
  return (
    <p class="flows"><small>{label} /day</small>
      {items.map(([res, v]) => (
        <span key={res}><i class={`res res-${res}`} aria-hidden="true">{res}</i><span class={v < 0 ? "neg" : "pos"}>{perDay(v)}</span></span>
      ))}
    </p>
  );
}
