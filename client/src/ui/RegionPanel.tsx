// The selected body and region: slots, buildings, queue, Armies, ships,
// marching, colonising and invading.
import { useState } from "preact/hooks";
import {
  ADJACENT, BODIES, BUILDINGS, MAP, MILITARY, POWER_MODES, REGIONS, RESOURCE_NAMES, RUNGS, UNITS,
  type Building, type BuildingData, type Unit,
} from "../../../rules/data/index.ts";
import { slotsOf } from "../../../rules/economy.ts";
import type { Region } from "../../../rules/index.ts";
import { dur, num, regionName } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, selBody, selRegion, world, you } from "../store.ts";
import { BODY_ORDER } from "./BodyList.tsx";
import { Action, Chip, Cost, Count, Progress, Section } from "./common.tsx";
import { select } from "./SystemMap.tsx";

const isEarth = (id: string) => BODIES[REGIONS[id].body].zone === "terrestrial";

function effect(b: Building, d: BuildingData, regionId: string): string {
  const r = REGIONS[regionId];
  const up = Object.entries(d.upkeep).map(([k, v]) => `${v} ${k}`).join(", ");
  const upkeep = up ? ` · upkeep ${up}/min` : "";
  if (b === "powerPlant") return `Energy: Solar ${num(MAP.solarBase * r.s, 1)}/min here · Fission 15 · Fusion 25${upkeep}`;
  if (b === "spaceport") return `Builds ships here; they launch from ${BODIES[r.body].name}${upkeep}`;
  const o = d.output!;
  const amt = o.base * (o.yield ? r[o.yield] : 1);
  const input = d.input ? `${Object.entries(d.input).map(([k, v]) => `${v} ${k}`).join(" + ")} → ` : "";
  return `${input}${num(amt, 1)} ${RESOURCE_NAMES[o.res]}/min${upkeep}`;
}

export function RegionPanel() {
  const w = world.value!;
  const body = BODIES[selBody.value];
  const regions = w.regions.filter((r) => r.body === body.id)
    .sort((a, b) => Number(b.owner === me.value) - Number(a.owner === me.value));
  const preferred = regions.find((r) => r.owner === me.value) ?? regions[0];
  const region = regions.find((r) => r.id === selRegion.value) ?? preferred;
  return (
    <div class="panel">
      <div class="panelhead">
        <h2>{body.name}</h2>
        <label class="hint">Body{" "}
          <select value={body.id} onChange={(e) => select((e.target as HTMLSelectElement).value)}>
            {BODY_ORDER.map((b) => <option key={b} value={b}>{BODIES[b].name}</option>)}
          </select>
        </label>
      </div>
      <p class="hint">
        {body.zone === "terrestrial" ? "Unclaimed Earth regions are settled by marching an Army in." : "Off-Earth regions are claimed with a Colony Ship and cost 1 Materiel/min each to hold."}
        {" "}{body.fusionBonus ? "Fusion Power Plants run +50% here." : ""}
      </p>
      <div class="tabs regions" role="tablist">
        {regions.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === region.id} class={r.id === region.id ? "sel" : ""} onClick={() => (selRegion.value = r.id)}>
            {REGIONS[r.id].name} {r.owner === me.value ? "★" : ""}
          </button>
        ))}
      </div>
      <RegionDetail r={region} />
    </div>
  );
}

function RegionDetail({ r }: { r: Region }) {
  const rd = REGIONS[r.id];
  const mine = r.owner === me.value;
  const sensed = r.buildings !== undefined;
  return (
    <>
      <Section title={rd.name}>
        <dl class="facts">
          <dt>Owner</dt><dd>{sensed || r.owner ? <Chip id={r.owner} /> : <span class="muted">No sensor here: you can't see who holds it</span>}</dd>
          <dt>Yields</dt><dd>Metals ×{rd.m.toFixed(1)} · Volatiles ×{rd.v.toFixed(1)} · Solar ×{rd.s.toFixed(2)}</dd>
          <dt>Slots</dt><dd>{mine ? `${(r.buildings?.length ?? 0) + queuedBuildings(r.id)} of ${slotsOf(mirror.value!, r.id)} used` : r.slots}</dd>
          {r.armies !== undefined && <><dt>Armies</dt><dd>{r.armies}</dd></>}
        </dl>
        {sensed && !mine && r.buildings!.length > 0 && (
          <p>Buildings: {r.buildings!.map((b) => BUILDINGS[b.type].name).join(", ")}</p>
        )}
      </Section>
      {mine ? <Owned r={r} /> : <Foreign r={r} />}
    </>
  );
}

const queuedBuildings = (id: string) => (you.value?.queues[id] ?? []).filter((q) => q.item in BUILDINGS).length;

function Owned({ r }: { r: Region }) {
  const q = you.value?.queues[r.id] ?? [];
  const [armies, setArmies] = useState(1);
  const hasPort = r.buildings!.some((b) => b.type === "spaceport");
  return (
    <>
      <Section title="Buildings">
        {r.buildings!.length === 0 && <p class="hint">Nothing built yet. Pick something below.</p>}
        <ul class="rows">
          {[...r.buildings!].sort((a, b) => a.slot - b.slot).map((b) => (
            <li key={b.slot}>
              <span><b>{BUILDINGS[b.type].name}</b><small>{effect(b.type, BUILDINGS[b.type], r.id)}</small></span>
              {b.type === "powerPlant" && (
                <span class="modes" role="group" aria-label="Power mode">
                  {Object.keys(POWER_MODES).map((m) => (m === (b.mode ?? "solar")
                    ? <button key={m} class="sel" disabled>{m}</button>
                    : <Action key={m} kind="quiet" cmd={{ type: "setMode", region: r.id, slot: b.slot, mode: m }}>{m}</Action>))}
                </span>
              )}
              <Action kind="danger" confirm={`Demolish this ${BUILDINGS[b.type].name}? You get 50% of its cost back.`} cmd={{ type: "demolish", region: r.id, slot: b.slot }}>Demolish</Action>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Build queue" hint={q.length ? undefined : "Empty. One queue per region: buildings, Armies and ships wait their turn."}>
        <ol class="rows">
          {q.map((item, i) => (
            <li key={`${item.item}${item.startAt}`}>
              <span>
                <b>{BUILDINGS[item.item as Building]?.name ?? UNITS[item.item as Unit]?.name ?? item.item}</b>
                <small>{clock.value < item.startAt ? `starts in ${dur(item.startAt - clock.value)}` : `${dur(item.finishAt - clock.value)} left`}</small>
                {clock.value >= item.startAt && <Progress start={item.startAt} end={item.finishAt} />}
              </span>
              <Action kind="quiet" cmd={{ type: "cancelBuild", region: r.id, index: i }}>Cancel (full refund)</Action>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Build">
        <ul class="rows">
          {(Object.entries(BUILDINGS) as [Building, BuildingData][]).map(([b, d]) => (
            <li key={b}>
              <span><b>{d.name}</b> <Cost cost={d.cost} /> · {d.timeS}s<small>{effect(b, d, r.id)}</small></span>
              <Action cmd={{ type: "build", region: r.id, building: b }}>Build</Action>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Armies" hint={`Garrison ${r.armies}. Armies hold ground (+50% defending), settle Earth by marching, and invade from Troop Transports. Upkeep 0.5 Energy/min each.`}>
        <div class="inline">
          <Count value={armies} max={MILITARY.maxTrainCount} onInput={setArmies} label="Armies to train" />
          <Cost cost={{ Mt: UNITS.army.cost.Mt! * armies }} />
          <Action cmd={{ type: "train", region: r.id, count: armies }}>Train</Action>
        </div>
        {isEarth(r.id) && <March r={r} />}
      </Section>

      {hasPort ? <Shipyard r={r} /> : (
        <Section title="Ships"><p class="hint">Build a Spaceport here to build ships. Colony Ships claim off-Earth regions.</p></Section>
      )}
    </>
  );
}

function March({ r }: { r: Region }) {
  const w = world.value!;
  const [count, setCount] = useState(1);
  if (!r.armies) return <p class="hint">No Armies here to march.</p>;
  const n = Math.min(count, r.armies);
  return (
    <>
      <h4>March (30s per hop)</h4>
      <div class="inline"><Count value={n} max={r.armies} onInput={setCount} label="Armies to march" /> of {r.armies}</div>
      <ul class="rows">
        {(ADJACENT[r.id] ?? []).map((to) => {
          const target = w.regions.find((x) => x.id === to)!;
          return (
            <li key={to}>
              <span><b>{regionName(to)}</b> <Chip id={target.owner} />{target.armies !== undefined && target.owner && <small>garrison {target.armies}</small>}</span>
              <Action kind={target.owner && target.owner !== me.value ? "danger" : "primary"} cmd={{ type: "march", from: r.id, to, count: n }}>
                {!target.owner ? "Settle" : target.owner === me.value ? "Reinforce" : "Attack"}
              </Action>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Shipyard({ r }: { r: Region }) {
  const [counts, setCounts] = useState<Partial<Record<Unit, number>>>({});
  const ships = (Object.keys(UNITS) as Unit[]).filter((u) => UNITS[u].atSpaceport);
  return (
    <Section title="Shipyard" hint={`New ships join your fleet in orbit at ${BODIES[REGIONS[r.id].body].name}. Launch them from the Fleets tab.`}>
      <ul class="rows">
        {ships.map((u) => {
          const d = UNITS[u];
          const c = counts[u] ?? 1;
          const role = d.strength ? `strength ${d.strength}` : u === "colonyShip" ? "claims an off-Earth region" : u === "freighter" ? "carries trade off Earth" : `carries ${MILITARY.transportCapacity} Armies`;
          return (
            <li key={u}>
              <span>
                <b>{d.name}</b> <Cost cost={Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v! * c]))} /> · {d.timeS}s
                <small>{role} · mass {d.mass} · speed {d.speed}{d.unlock ? ` · needs ${RUNGS[d.unlock].name}` : ""}</small>
              </span>
              <Count value={c} max={MILITARY.maxBuildCount} onInput={(n) => setCounts({ ...counts, [u]: n })} label={`${d.name} count`} />
              <Action cmd={{ type: "buildShip", region: r.id, unit: u, count: c }}>Build</Action>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Foreign({ r }: { r: Region }) {
  const w = world.value!;
  const body = REGIONS[r.id].body;
  const myFleets = w.fleets.filter((f) => f.owner === me.value && (f.at === body || f.transit?.to === body));
  const colonisers = myFleets.filter((f) => f.units.colonyShip);
  const invaders = myFleets.filter((f) => f.at === body && f.units.army);
  const marchers = isEarth(r.id) ? w.regions.filter((x) => x.owner === me.value && x.armies && ADJACENT[x.id]?.includes(r.id)) : [];
  const nothing = !colonisers.length && !invaders.length && !marchers.length;
  return (
    <Section title="Take it">
      {nothing && (
        <p class="hint">
          {isEarth(r.id)
            ? "March Armies in from a region you hold next door."
            : r.owner ? "Win orbital superiority, then land Armies from Troop Transports (needs a war)." : "Send a Colony Ship here from a Spaceport (Fleets tab), then colonise."}
        </p>
      )}
      <ul class="rows">
        {!isEarth(r.id) && !r.owner && colonisers.map((f) => (
          <li key={f.id}>
            <span>Colony Ship {f.transit ? `arriving in ${dur(f.transit.arriveAt - clock.value)} (claims on arrival)` : "in orbit"}</span>
            <Action cmd={{ type: "colonise", fleet: f.id, region: r.id }}>{f.transit ? "Claim on arrival" : "Colonise"}</Action>
          </li>
        ))}
        {r.owner && invaders.map((f) => (
          <li key={f.id}><span>{f.units.army} Armies aboard</span><Action kind="danger" cmd={{ type: "invade", fleet: f.id, region: r.id }}>Invade</Action></li>
        ))}
        {marchers.map((x) => (
          <li key={x.id}>
            <span>From {regionName(x.id)} ({x.armies} Armies)</span>
            <Action kind={r.owner ? "danger" : "primary"} cmd={{ type: "march", from: x.id, to: r.id, count: x.armies! }}>{r.owner ? `Attack with ${x.armies}` : `Settle with ${x.armies}`}</Action>
          </li>
        ))}
      </ul>
    </Section>
  );
}
