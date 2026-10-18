// game-design.md §9–11: trade, scoring, stages, players.
import type { Mod } from "./tech.ts";

export const TRADE = {
  envoyMultiplierPerScience: 0.15,
  earthDeliveryS: 30,
  offerTtlS: 300, // flagged: offer expiry isn't in game-design.md
};

export const SCORE = {
  perRegion: 5,
  perBody: 20,
  economyPer: 5, // 1 point per 5 production/min
  techPer: 6, // points per rung × rung number
  stageRanked: 3, // top N per stage in the hall of fame
};

export const SEASON = {
  stageS: 1200, // a stage is 20 min; the world itself never ends
  newsKept: 50,
};

// game-design.md §10: each stage from the second adds a modifier for all.
// Stages past the last repeat it with no new effect. First guesses.
export const STAGES: { name: string; desc: string; mods: Partial<Record<Mod, number>> }[] = [
  { name: "Founding", desc: "No modifier", mods: {} },
  { name: "Industrial Age", desc: "Mines and Refineries +25% output", mods: { mineOutput: 0.25, refineryOutput: 0.25 } },
  {
    name: "Space Age", desc: "Spaceports −25% cost, −50% build time; ships build 25% faster; warships +20% strength",
    mods: { spaceportCost: -0.25, spaceportTime: -0.5, shipTime: -0.25, warshipStrength: 0.2 },
  },
  { name: "Information Age", desc: "Research +25%; tech costs −10%", mods: { labOutput: 0.25, techCost: -0.1 } },
  { name: "Expansion Age", desc: "Launch energy −25%; colony Materiel upkeep −50%", mods: { launchCost: -0.25, colonyUpkeep: -0.5 } },
  { name: "Fusion Age", desc: "Power Plant output +25%", mods: { powerOutput: 0.25 } },
  { name: "Golden Age", desc: "No new modifier", mods: {} },
];

export const ALLIANCE = {
  maxMembers: 4, // game-design.md §9
};

export const EMPIRE = {
  nameMin: 3,
  nameMax: 24,
  colourClashDistance: 60, // flagged: RGB distance below this is a clash
  presets: [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
    "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080", "#e6beff",
    "#9a6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1",
    "#000075", "#a9a9a9", "#ffffff", "#ff6f61", "#6b5b95", "#88b04b",
  ],
};
