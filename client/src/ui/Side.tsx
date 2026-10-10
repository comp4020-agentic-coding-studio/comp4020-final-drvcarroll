// game-design.md §11: the tutorial checklist, and the news ticker.
import { useState } from "preact/hooks";
import { dur } from "../format.ts";
import { clock, drawer, me, world, you } from "../store.ts";
import { focusOn, selectFleet } from "./SceneHost.tsx";

interface Goal { title: string; how: string; done: boolean; go: () => void }

function goals(): Goal[] {
  const w = world.value!, y = you.value!;
  const mineRegions = w.regions.filter((r) => r.owner === me.value);
  const queued = Object.values(y.queues).flat().map((q) => q.item);
  const built = mineRegions.flatMap((r) => r.buildings ?? []).map((b) => b.type);
  const lunaFleet = w.fleets.some((f) => f.owner === me.value && f.units.colonyShip && (f.transit?.to === "luna" || f.at === "luna"));
  const luna = mineRegions.some((r) => r.body === "luna");
  const toEarth = () => focusOn("earth");
  const colony = w.fleets.find((f) => f.owner === me.value && f.units.colonyShip);
  return [
    { title: "Build a Mine", how: "Your capital is full: open it, march an Army to a free neighbour under Forces here, then build a Mine in the new region's empty slot.", done: built.filter((b) => b === "mine").length > 1 || queued.includes("mine"), go: toEarth },
    { title: "Research Thrust Vectoring", how: "Open Tech tree in the Empire menu and research Voidcraft 1 once you have 40 Research.", done: y.techs.includes("voidcraft.1") || y.research?.tech === "voidcraft.1", go: () => (drawer.value = "tech") },
    { title: "Build a Spaceport", how: "Click an empty slot (or replace a building) and pick Spaceport.", done: built.includes("spaceport") || queued.includes("spaceport"), go: toEarth },
    { title: "Launch a Colony Ship to Luna", how: "Click your Spaceport's tile and build a Colony Ship, select it, then click Luna.", done: lunaFleet || luna, go: () => (colony ? selectFleet(colony.id) : toEarth()) },
    { title: "Claim a Luna region", how: "Click a free region on Luna and colonise it (or claim it while your ship is on the way).", done: luna, go: () => focusOn("luna") },
  ];
}

const HIDE_KEY = "grow.tutorial.hidden";
const read = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };

export function Tutorial() {
  const [hidden, setHidden] = useState(read);
  const gs = goals();
  const next = gs.find((g) => !g.done);
  const hide = (v: boolean) => { setHidden(v); try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* private mode */ } };
  if (hidden || !next) {
    return next ? <button class="quiet small" onClick={() => hide(false)}>Show goals</button> : null;
  }
  return (
    <section class="card tutorial" aria-label="Goals">
      <h3>Goals <button class="quiet small" onClick={() => hide(true)} aria-label="Hide goals">Hide</button></h3>
      <ol class="plain">
        {gs.map((g) => <li key={g.title} class={g.done ? "done" : g === next ? "next" : ""}>{g.done ? "✓ " : ""}{g.title}</li>)}
      </ol>
      <p class="hint"><b>Next:</b> {next.how} <button class="quiet small" onClick={next.go}>Show me</button></p>
    </section>
  );
}

// A slim ticker with the latest event; expands to the recent history.
export function News() {
  const w = world.value!;
  const t = clock.value;
  const [open, setOpen] = useState(false);
  const items = [...w.news].reverse().slice(0, 25);
  if (!items.length) return null;
  return (
    <section class={`hud ticker ${open ? "open" : ""}`} aria-label="News">
      {open && (
        <ul class="plain">
          {items.map((n, i) => <li key={`${n.at}${i}`}><small>{dur(t - n.at)} ago</small> {n.text}</li>)}
        </ul>
      )}
      <button class="latest" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>News</b> <span aria-live="polite">{items[0].text}</span> <small>{dur(t - items[0].at)} ago {open ? "▾" : "▴"}</small>
      </button>
    </section>
  );
}

