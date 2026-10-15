// game-design.md §11 the Guide: an in-game wiki, one page per task. Every
// number is read from rules/data/, so the Guide can't drift from the rules.
import type { ComponentChildren } from "preact";
import {
  BUILDINGS, ECONOMY, MILITARY, RESOURCES, RESOURCE_NAMES, SCORE, SEASON, STAGES, TECH, TRADE, TRAVEL, UNITS, WAR,
  type Building, type Resource,
} from "../../../rules/data/index.ts";
import { drawer, guidePage } from "../store.ts";
import { Cost } from "./common.tsx";
import { BuildingIcon, ResIcon, UnitIcon } from "./icons.tsx";

export type Page = "resources" | "building" | "armies" | "research" | "colonising" | "ships" | "war" | "trade" | "winning";

export function openGuide(page: Page): void {
  guidePage.value = page;
  drawer.value = "guide";
}

const USES: Record<Resource, string> = {
  E: "building upkeep and every launch",
  M: "most buildings; Foundries turn it into Alloys",
  V: "Labs and Factories",
  A: "ships, Spaceports and Factories",
  R: "tech",
  Mt: "Armies, ships and colony upkeep",
};
const MAKER = Object.fromEntries((Object.entries(BUILDINGS) as [Building, (typeof BUILDINGS)[Building]][])
  .flatMap(([b, d]) => (d.output ? [[d.output.res, b]] : []))) as Record<Resource, Building>;
const min = (s: number) => `${s / 60} min`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const PAGES: Record<Page, { title: string; body: () => ComponentChildren }> = {
  resources: {
    title: "Resources",
    body: () => <>
      <p>Six resources, each made by one building. Hover an icon anywhere to see its name.</p>
      <ul class="guide-res">
        {RESOURCES.map((r) => (
          <li key={r}><ResIcon res={r} size={22} /><b>{RESOURCE_NAMES[r]}</b>
            <small>made by a {BUILDINGS[MAKER[r]].name}; used for {USES[r]}</small></li>
        ))}
      </ul>
      <ol>
        <li>The top bar shows each stock and its gain per day. Click the gain to see what makes and uses it.</li>
        <li>Stocks cap at {ECONOMY.capBase} plus {ECONOMY.capPerRegion} per region you hold.</li>
        <li>If a stock runs dry, a ⚠ shows the share everything that uses it still gets.</li>
      </ol>
    </>,
  },
  building: {
    title: "Building",
    body: () => <>
      <p>Each region has a fixed number of slots, shown as tiles when you open it.</p>
      <ol>
        <li>Click a region you hold (on the globe, or under Territory in the Empire menu).</li>
        <li>Click an empty <b>+</b> tile and pick a building. Each shows its cost and what it makes and uses here per day.</li>
        <li>Click a built tile to <b>Replace</b> it (one step, refund counted), <b>Upgrade</b> it, or <b>Demolish</b> it for {pct(ECONOMY.demolishRefund)} back.</li>
        <li>Power Plants upgrade from Solar to Fission and Fusion once Industry unlocks them. Other buildings are boosted by their Industry rung.</li>
      </ol>
      <ul class="guide-b">
        {(Object.keys(BUILDINGS) as Building[]).map((b) => (
          <li key={b}><BuildingIcon type={b} size={30} /><b>{BUILDINGS[b].name}</b><Cost cost={BUILDINGS[b].cost} /></li>
        ))}
      </ul>
    </>,
  },
  armies: {
    title: "Armies",
    body: () => <>
      <ol>
        <li>Open any region you hold. Under <b>Forces here</b>, set a count and <b>Train</b>: each <UnitIcon unit="army" /> costs <Cost cost={UNITS.army.cost} />.</li>
        <li>On Earth, open <b>March Armies to a neighbour</b>: Settle a free region, Reinforce your own, or Attack at war. A hop takes {TRAVEL.marchHopS}s.</li>
        <li>Armies holding a region they own fight at +{pct(MILITARY.garrisonBonus)}.</li>
        <li>Off Earth, Armies ride in Troop Transports ({MILITARY.transportCapacity} each). See War and invasion.</li>
      </ol>
    </>,
  },
  research: {
    title: "Research",
    body: () => <>
      <ol>
        <li>Labs make <ResIcon res="R" />. Open <b>Tech tree</b> in the Empire menu.</li>
        <li>Four ladders, six rungs each. Each rung needs the one before it; ladders are independent.</li>
        <li>Click <b>Research</b> on a ladder's next rung. One at a time; cancelling refunds it.</li>
        <li>Rungs cost {TECH.costs.join(", ")} <ResIcon res="R" />. Voidcraft: ships and launches. Industry: yields and Power Plant modes. Science: research and the Envoy. Society: upkeep and slots.</li>
      </ol>
    </>,
  },
  colonising: {
    title: "Colonising",
    body: () => <>
      <ol>
        <li>Build a <BuildingIcon type="spaceport" size={20} /> Spaceport in a slot.</li>
        <li>Click its tile and build a <UnitIcon unit="colonyShip" /> Colony Ship (<Cost cost={UNITS.colonyShip.cost} />).</li>
        <li>Send it to a body (see Sending ships).</li>
        <li>Open that body, click a free region and <b>Colonise</b>. You can do this while the ship is still on its way.</li>
        <li>Each off-Earth region costs {ECONOMY.colonyUpkeepMt} <ResIcon res="Mt" /> a minute; without it, its output halves.</li>
      </ol>
    </>,
  },
  ships: {
    title: "Sending ships",
    body: () => <>
      <ol>
        <li>Select a fleet: click its marker on the map, or pick it under Fleets in the Empire menu.</li>
        <li>Click the destination body on the map. The transfer arc draws with its cost in <ResIcon res="E" /> and the travel time.</li>
        <li>Watch the window gauge: green is the launch window. Off-window launches cost up to {1 + TRAVEL.windowCoefficient}× the energy.</li>
        <li>Pick which ships go and press <b>Launch</b>. Fleets in transit can't turn back.</li>
      </ol>
    </>,
  },
  war: {
    title: "War and invasion",
    body: () => <>
      <ol>
        <li>Click a rival's region (or open <b>Empires</b>) and <b>Declare war</b>. It's public and goes active {min(WAR.activationS)} later. New nations are protected for {min(WAR.protectionS)}.</li>
        <li>Fleets sharing an orbit with an enemy fight at once. The stronger side wins and keeps part of its fleet; no luck involved.</li>
        <li>Armies attacking a defended region start a battle, marked ⚔ on the map. Click the region to watch both sides drain; reinforcements join on arrival.</li>
        <li>Launch Troop Transports with Armies aboard. Once no enemy warships are left in orbit, open an enemy region there and <b>Invade</b>.</li>
        <li>Peace takes both sides: offer it in Empires.</li>
      </ol>
    </>,
  },
  trade: {
    title: "Trade and Envoys",
    body: () => <>
      <ol>
        <li>In <b>Empires</b>, press <b>Trade</b> on a nation: offer some of one resource for another, or gift it.</li>
        <li>Both sides are held on accept and land in {TRADE.earthDeliveryS}s between Earth capitals.</li>
        <li>The <b>Earth Exchange</b> always trades, at {ECONOMY.exchangeRate}:1.</li>
        <li>After Signals Intelligence, <b>Send Envoy</b> to see a nation's territory and fleets for {ECONOMY.envoyUpkeepE} <ResIcon res="E" /> a minute, and boost trades with it by {pct(TRADE.envoyMultiplierPerScience)} per Science rung.</li>
      </ol>
    </>,
  },
  winning: {
    title: "Stages",
    body: () => <>
      <ol>
        <li>Score has three parts: Territory ({SCORE.perRegion} per region, +{SCORE.perBody} per whole body), Economy (1 per {SCORE.economyPer} production a minute) and Tech (rung numbers added up).</li>
        <li>The world never ends. Every {min(SEASON.stageS)} a stage ends: whoever gained the most score during it wins, and the top {SCORE.stageRanked} go in the hall of fame.</li>
        <li>Each new stage adds a modifier for everyone, kept from then on: {STAGES.slice(1, -1).map((x) => `${x.name} (${x.desc})`).join("; ")}.</li>
        <li>Standings, gains and past winners are in Empires; the current stage is in the top bar.</li>
      </ol>
    </>,
  },
};

// game-design.md §12: imagery credits (CC BY needs them shown).
function Credits() {
  return (
    <footer class="credits" id="credits">
      Planet and Moon maps: <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>, CC BY 4.0, resized.
      Moon and dwarf-planet mosaics: <a href="https://astrogeology.usgs.gov/">USGS Astrogeology</a> (NASA Galileo, Voyager, Cassini, Dawn,
      Viking, New Horizons), public domain, resized and tinted. Ceres, Enceladus, Titania, Oberon: NASA/JPL via Wikimedia Commons, public
      domain. Deimos: Oleg-Pluton, <a href="https://commons.wikimedia.org/wiki/File:Deimos_color_map.jpg">CC BY-SA 3.0</a>. Borders:
      {" "}<a href="https://www.naturalearthdata.com/">Natural Earth</a>, public domain. Feature positions: USGS Gazetteer of Planetary Nomenclature.
    </footer>
  );
}

export function GuideLink({ page, children = "How?" }: { page: Page; children?: ComponentChildren }) {
  return <button class="link" onClick={() => openGuide(page)}>{children}</button>;
}

export function Guide() {
  const page = guidePage.value as Page;
  const p = PAGES[page] ?? PAGES.resources;
  return (
    <div class="guide">
      <nav aria-label="Guide pages">
        {(Object.keys(PAGES) as Page[]).map((k) => (
          <button key={k} class={k === page ? "on" : ""} aria-current={k === page ? "page" : undefined} onClick={() => (guidePage.value = k)}>{PAGES[k].title}</button>
        ))}
      </nav>
      <article>
        <h3>{p.title}</h3>
        {p.body()}
        <Credits />
      </article>
    </div>
  );
}
