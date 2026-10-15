// game-design.md §12 empire menu: Territory, Military, Research. A region
// drops down to its slots and output; a second click flies there.
// Doubles as the keyboard route into the map (goals.md P7).
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { BODIES, BUILDINGS, LADDERS, REGIONS, RESOURCES, RUNGS, type Building, type Resource } from "../../../rules/data/index.ts";
import { techCost } from "../../../rules/commands.ts";
import { battleCounts } from "../../../rules/war.ts";
import { slotsOf } from "../../../rules/economy.ts";
import type { Battle, Region } from "../../../rules/index.ts";
import { bodyName, dur, perDay, regionName } from "../format.ts";
import { eco, mirror } from "../mirror.ts";
import { clock, drawer, me, selFleet, selRegion, stage, world, you } from "../store.ts";
import { Action, Progress } from "./common.tsx";
import { Amt, BattleIcon, BuildingIcon, ResIcon, UnitIcon, Units } from "./icons.tsx";
import { GuideLink } from "./Guide.tsx";
import { focusOn, picked, selectFleet } from "./SceneHost.tsx";
import { Tutorial } from "./Side.tsx";

export function EmpireBar() {
  const w = world.value!, y = you.value!, t = clock.value;
  const phone = innerWidth <= 720;
  const [open, setOpen] = useState(!phone);
  const mine = w.regions.filter((r) => r.owner === me.value);
  const byBody: Record<string, Region[]> = {};
  for (const r of mine) (byBody[r.body] ??= []).push(r);
  const fleets = w.fleets.filter((f) => f.owner === me.value);
  const garrisons = mine.filter((r) => r.armies);
  const marches = w.marches.filter((m) => m.owner === me.value);
  const battles = w.battles.filter((b) => b.attacker === me.value || b.defender === me.value);
  const armies = garrisons.reduce((a, r) => a + r.armies!, 0) + marches.reduce((a, m) => a + m.count, 0);
  const research = y.research ? `${RUNGS[y.research.tech].name} ${dur(y.research.finishAt - t)}` : `${y.techs.length}/${Object.keys(RUNGS).length}`;
  return (
    <nav class={`hud empire ${open ? "" : "closed"}`} aria-label="Your empire">
      {phone && <button class="hud-title" aria-expanded={open} onClick={() => setOpen(!open)}>Empire {open ? "▾" : "▸"}</button>}
      {open && (
        <div class="scroll">
          <Sec label="Territory" count={String(mine.length)} start>
            <ul class="list tight">
              {Object.entries(byBody).map(([body, rs]) => (
                <li key={body}>
                  <button class="row body" onClick={() => focusOn(body)}><b>{bodyName(body)}</b><small>{rs.length}</small></button>
                  <ul class="list tight sub">{rs.map((r) => <RegionRow key={r.id} r={r} />)}</ul>
                </li>
              ))}
            </ul>
            <AllBodies />
          </Sec>
          <Sec label="Military" count={`${battles.length ? "in battle · " : ""}${armies} · ${fleets.length}`}>
            <h4>Armies <small>{armies}</small></h4>
            {armies === 0 && !battles.length && <p class="hint">None. Train them in any region you hold. <GuideLink page="armies" /></p>}
            <ul class="list tight">
              {battles.map((b) => <BattleRow key={b.id} b={b} />)}
              {garrisons.map((r) => (
                <li key={r.id}>
                  <button class={`row ${selRegion.value === r.id ? "on" : ""}`} onClick={() => focusOn(r.body, r.id)}>
                    {regionName(r.id)}<span class="amt">{r.armies}<UnitIcon unit="army" /></span>
                  </button>
                </li>
              ))}
              {marches.map((m) => (
                <li key={m.id}>
                  <button class="row" onClick={() => focusOn(REGIONS[m.to].body, m.to)}>
                    <span>→ {regionName(m.to)}</span><small>{m.count}<UnitIcon unit="army" /> {dur(m.arriveAt - t)}</small>
                  </button>
                </li>
              ))}
            </ul>
            <h4>Fleets <small>{fleets.length}</small></h4>
            {fleets.length === 0 && <p class="hint">None yet: build one at a Spaceport. <GuideLink page="colonising" /></p>}
            <ul class="list tight">
              {fleets.map((f) => (
                <li key={f.id}>
                  <button class={`row ${selFleet.value === f.id ? "on" : ""}`} onClick={() => selectFleet(f.id)}>
                    <Units units={f.units} />
                    <small>{f.transit ? `→ ${bodyName(f.transit.to)} ${dur(f.transit.arriveAt - t)}` : `@ ${bodyName(f.at!)}`}</small>
                  </button>
                </li>
              ))}
            </ul>
          </Sec>
          <Sec label="Research" count={research}>
            {y.research && <Progress start={y.research.startAt} end={y.research.finishAt} label="Research progress" />}
            <NextRungs />
          </Sec>
          <Tutorial />
        </div>
      )}
    </nav>
  );
}

function BattleRow({ b }: { b: Battle }) {
  const [atk, def] = battleCounts(b, clock.value);
  const [us, them] = b.attacker === me.value ? [atk, def] : [def, atk];
  return (
    <li>
      <button class="row battle" onClick={() => focusOn(REGIONS[b.id].body, b.id)}>
        <span><BattleIcon /> {regionName(b.id)}</span><small>{us.toFixed(0)} vs {them.toFixed(0)}</small>
      </button>
    </li>
  );
}

// Each ladder's next rung, and the full tree as an overlay.
function NextRungs() {
  const y = you.value!, n = mirror.value?.nations[me.value!];
  const tech = drawer.value === "tech";
  return (
    <>
      <ul class="list tight">
        {Object.values(LADDERS).map((rungs) => {
          const next = rungs.find((r) => !y.techs.includes(r.id));
          if (!next || y.research?.tech === next.id) return null;
          return (
            <li key={next.id} class="item">
              <div><b>{next.name}</b><small>{next.desc}</small></div>
              <Action kind="quiet" cmd={{ type: "research", tech: next.id }}><Amt res="R" v={n ? techCost(n, next.id, stage.value) : 0} /></Action>
            </li>
          );
        })}
      </ul>
      <button class={`link ${tech ? "on" : ""}`} aria-pressed={tech} onClick={() => (drawer.value = tech ? null : "tech")}>Tech tree</button>
    </>
  );
}

function AllBodies() {
  const [all, setAll] = useState(false);
  return (
    <>
      <button class="hud-title small" aria-expanded={all} onClick={() => setAll(!all)}>All bodies {all ? "▾" : "▸"}</button>
      {all && (
        <ul class="list tight">
          {Object.values(BODIES).filter((b) => b.id !== "antarctica").map((b) => (
            <li key={b.id}><button class="row" onClick={() => focusOn(b.id)}>{b.name}<small>{b.zone}</small></button></li>
          ))}
        </ul>
      )}
    </>
  );
}

function Sec({ label, count, start, children }: { label: string; count: string; start?: boolean; children: ComponentChildren }) {
  const [open, setOpen] = useState(!!start);
  return (
    <section class="sec">
      <button class="sec-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{label}</span><small>{count} {open ? "▾" : "▸"}</small>
      </button>
      {open && children}
    </section>
  );
}

function RegionRow({ r }: { r: Region }) {
  const on = selRegion.value === r.id;
  const total = mirror.value ? slotsOf(mirror.value, r.id) : 0;
  return (
    <li>
      <button class={`row ${on ? "on" : ""}`} aria-expanded={on} title={on ? "Fly there" : "Show slots and output"}
        onClick={() => (on ? focusOn(r.body, r.id) : picked(r.body, r.id))}>
        {REGIONS[r.id].name}<small>{r.buildings?.length ?? 0}/{total}</small>
      </button>
      {on && <Drop r={r} total={total} />}
    </li>
  );
}

// Slots as small icons (built, under construction, empty), and flows per day.
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
        {[...built].sort((a, b) => a.slot - b.slot).map((b) => <li key={b.slot} class="slot"><BuildingIcon type={b.type} mode={b.mode} size={24} /></li>)}
        {building.map((q) => <li key={q.startAt} class="slot busy"><BuildingIcon type={q.item as Building} size={24} /></li>)}
        {Array.from({ length: free }, (_, i) => <li key={`e${i}`} class="slot empty"><span class="sr">Empty slot</span></li>)}
      </ul>
      <Flows label="Output" items={sum(1)} />
      <Flows label="Upkeep" items={sum(-1)} />
    </div>
  );
}

function Flows({ label, items }: { label: string; items: [Resource, number][] }) {
  if (!items.length) return null;
  return (
    <p class="flows"><small>{label} /day</small>
      {items.map(([res, v]) => (
        <span key={res}><ResIcon res={res} size={14} /><span class={v < 0 ? "neg" : "pos"}>{perDay(v)}</span></span>
      ))}
    </p>
  );
}
