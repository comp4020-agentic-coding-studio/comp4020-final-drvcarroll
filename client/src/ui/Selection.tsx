// game-design.md §12: the selection panel. Whatever you clicked on the map,
// and everything you can do with it.
import { useState } from "preact/hooks";
import {
  ADJACENT, BODIES, BUILDINGS, MAP, MILITARY, POWER_MODES, REGIONS, RESOURCE_NAMES, RUNGS, UNITS, ZONE_LAUNCH_COST,
  type Building, type BuildingData, type Mod, type PowerMode, type Resource, type Unit,
} from "../../../rules/data/index.ts";
import { buildingCost, buildingMs, mods, shipMs, slotsOf } from "../../../rules/economy.ts";
import { battleCounts } from "../../../rules/war.ts";
import type { Battle, Command, Fleet, QueueEntry, Region } from "../../../rules/index.ts";
import { isLocal, launchEnergy, travelMs, windowPenalty } from "../../../rules/orbit.ts";
import { bodyName, dur, num, regionName, toDay } from "../format.ts";
import { eco, mirror } from "../mirror.ts";
import { clock, launchTo, me, nations, season, selBody, selFleet, selRegion, stage, stockNow, world, you } from "../store.ts";
import { Action, Chip, Cost, Count, Progress } from "./common.tsx";
import { Amt, BattleIcon, BuildingIcon, ResIcon, SolarIcon, UnitIcon, Units } from "./icons.tsx";
import { GuideLink } from "./Guide.tsx";
import { focusOn, selectFleet } from "./SceneHost.tsx";

const isEarth = (id: string) => BODIES[REGIONS[id].body].zone === "terrestrial";

export function Selection() {
  const f = world.value?.fleets.find((x) => x.id === selFleet.value);
  if (!f && !selRegion.value && !selBody.value) return null;
  return (
    <aside class="hud selection" aria-label="Selection">
      {f ? <FleetView f={f} /> : selRegion.value ? <RegionView id={selRegion.value} /> : <BodyView id={selBody.value!} />}
    </aside>
  );
}

// A designation strip over the title: the console's read-out of the target.
function Header({ title, sub, desig, onClose }: { title: string; sub?: string; desig: string; onClose?: () => void }) {
  return (
    <header class="sel-head">
      <div><span class="desig">{desig}</span><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
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
      <Header onClose={() => (selBody.value = null)} desig={`Sector // ${b.zone}`} title={b.name} sub={`${b.zone[0].toUpperCase()}${b.zone.slice(1)} zone · ${regions.length} region${regions.length > 1 ? "s" : ""}${b.fusionBonus ? " · Fusion +50%" : ""}`} />
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
              {r.armies !== undefined && r.owner && <span class="amt"><UnitIcon unit="army" /> {r.armies}</span>}
            </button>
          </li>
        ))}
      </ul>
      {fleets.length > 0 && (
        <>
          <h3>Fleets in orbit</h3>
          <ul class="list">
            {fleets.map((x) => (
              <li key={x.id}><button class="row" onClick={() => selectFleet(x.id)}><Chip id={x.owner} /><Units units={x.units} /></button></li>
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
  const sensed = r.buildings !== undefined;
  const battle = world.value!.battles.find((b) => b.id === id);
  return (
    <>
      {battle && <BattleView b={battle} />}
      <Header desig={`Sector // ${bodyName(rd.body)} · ${mine ? "held" : r.owner ? "foreign" : sensed ? "unclaimed" : "no sensor"}`} title={rd.name} sub={bodyName(rd.body)} onClose={() => (selRegion.value = null)} />
      <p class="yields">
        {sensed || r.owner ? <Chip id={r.owner} /> : <span class="muted">No sensor here</span>}
        <span class="goods">
          <span class="amt"><ResIcon res="M" />×{rd.m.toFixed(1)}</span>
          <span class="amt"><ResIcon res="V" />×{rd.v.toFixed(1)}</span>
          <span class="amt"><SolarIcon />×{rd.s.toFixed(2)}</span>
        </span>
      </p>
      {sensed && <SlotGrid key={id} r={r} mine={mine} />}
      <Forces r={r} mine={mine} />
      {!mine && <Foreign r={r} />}
    </>
  );
}

interface Tile { slot: number; built?: NonNullable<Region["buildings"]>[number]; queued?: QueueEntry & { index: number } }

// Built slots, then queued buildings into their pinned slot or the next free.
function tiles(r: Region, total: number, queue: QueueEntry[]): Tile[] {
  const ts: Tile[] = Array.from({ length: total }, (_, slot) => ({ slot }));
  for (const b of r.buildings ?? []) if (ts[b.slot]) ts[b.slot].built = b;
  const pinned = new Set(queue.flatMap((q) => q.slot ?? []));
  queue.forEach((q, index) => {
    if (!(q.item in BUILDINGS)) return;
    const t = q.slot !== undefined ? ts[q.slot] : ts.find((x) => !x.built && !x.queued && !pinned.has(x.slot));
    if (t) t.queued = { ...q, index };
  });
  return ts;
}

// Per-day flows of one built slot: the region's lines for its type, shared.
function slotFlows(r: Region, type: Building): [Resource, number][] {
  const n = r.buildings!.filter((b) => b.type === type).length;
  const by = new Map<Resource, number>();
  for (const l of eco.value?.lines ?? []) {
    if (l.region === r.id && l.source === type) by.set(l.res, (by.get(l.res) ?? 0) + toDay(l.amt) / n);
  }
  return [...by].filter(([, v]) => Math.abs(v) > 1e-9).sort((a, b) => b[1] - a[1]);
}

// What a new building would make and use here per day, before tech.
function nominal(b: Building, regionId: string): [Resource, number][] {
  const r = REGIONS[regionId], d = BUILDINGS[b];
  const out: [Resource, number][] = [];
  if (d.output) out.push([d.output.res, b === "powerPlant" ? MAP.solarBase * r.s : d.output.base * (d.output.yield ? r[d.output.yield] : 1)]);
  for (const [k, v] of Object.entries({ ...d.input }) as [Resource, number][]) out.push([k, -v]);
  for (const [k, v] of Object.entries(d.upkeep) as [Resource, number][]) out.push([k, -v]);
  return out.map(([k, v]) => [k, toDay(v)]);
}

function Flows({ items }: { items: [Resource, number][] }) {
  return <span class="tile-flows">{items.map(([res, v]) => <Amt key={res} res={res} v={Number(v.toFixed(2))} sign />)}</span>;
}

// The tech rung that boosts each building: its "upgrade" (game-design.md §12).
const BOOST: Partial<Record<Building, Mod>> = {
  mine: "mineOutput", refinery: "refineryOutput", foundry: "foundryOutput", factory: "factoryOutput", lab: "labOutput", powerPlant: "solarOutput",
};
const boostRung = (b: Building) => Object.values(RUNGS).find((x) => BOOST[b] && x.mods[BOOST[b]!]);

function boosted(b: Building, mode?: string): boolean {
  const n = mirror.value?.nations[me.value!];
  if (!n || b === "spaceport" || (b === "powerPlant" && (mode ?? "solar") !== "solar")) return false;
  const m = mods(n, stage.value);
  return m[BOOST[b]!] > 0 || m.allProduction > 0;
}

function SlotGrid({ r, mine }: { r: Region; mine: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const total = mine ? slotsOf(mirror.value!, r.id) : r.slots;
  const ts = tiles(r, total, mine ? you.value?.queues[r.id] ?? [] : []);
  const sel = open === null ? undefined : ts[open];
  return (
    <section aria-label="Building slots">
      <ul class="tiles">
        {ts.map((t) => {
          const b = t.built, q = t.queued;
          const label = b ? BUILDINGS[b.type].name : q ? `${BUILDINGS[q.item as Building].name}, building` : "Empty slot";
          return (
            <li key={t.slot}>
              <button class={`tile ${b ? "built" : q ? "busy" : "empty"} ${open === t.slot ? "on" : ""}`} disabled={!mine}
                aria-label={mine ? `${label}: ${b ? "replace, upgrade or demolish" : q ? "cancel" : "build"}` : label}
                aria-expanded={open === t.slot} onClick={() => setOpen(open === t.slot ? null : t.slot)}>
                {b ? <BuildingIcon type={b.type} mode={b.mode} boosted={boosted(b.type, b.mode)} />
                  : q ? <><BuildingIcon type={q.item as Building} /><Ring q={q} /></>
                  : <span class="plus" aria-hidden="true">+</span>}
              </button>
              {b && <Flows items={slotFlows(r, b.type)} />}
              {q && <small class="tile-flows">{clock.value < q.startAt ? "queued" : dur(q.finishAt - clock.value)}</small>}
            </li>
          );
        })}
      </ul>
      {mine && sel && <TileMenu key={sel.slot} r={r} t={sel} onDone={() => setOpen(null)} />}
    </section>
  );
}

function Ring({ q }: { q: QueueEntry }) {
  const f = Math.min(1, Math.max(0, (clock.value - q.startAt) / Math.max(1, q.finishAt - q.startAt)));
  return (
    <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="16" pathLength="100" stroke-dasharray={`${f * 100} 100`} />
    </svg>
  );
}

function TileMenu({ r, t, onDone }: { r: Region; t: Tile; onDone: () => void }) {
  const [replacing, setReplacing] = useState(false);
  if (t.queued) {
    const name = BUILDINGS[t.queued.item as Building].name;
    return (
      <div class="tile-menu">
        <h3>{name} <small>{clock.value < t.queued.startAt ? `starts in ${dur(t.queued.startAt - clock.value)}` : `${dur(t.queued.finishAt - clock.value)} left`}</small></h3>
        <Action kind="quiet" cmd={{ type: "cancelBuild", region: r.id, index: t.queued.index }}>Cancel (full refund)</Action>
      </div>
    );
  }
  const b = t.built;
  if (!b) {
    return <div class="tile-menu"><h3>Build in this slot</h3><Picker r={r} cmd={(building) => ({ type: "build", region: r.id, building })} /></div>;
  }
  const d = BUILDINGS[b.type];
  const rung = boostRung(b.type);
  const held = rung && you.value?.techs.includes(rung.id);
  const upgrade = b.type === "spaceport" ? "Spaceports don't upgrade: Voidcraft tech unlocks better ships."
    : held ? `Upgraded: ${rung!.name} boosts every ${d.name}.` : `Upgrade by researching ${rung!.name}: it boosts every ${d.name}.`;
  return (
    <div class="tile-menu">
      <h3>{b.type === "powerPlant" ? `${cap(b.mode ?? "solar")} Power Plant` : d.name}</h3>
      <div class="menu-actions">
        <span class="action">
          <button class={`quiet ${replacing ? "on" : ""}`} aria-expanded={replacing} onClick={() => setReplacing(!replacing)}>Replace</button>
        </span>
        {b.type !== "powerPlant" && <span class="action"><button class="quiet" disabled title={upgrade}>Upgrade</button></span>}
        <Action kind="danger" confirm={`Demolish this ${d.name}? You get half its cost back.`} cmd={{ type: "demolish", region: r.id, slot: b.slot }}>Demolish</Action>
      </div>
      {b.type !== "powerPlant" && <p class="hint">{upgrade}</p>}
      {b.type === "powerPlant" && (
        <div class="modes" aria-label="Upgrade">
          {(Object.keys(POWER_MODES) as PowerMode[]).map((m) => (m === (b.mode ?? "solar")
            ? <span key={m} class="pill on"><BuildingIcon type="powerPlant" mode={m} size={22} /> {cap(m)}</span>
            : <Action key={m} kind="quiet" cmd={{ type: "setMode", region: r.id, slot: b.slot, mode: m }}><BuildingIcon type="powerPlant" mode={m} size={22} /> {cap(m)}</Action>))}
        </div>
      )}
      {replacing && d.output && onlyMaker(d.output.res) && (
        <p class="hint warn">Removes your only {d.name}: {RESOURCE_NAMES[d.output.res]} 0/min.</p>
      )}
      {replacing && <Picker r={r} skip={b.type} cmd={(building) => ({ type: "replace", region: r.id, slot: b.slot, building })} after={onDone} />}
      {b.type === "spaceport" && <Shipyard r={r} />}
    </div>
  );
}

// True when one building is the nation's whole supply of a resource (P2).
function onlyMaker(res: Resource): boolean {
  const n = Object.values(mirror.value!.regions).filter((g) => g.owner === me.value)
    .flatMap((g) => g.buildings).filter((x) => BUILDINGS[x.type].output?.res === res).length;
  return n === 1;
}

// Every building with what it costs and would make and use here.
function Picker({ r, cmd, skip, after }: { r: Region; cmd: (b: Building) => Command; skip?: Building; after?: () => void }) {
  const m = mods(mirror.value!.nations[me.value!], stage.value);
  return (
    <ul class="list picker">
      {(Object.entries(BUILDINGS) as [Building, BuildingData][]).filter(([b]) => b !== skip).map(([b, d]) => (
        <li key={b} class="item">
          <BuildingIcon type={b} size={32} />
          <div><b>{d.name}</b> <small class="inline-small">{dur(buildingMs(b, m))}</small>
            <small>{b === "spaceport" ? <>Builds ships and Armies <Flows items={nominal(b, r.id)} /></> : <Flows items={nominal(b, r.id)} />}<span class="muted"> /day</span></small>
            <Cost cost={buildingCost(b, m)} /></div>
          <span onClick={after}><Action cmd={cmd(b)}>{skip ? "Replace" : "Build"}</Action></span>
        </li>
      ))}
    </ul>
  );
}

function Shipyard({ r }: { r: Region }) {
  const [counts, setCounts] = useState<Partial<Record<Unit, number>>>({});
  const m = mods(mirror.value!.nations[me.value!], stage.value);
  return (
    <>
      <h3>Shipyard</h3>
      <ul class="list picker">
        {(Object.keys(UNITS) as Unit[]).map((u) => {
          const d = UNITS[u];
          const c = counts[u] ?? 1;
          const role = !d.atSpaceport ? "ground forces, any region" : d.strength ? `strength ${d.strength}` : u === "colonyShip" ? "claims an off-Earth region" : u === "freighter" ? "carries trade" : `carries ${MILITARY.transportCapacity} Armies`;
          const cmd: Command = d.atSpaceport ? { type: "buildShip", region: r.id, unit: u, count: c } : { type: "train", region: r.id, count: c };
          return (
            <li key={u} class="item">
              <UnitIcon unit={u} size={26} />
              <div><b>{d.name}</b> <small class="inline-small">{dur(shipMs(u, m))}</small>
                <small>{role}{d.unlock ? ` · needs ${RUNGS[d.unlock].name}` : ""}</small>
                <Cost cost={Object.fromEntries(Object.entries(d.cost).map(([k, v]) => [k, v! * c]))} /></div>
              <Count value={c} max={d.atSpaceport ? MILITARY.maxBuildCount : MILITARY.maxTrainCount} onInput={(x) => setCounts({ ...counts, [u]: x })} label={`${d.name} count`} />
              <Action cmd={cmd}>{d.atSpaceport ? "Build" : "Train"}</Action>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const atWar = (id: string) => {
  const t = clock.value;
  return world.value!.wars.some((x) => ((x.a === id && x.b === me.value) || (x.b === id && x.a === me.value)) && x.activeAt <= t);
};

// game-design.md §12: who is here, who is coming, and the last fight.
function Forces({ r, mine }: { r: Region; mine: boolean }) {
  const w = world.value!, t = clock.value;
  const body = REGIONS[r.id].body;
  const [train, setTrain] = useState(1);
  const [march, setMarch] = useState(1);
  const orbit = w.fleets.filter((f) => f.at === body);
  const inbound = w.fleets.filter((f) => f.transit?.to === body && f.owner !== me.value);
  const hostile = [...orbit, ...inbound].some((f) => atWar(f.owner));
  const training = mine ? (you.value?.queues[r.id] ?? []).map((q, index) => ({ ...q, index })).filter((q) => q.item in UNITS) : [];
  const battle = [...w.news].reverse().find((n) => (n.kind === "battle" || n.kind === "conquest") && (n.refs.includes(r.id) || n.refs.includes(body)));
  const n = Math.min(march, r.armies ?? 0);
  return (
    <section class={`forces ${hostile ? "alert" : ""}`} aria-label="Forces here">
      <h3>Forces here {hostile && <small class="neg">hostile forces</small>}</h3>
      <ul class="list">
        {inbound.map((f) => (
          <li key={f.id} class={`item ${atWar(f.owner) ? "hostile" : ""}`}>
            <div><Chip id={f.owner} /> <Units units={f.units} /><small>inbound, arrives in {dur(f.transit!.arriveAt - t)}</small></div>
          </li>
        ))}
        {orbit.map((f) => (
          <li key={f.id} class={`item ${atWar(f.owner) ? "hostile" : ""}`}>
            <button class="row" onClick={() => selectFleet(f.id)}><Chip id={f.owner} /><Units units={f.units} /><small>in orbit</small></button>
          </li>
        ))}
        {r.armies !== undefined && (
          <li class="item">
            <div><span class="amt"><UnitIcon unit="army" size={18} /> {r.armies}</span> <small class="inline-small">{r.armies === 1 ? "Army" : "Armies"} garrisoned{mine ? `, +${MILITARY.garrisonBonus * 100}% holding` : ""}</small></div>
            {mine && (
              <div class="inline">
                <Count value={train} max={MILITARY.maxTrainCount} onInput={setTrain} label="Armies to train" />
                <Cost cost={{ Mt: UNITS.army.cost.Mt! * train }} />
                <Action cmd={{ type: "train", region: r.id, count: train }}>Train</Action>
              </div>
            )}
          </li>
        )}
        {training.map((q) => (
          <li key={`${q.item}${q.startAt}`} class="item">
            <UnitIcon unit={q.item as Unit} size={18} />
            <div><b>{UNITS[q.item as Unit].name}</b><small>{t < q.startAt ? `starts in ${dur(q.startAt - t)}` : `${dur(q.finishAt - t)} left`}</small>
              {t >= q.startAt && <Progress start={q.startAt} end={q.finishAt} />}</div>
            <Action kind="quiet" cmd={{ type: "cancelBuild", region: r.id, index: q.index }}>Cancel</Action>
          </li>
        ))}
        {battle && <li class="item battle"><div><small>{dur(t - battle.at)} ago</small> {battle.text}</div></li>}
      </ul>
      {mine && isEarth(r.id) && (r.armies ?? 0) > 0 && (
        <details class="march">
          <summary>March Armies to a neighbour <small>30s</small></summary>
          <div class="inline"><Count value={n} max={r.armies!} onInput={setMarch} label="Armies to march" /> <small>of {r.armies}</small></div>
          <ul class="list">
            {(ADJACENT[r.id] ?? []).map((to) => {
              const x = w.regions.find((y) => y.id === to)!;
              return (
                <li key={to} class="item">
                  <div><b>{regionName(to)}</b> <Chip id={x.owner} /></div>
                  <Action kind={x.owner && x.owner !== me.value ? "danger" : "primary"} cmd={{ type: "march", from: r.id, to, count: n }}>
                    {!x.owner ? "Settle" : x.owner === me.value ? "Reinforce" : "Attack"}
                  </Action>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// game-design.md §12: a ground battle, both sides draining live.
function BattleView({ b }: { b: Battle }) {
  const t = clock.value;
  const [atk, def] = battleCounts(b, t);
  const top = Math.max(1, b.atk, b.def);
  const side = (who: string, n: number, role: string) => (
    <li class="side">
      <Chip id={who} /><small>{role}</small>
      <div class="bar" role="meter" aria-label={`${role} Armies`} aria-valuenow={Math.round(n)} aria-valuemin={0} aria-valuemax={top}>
        <div style={{ width: `${(n / top) * 100}%`, background: nations.value[who]?.primary }} />
      </div>
      <span class="amt"><UnitIcon unit="army" size={16} /> {n.toFixed(1)}</span>
    </li>
  );
  return (
    <section class="battle-now" aria-label="Battle" aria-live="polite">
      <h3><BattleIcon size={18} /> Battle <small>{dur(b.endsAt - t)} left</small></h3>
      <ul class="list">{side(b.attacker, atk, "Attacker")}{side(b.defender, def, "Defender")}</ul>
    </section>
  );
}

// At peace with the owner: declare war here, Attack shown until it's active.
function WarAction({ owner }: { owner: string }) {
  const w = world.value!.wars.find((x) => (x.a === owner && x.b === me.value) || (x.b === owner && x.a === me.value));
  if (w && w.activeAt <= clock.value) return null;
  return (
    <p class="war-here">
      {w ? <small class="warn">War goes active in {dur(w.activeAt - clock.value)}</small>
        : <Action kind="danger" confirm={`Declare war on ${nations.value[owner]?.name}? It's public.`} cmd={{ type: "declareWar", nation: owner }}>Declare war</Action>}
    </p>
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
      {r.owner && <WarAction owner={r.owner} />}
      {none && (
        <p class="hint">
          {isEarth(r.id) ? "March Armies in from a region you hold next door."
            : r.owner ? "Win the orbit, then land Armies from Troop Transports (needs an active war)."
            : "Send a Colony Ship here: select it, then click this body on the map."}
          {" "}<GuideLink page={isEarth(r.id) ? "armies" : r.owner ? "war" : "colonising"} />
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
      <Header desig={`Fleet // ${f.id}${f.transit ? " · in transit" : ""}`} title={mineFleet ? "Your fleet" : "Fleet"} sub={f.transit ? `${bodyName(f.transit.from)} → ${bodyName(f.transit.to)}` : `In orbit at ${bodyName(f.at!)}`} onClose={() => (selFleet.value = null)} />
      {!mineFleet && <p><Chip id={f.owner} /></p>}
      <p><Units units={f.units} /></p>
      {f.transit && (
        <>
          <Progress start={f.transit.departAt} end={f.transit.arriveAt} label="Transit" />
          <p class="hint">Arrives in {dur(f.transit.arriveAt - clock.value)}. Fleets in transit can't turn back.</p>
        </>
      )}
      {mineFleet && f.at && f.units.colonyShip && <ColoniseList f={f} body={f.at} />}
      {mineFleet && f.at && <Planner key={f.id} f={f} />}
    </>
  );
}

// game-design.md §12: a Colony Ship in orbit lists where it can settle.
function ColoniseList({ f, body }: { f: Fleet; body: string }) {
  const free = Object.values(mirror.value!.regions).filter((r) => REGIONS[r.id].body === body && !r.owner && !isEarth(r.id));
  if (!free.length) return <p class="hint">No free region on {bodyName(body)}. Launch to another body.</p>;
  return (
    <ul class="list" aria-label={`Free regions on ${bodyName(body)}`}>
      {free.map((r) => (
        <li key={r.id} class="item"><b>{regionName(r.id)}</b><Action cmd={{ type: "colonise", fleet: f.id, region: r.id }}>Colonise</Action></li>
      ))}
    </ul>
  );
}

function Planner({ f }: { f: Fleet }) {
  const s = mirror.value!;
  const sz = season.value!;
  const m = mods(s.nations[me.value!], stage.value);
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
        <dt>Energy</dt><dd><Amt res="E" v={Math.round(energy)} short={energy > stockNow("E")} /> <small>({ZONE_LAUNCH_COST[BODIES[to].zone]} per mass)</small></dd>
        <dt>Travel</dt><dd>{any ? dur(travel) : "pick ships"}</dd>
      </dl>
      <Action cmd={{ type: "launch", from, to, units: cargo }}>Launch</Action>
      {chosen.colonyShip && <p class="hint">Then open {bodyName(to)} and pick a region to claim on arrival.</p>}
    </div>
  );
}
