// game-design.md §7: fleets, the launch planner (energy, travel time, the
// launch-window gauge), and what else you can see in space.
import { useState } from "preact/hooks";
import { BODIES, MILITARY, REGIONS, UNITS, ZONE_LAUNCH_COST, type Unit } from "../../../rules/data/index.ts";
import { mods } from "../../../rules/economy.ts";
import { isLocal, launchEnergy, travelMs, windowPenalty } from "../../../rules/orbit.ts";
import type { Fleet } from "../../../rules/index.ts";
import { bodyName, dur, num, regionName } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, season, world } from "../store.ts";
import { BODY_ORDER } from "./BodyList.tsx";
import { Action, Chip, Progress, Section } from "./common.tsx";
import { select } from "./SystemMap.tsx";

const units = (u: Fleet["units"]) =>
  (Object.entries(u) as [Unit, number][]).map(([k, v]) => `${v} × ${UNITS[k].name}`).join(", ");

export function FleetsPanel() {
  const w = world.value!;
  const mine = w.fleets.filter((f) => f.owner === me.value);
  const others = w.fleets.filter((f) => f.owner !== me.value);
  const orbiting = mine.filter((f) => f.at);
  const [from, setFrom] = useState<string | null>(null);
  const source = orbiting.find((f) => f.at === from) ?? orbiting[0];
  return (
    <div class="panel">
      <h2>Fleets</h2>
      <Section title="Your fleets" hint={mine.length ? undefined : "No fleets yet: build a Spaceport, then ships, in one of your regions."}>
        <ul class="rows">
          {mine.map((f) => (
            <li key={f.id}>
              <span>
                <b>{units(f.units)}</b>
                {f.transit ? (
                  <>
                    <small>{bodyName(f.transit.from)} → {bodyName(f.transit.to)}, arrives in {dur(f.transit.arriveAt - clock.value)}</small>
                    <Progress start={f.transit.departAt} end={f.transit.arriveAt} label="Transit" />
                  </>
                ) : <small>In orbit at {bodyName(f.at!)}</small>}
              </span>
              <button class="quiet" onClick={() => select(f.at ?? f.transit!.to)}>{f.transit ? "Destination" : "Go to"}</button>
              {f.at && <button class="quiet" onClick={() => setFrom(f.at!)}>Plan launch</button>}
            </li>
          ))}
        </ul>
      </Section>
      {source && <Planner key={source.id} fleet={source} />}
      <Section title="Other fleets you can see" hint={others.length ? undefined : "None in sight. You see fleets on bodies where you hold a region, and every fleet of a nation you have an Envoy with."}>
        <ul class="rows">
          {others.map((f) => (
            <li key={f.id}>
              <span><Chip id={f.owner} /> <b>{units(f.units)}</b>
                <small>{f.transit ? `${bodyName(f.transit.from)} → ${bodyName(f.transit.to)}, ${dur(f.transit.arriveAt - clock.value)}` : `at ${bodyName(f.at!)}`}</small>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function nextWindow(from: string, to: string, start: number, m: ReturnType<typeof mods>, now: number): number | null {
  for (let d = 0; d < 1200; d++) {
    if (windowPenalty(from, to, now + d * 1000, start, m) < 1.05) return d * 1000;
  }
  return null;
}

function Planner({ fleet }: { fleet: Fleet }) {
  const s = mirror.value!;
  const sz = season.value!;
  const m = mods(s.nations[me.value!]);
  const from = fleet.at!;
  const [to, setTo] = useState(from === "earth" ? "luna" : "earth");
  const ships = (Object.entries(fleet.units) as [Unit, number][]).filter(([u]) => u !== "army");
  const [pick, setPick] = useState<Partial<Record<Unit, number>>>(Object.fromEntries(ships));
  const garrison = Object.values(s.regions).filter((r) => r.owner === me.value && REGIONS[r.id].body === from).reduce((a, r) => a + r.armies, 0);
  const transports = pick.troopTransport ?? 0;
  const [armies, setArmies] = useState(0);
  const chosen = Object.fromEntries(Object.entries(pick).filter(([, v]) => v! > 0)) as Partial<Record<Unit, number>>;
  const load = Math.min(armies, transports * MILITARY.transportCapacity, garrison);
  const cmdUnits = load ? { ...chosen, army: load } : chosen;
  const t = clock.value;
  const any = Object.keys(chosen).length > 0;
  const penalty = windowPenalty(from, to, t, sz.startedAt, m);
  const energy = any ? launchEnergy(from, to, chosen, t, sz.startedAt, m) : 0;
  const travel = any ? travelMs(from, to, chosen, m) : 0;
  const wait = isLocal(from, to) || penalty < 1.05 ? 0 : nextWindow(from, to, sz.startedAt, m, t);
  const k = Math.max(0, 2 + m.windowCoefficient);
  return (
    <Section title={`Launch from ${bodyName(from)}`} hint="Fleets in transit can't be redirected or intercepted. A fleet moves at its slowest ship.">
      <label>Destination
        <select value={to} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
          {BODY_ORDER.filter((b) => b !== from).map((b) => (
            <option key={b} value={b}>{BODIES[b].name} ({BODIES[b].zone}, {ZONE_LAUNCH_COST[BODIES[b].zone]} E/mass)</option>
          ))}
        </select>
      </label>
      <div class="unitpick">
        {ships.map(([u, have]) => (
          <label key={u}>{UNITS[u].name} (of {have})
            <input type="number" min={0} max={have} value={pick[u] ?? 0}
              onInput={(e) => setPick({ ...pick, [u]: Math.min(have, Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0))) })} />
          </label>
        ))}
        {transports > 0 && (
          <label>Armies to carry (garrison on {bodyName(from)}: {garrison}, room for {transports * MILITARY.transportCapacity})
            <input type="number" min={0} max={Math.min(garrison, transports * MILITARY.transportCapacity)} value={armies}
              onInput={(e) => setArmies(Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)))} />
          </label>
        )}
      </div>
      <dl class="facts">
        <dt>Launch window</dt>
        <dd>
          {!isLocal(from, to) && (
            <span class="gauge" title={`Penalty ×${penalty.toFixed(2)}: 1 is ideal, ${(1 + k).toFixed(1)} is worst`}>
              <i style={{ left: `${k ? ((penalty - 1) / k) * 100 : 0}%` }} />
            </span>
          )}
          {isLocal(from, to) ? " Local hop: no window" : ` ×${penalty.toFixed(2)} energy`}
          {wait ? ` · next good window in ${dur(wait)}` : wait === 0 && !isLocal(from, to) ? " · in the window now" : ""}
        </dd>
        <dt>Energy</dt><dd>{num(energy)} E</dd>
        <dt>Travel</dt><dd>{any ? `${dur(travel)}, arriving ${dur(travel)} from now` : "Pick some ships"}</dd>
      </dl>
      <Action cmd={{ type: "launch", from, to, units: cmdUnits }}>Launch to {bodyName(to)}</Action>
      {chosen.colonyShip && <p class="hint">On the way, open {bodyName(to)} on the map to claim a region on arrival.</p>}
      {load > 0 && <p class="hint">Carrying {load} Armies. Invade from {bodyName(to)} once you hold its orbit, at war with the owner.</p>}
      <p class="hint">Regions there: {Object.keys(REGIONS).filter((r) => REGIONS[r].body === to).map(regionName).join(", ")}</p>
    </Section>
  );
}
