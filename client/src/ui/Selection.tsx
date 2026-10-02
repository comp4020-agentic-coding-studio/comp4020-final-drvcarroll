// game-design.md §12: the selection panel. Whatever you clicked on the map,
// and everything you can do with it.
import { useState } from "preact/hooks";
import {
  ADJACENT, BODIES, BUILDINGS, MAP, MILITARY, POWER_MODES, REGIONS, RESOURCE_NAMES, RUNGS, UNITS, ZONE_LAUNCH_COST,
  type Building, type BuildingData, type Unit,
} from "../../../rules/data/index.ts";
import { mods, slotsOf } from "../../../rules/economy.ts";
import type { Fleet, Region } from "../../../rules/index.ts";
import { isLocal, launchEnergy, travelMs, windowPenalty } from "../../../rules/orbit.ts";
import { bodyName, dur, num, regionName } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, launchTo, me, season, selBody, selFleet, selRegion, world, you } from "../store.ts";
import { Action, Chip, Cost, Count, Progress } from "./common.tsx";
import { focusOn, selectFleet } from "./SceneHost.tsx";

const isEarth = (id: string) => BODIES[REGIONS[id].body].zone === "terrestrial";
const units = (u: Fleet["units"]) => (Object.entries(u) as [Unit, number][]).map(([k, v]) => `${v} ${UNITS[k].name}`).join(" · ");

export function Selection() {
  const f = world.value?.fleets.find((x) => x.id === selFleet.value);
  if (!f && !selRegion.value && !selBody.value) return null;
  return (
    <aside class="hud selection" aria-label="Selection">
      {f ? <FleetView f={f} /> : selRegion.value ? <RegionView id={selRegion.value} /> : <BodyView id={selBody.value!} />}
    </aside>
  );
}

function Header({ title, sub, onClose }: { title: string; sub?: string; onClose?: () => void }) {
  return (
    <header class="sel-head">
      <div><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
      {onClose && <button class="icon" aria-label="Close" onClick={onClose}>✕</button>}
    </header>
  );
}

function BodyView({ id }: { id: string }) {
  const w = world.value!;
  const b = BODIES[id];
  const regions = w.regions.filter((r) => r.body === id || (id === "earth" && r.body === "antarctica"));
  const fleets = w.fleets.filter((x) => x.at === id);
  return (
    <>
      <Header onClose={() => (selBody.value = null)} title={b.name} sub={`${b.zone[0].toUpperCase()}${b.zone.slice(1)} zone · ${regions.length} region${regions.length > 1 ? "s" : ""}${b.fusionBonus ? " · Fusion +50%" : ""}`} />
      <p class="hint">
        {b.zone === "terrestrial" ? "Unclaimed Earth regions are settled by marching an Army in." : "Claimed with a Colony Ship; each region costs 1 Materiel/min to hold."}
        {" "}Click a region on the globe, or below.
      </p>
      <ul class="list">
        {regions.map((r) => (
          <li key={r.id}>
            <button class="row" onClick={() => focusOn(r.body, r.id)}>
              <span>{REGIONS[r.id].name}</span>
              <Chip id={r.owner} />
              {r.armies !== undefined && r.owner && <small>⚔ {r.armies}</small>}
            </button>
          </li>
        ))}
      </ul>
      {fleets.length > 0 && (
        <>
          <h3>Fleets in orbit</h3>
          <ul class="list">
            {fleets.map((x) => (
              <li key={x.id}><button class="row" onClick={() => selectFleet(x.id)}><Chip id={x.owner} /><small>{units(x.units)}</small></button></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function RegionView({ id }: { id: string }) {
  const r = world.value!.regions.find((x) => x.id === id)!;
  const rd = REGIONS[id];
  const mine = r.owner === me.value;
  const [tab, setTab] = useState<"overview" | "build" | "military">("overview");
  return (
    <>
      <Header title={rd.name} sub={bodyName(rd.body)} onClose={() => (selRegion.value = null)} />
      <dl class="facts">
        <dt>Owner</dt><dd>{r.buildings !== undefined || r.owner ? <Chip id={r.owner} /> : <span class="muted">Unknown: no sensor here</span>}</dd>
        <dt>Yields</dt><dd>M ×{rd.m.toFixed(1)} · V ×{rd.v.toFixed(1)} · S ×{rd.s.toFixed(2)}</dd>
        {mine && <><dt>Slots</dt><dd>{r.buildings!.length + queuedBuildings(id)} / {slotsOf(mirror.value!, id)}</dd></>}
        {r.armies !== undefined && <><dt>Armies</dt><dd>{r.armies}</dd></>}
      </dl>
      {mine ? (
        <>
          <div class="seg" role="tablist">
            {(["overview", "build", "military"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          {tab === "overview" && <Overview r={r} />}
          {tab === "build" && <BuildList r={r} />}
          {tab === "military" && <Military r={r} />}
        </>
      ) : <Foreign r={r} />}
    </>
  );
}

const queuedBuildings = (id: string) => (you.value?.queues[id] ?? []).filter((q) => q.item in BUILDINGS).length;

function effect(b: Building, d: BuildingData, regionId: string): string {
  const r = REGIONS[regionId];
  const up = Object.entries(d.upkeep).map(([k, v]) => `${v} ${k}`).join(", ");
  const upkeep = up ? ` · upkeep ${up}/min` : "";
  if (b === "powerPlant") return `Solar ${num(MAP.solarBase * r.s, 1)} E/min here · Fission 15 · Fusion 25`;
  if (b === "spaceport") return `Builds ships; they launch from ${bodyName(r.body)}${upkeep}`;
  const o = d.output!;
  const amt = o.base * (o.yield ? r[o.yield] : 1);
  const input = d.input ? `${Object.entries(d.input).map(([k, v]) => `${v} ${k}`).join(" + ")} → ` : "";
  return `${input}${num(amt, 1)} ${RESOURCE_NAMES[o.res]}/min${upkeep}`;
}

function Overview({ r }: { r: Region }) {
  const q = you.value?.queues[r.id] ?? [];
  return (
    <>
      <h3>Buildings</h3>
      {r.buildings!.length === 0 && <p class="hint">Empty: open Build.</p>}
      <ul class="list">
        {[...r.buildings!].sort((a, b) => a.slot - b.slot).map((b) => (
          <li key={b.slot} class="item">
            <div><b>{BUILDINGS[b.type].name}</b><small>{effect(b.type, BUILDINGS[b.type], r.id)}</small></div>
            {b.type === "powerPlant" && (
              <div class="modes">
                {Object.keys(POWER_MODES).map((m) => (m === (b.mode ?? "solar")
                  ? <span key={m} class="pill on">{m}</span>
                  : <Action key={m} kind="quiet" cmd={{ type: "setMode", region: r.id, slot: b.slot, mode: m }}>{m}</Action>))}
              </div>
            )}
            <Action kind="danger" confirm={`Demolish this ${BUILDINGS[b.type].name}? You get half its cost back.`} cmd={{ type: "demolish", region: r.id, slot: b.slot }}>Demolish</Action>
          </li>
        ))}
      </ul>
      <h3>Queue</h3>
      {q.length === 0 && <p class="hint">Nothing queued.</p>}
      <ul class="list">
        {q.map((item, i) => (
          <li key={`${item.item}${item.startAt}`} class="item">
            <div>
              <b>{BUILDINGS[item.item as Building]?.name ?? UNITS[item.item as Unit]?.name ?? item.item}</b>
              <small>{clock.value < item.startAt ? `starts in ${dur(item.startAt - clock.value)}` : `${dur(item.finishAt - clock.value)} left`}</small>
              {clock.value >= item.startAt && <Progress start={item.startAt} end={item.finishAt} />}
            </div>
            <Action kind="quiet" cmd={{ type: "cancelBuild", region: r.id, index: i }}>Cancel</Action>
          </li>
        ))}
      </ul>
    </>
  );
}

function BuildList({ r }: { r: Region }) {
  return (
    <ul class="list">
      {(Object.entries(BUILDINGS) as [Building, BuildingData][]).map(([b, d]) => (
        <li key={b} class="item">
          <div><b>{d.name}</b> <Cost cost={d.cost} /> <small class="inline-small">· {d.timeS}s</small><small>{effect(b, d, r.id)}</small></div>
          <Action cmd={{ type: "build", region: r.id, building: b }}>Build</Action>
        </li>
      ))}
    </ul>
  );
}

function Military({ r }: { r: Region }) {
  const [armies, setArmies] = useState(1);
  const [march, setMarch] = useState(1);
  const [counts, setCounts] = useState<Partial<Record<Unit, number>>>({});
  const w = world.value!;
  const port = r.buildings!.some((b) => b.type === "spaceport");
  const n = Math.min(march, r.armies ?? 0);
  return (
    <>
      <h3>Armies <small>garrison {r.armies}</small></h3>
      <div class="inline">
        <Count value={armies} max={MILITARY.maxTrainCount} onInput={setArmies} label="Armies to train" />
        <Cost cost={{ Mt: UNITS.army.cost.Mt! * armies }} />
        <Action cmd={{ type: "train", region: r.id, count: armies }}>Train</Action>
      </div>
      {isEarth(r.id) && (r.armies ?? 0) > 0 && (
        <>
          <h3>March <small>30s to a neighbour</small></h3>
          <div class="inline"><Count value={n} max={r.armies!} onInput={setMarch} label="Armies to march" /> <small>of {r.armies}</small></div>
          <ul class="list">
            {(ADJACENT[r.id] ?? []).map((to) => {
              const t = w.regions.find((x) => x.id === to)!;
              return (
                <li key={to} class="item">
                  <div><b>{regionName(to)}</b> <Chip id={t.owner} /></div>
                  <Action kind={t.owner && t.owner !== me.value ? "danger" : "primary"} cmd={{ type: "march", from: r.id, to, count: n }}>
                    {!t.owner ? "Settle" : t.owner === me.value ? "Reinforce" : "Attack"}
                  </Action>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h3>Shipyard</h3>
      {!port ? <p class="hint">Build a Spaceport here to build ships.</p> : (
        <ul class="list">
          {(Object.keys(UNITS) as Unit[]).filter((u) => UNITS[u].atSpaceport).map((u) => {
            const d = UNITS[u];
            const c = counts[u] ?? 1;
            const role = d.strength ? `strength ${d.strength}` : u === "colonyShip" ? "claims an off-Earth region" : u === "freighter" ? "carries trade" : `carries ${MILITARY.transportCapacity} Armies`;
            return (
              <li key={u} class="item">
                <div><b>{d.name}</b> <Cost cost={Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v! * c]))} />
                  <small>{role} · {d.timeS}s{d.unlock ? ` · needs ${RUNGS[d.unlock].name}` : ""}</small></div>
                <Count value={c} max={MILITARY.maxBuildCount} onInput={(x) => setCounts({ ...counts, [u]: x })} label={`${d.name} count`} />
                <Action cmd={{ type: "buildShip", region: r.id, unit: u, count: c }}>Build</Action>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Foreign({ r }: { r: Region }) {
  const w = world.value!;
  const body = REGIONS[r.id].body;
  const mine = w.fleets.filter((f) => f.owner === me.value && (f.at === body || f.transit?.to === body));
  const colonisers = mine.filter((f) => f.units.colonyShip);
  const invaders = mine.filter((f) => f.at === body && f.units.army);
  const marchers = isEarth(r.id) ? w.regions.filter((x) => x.owner === me.value && x.armies && ADJACENT[x.id]?.includes(r.id)) : [];
  const none = !(colonisers.length && !r.owner && !isEarth(r.id)) && !(invaders.length && r.owner) && !marchers.length;
  return (
    <>
      {none && (
        <p class="hint">
          {isEarth(r.id) ? "March Armies in from a region you hold next door."
            : r.owner ? "Win the orbit, then land Armies from Troop Transports (needs an active war)."
            : "Send a Colony Ship here: select it, then click this body on the map."}
        </p>
      )}
      <ul class="list">
        {!isEarth(r.id) && !r.owner && colonisers.map((f) => (
          <li key={f.id} class="item">
            <div><b>Colony Ship</b><small>{f.transit ? `arrives in ${dur(f.transit.arriveAt - clock.value)}` : "in orbit"}</small></div>
            <Action cmd={{ type: "colonise", fleet: f.id, region: r.id }}>{f.transit ? "Claim on arrival" : "Colonise"}</Action>
          </li>
        ))}
        {r.owner && invaders.map((f) => (
          <li key={f.id} class="item"><div><b>{f.units.army} Armies aboard</b></div><Action kind="danger" cmd={{ type: "invade", fleet: f.id, region: r.id }}>Invade</Action></li>
        ))}
        {marchers.map((x) => (
          <li key={x.id} class="item">
            <div><b>From {regionName(x.id)}</b><small>{x.armies} Armies</small></div>
            <Action kind={r.owner ? "danger" : "primary"} cmd={{ type: "march", from: x.id, to: r.id, count: x.armies! }}>{r.owner ? "Attack" : "Settle"}</Action>
          </li>
        ))}
      </ul>
    </>
  );
}

function nextWindow(from: string, to: string, start: number, m: ReturnType<typeof mods>, now: number): number | null {
  for (let d = 0; d < 1200; d++) if (windowPenalty(from, to, now + d * 1000, start, m) < 1.05) return d * 1000;
  return null;
}

function FleetView({ f }: { f: Fleet }) {
  const mineFleet = f.owner === me.value;
  return (
    <>
      <Header title={mineFleet ? "Your fleet" : "Fleet"} sub={f.transit ? `${bodyName(f.transit.from)} → ${bodyName(f.transit.to)}` : `In orbit at ${bodyName(f.at!)}`} onClose={() => (selFleet.value = null)} />
      {!mineFleet && <p><Chip id={f.owner} /></p>}
      <p>{units(f.units)}</p>
      {f.transit && (
        <>
          <Progress start={f.transit.departAt} end={f.transit.arriveAt} label="Transit" />
          <p class="hint">Arrives in {dur(f.transit.arriveAt - clock.value)}. Fleets in transit can't turn back.</p>
        </>
      )}
      {mineFleet && f.at && <Planner key={f.id} f={f} />}
    </>
  );
}

function Planner({ f }: { f: Fleet }) {
  const s = mirror.value!;
  const sz = season.value!;
  const m = mods(s.nations[me.value!]);
  const from = f.at!;
  const to = launchTo.value;
  const ships = (Object.entries(f.units) as [Unit, number][]).filter(([u]) => u !== "army");
  const [pick, setPick] = useState<Partial<Record<Unit, number>>>(Object.fromEntries(ships));
  const [armies, setArmies] = useState(0);
  const garrison = Object.values(s.regions).filter((r) => r.owner === me.value && REGIONS[r.id].body === from).reduce((a, r) => a + r.armies, 0);
  const chosen = Object.fromEntries(Object.entries(pick).filter(([, v]) => v! > 0)) as Partial<Record<Unit, number>>;
  const room = (chosen.troopTransport ?? 0) * MILITARY.transportCapacity;
  const load = Math.min(armies, room, garrison);
  if (!to) {
    return (
      <div class="aim">
        <b>Click a destination on the map</b>
        <small>…or pick one: </small>
        <select aria-label="Destination" value="" onChange={(e) => (launchTo.value = (e.target as HTMLSelectElement).value)}>
          <option value="" disabled>Choose a body</option>
          {Object.values(BODIES).filter((b) => b.id !== from && b.id !== "antarctica").map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
    );
  }
  const t = clock.value;
  const any = Object.keys(chosen).length > 0;
  const penalty = windowPenalty(from, to, t, sz.startedAt, m);
  const local = isLocal(from, to);
  const k = Math.max(0, 2 + m.windowCoefficient);
  const wait = local || penalty < 1.05 ? 0 : nextWindow(from, to, sz.startedAt, m, t);
  const energy = any ? launchEnergy(from, to, chosen, t, sz.startedAt, m) : 0;
  const travel = any ? travelMs(from, to, chosen, m) : 0;
  const cargo = load ? { ...chosen, army: load } : chosen;
  return (
    <div class="planner">
      <h3>Launch to {bodyName(to)} <button class="icon" aria-label="Change destination" onClick={() => (launchTo.value = null)}>✕</button></h3>
      {ships.map(([u, have]) => (
        <label key={u} class="inline">{UNITS[u].name}
          <input class="count" type="number" min={0} max={have} value={pick[u] ?? 0}
            onInput={(e) => setPick({ ...pick, [u]: Math.min(have, Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0))) })} />
          <small>of {have}</small>
        </label>
      ))}
      {room > 0 && (
        <label class="inline">Armies aboard
          <input class="count" type="number" min={0} max={Math.min(room, garrison)} value={armies}
            onInput={(e) => setArmies(Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)))} />
          <small>garrison {garrison}, room {room}</small>
        </label>
      )}
      <dl class="facts">
        <dt>Window</dt>
        <dd>
          {local ? "Local hop: no window" : (
            <>
              <span class="gauge" title={`×${penalty.toFixed(2)} energy: 1 is ideal`}><i style={{ left: `${((penalty - 1) / (k || 1)) * 100}%` }} /></span>
              {` ×${penalty.toFixed(2)}`}{wait ? ` · best in ${dur(wait)}` : " · open now"}
            </>
          )}
        </dd>
        <dt>Energy</dt><dd>{num(energy)} E <small>({ZONE_LAUNCH_COST[BODIES[to].zone]}/mass)</small></dd>
        <dt>Travel</dt><dd>{any ? dur(travel) : "pick ships"}</dd>
      </dl>
      <Action cmd={{ type: "launch", from, to, units: cargo }}>Launch</Action>
      {chosen.colonyShip && <p class="hint">Then open {bodyName(to)} and pick a region to claim on arrival.</p>}
    </div>
  );
}
