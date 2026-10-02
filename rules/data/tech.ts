// game-design.md §8: four ladders × six rungs. Effects stack additively.

export type Ladder = "voidcraft" | "industry" | "science" | "society";

export const MODS = [
  "launchCost", "speed", "windowCoefficient",
  "mineOutput", "refineryOutput", "foundryOutput", "factoryOutput", "solarOutput",
  "allProduction", "labOutput", "labOffEarth", "techCost",
  "colonyUpkeep", "buildingUpkeepE", "slotsOffEarth", "slotsEarth", "envoySlots",
] as const;
export type Mod = (typeof MODS)[number];

export interface Rung {
  id: string; // "voidcraft.2"
  name: string;
  mods: Partial<Record<Mod, number>>;
  unlocks?: string[];
}

const ladder = (id: Ladder, rungs: Omit<Rung, "id">[]): Rung[] =>
  rungs.map((r, i) => ({ id: `${id}.${i + 1}`, ...r }));

export const LADDERS: Record<Ladder, Rung[]> = {
  voidcraft: ladder("voidcraft", [
    { name: "Thrust Vectoring", mods: { launchCost: -0.15 } },
    { name: "Ion Drives", mods: { speed: 0.25 }, unlocks: ["destroyer"] },
    { name: "Gravity Assists", mods: { windowCoefficient: -0.6 } },
    { name: "Nuclear Thermal Drive", mods: { speed: 0.25 }, unlocks: ["battleship"] },
    { name: "Fusion Drive", mods: { launchCost: -0.15, speed: 0.25 } },
    // "almost none": flagged as a coefficient of 0.2
    { name: "Torch Ships", mods: { speed: 0.25, windowCoefficient: -1.2 }, unlocks: ["dreadnought"] },
  ]),
  industry: ladder("industry", [
    { name: "Automated Mining", mods: { mineOutput: 0.25 } },
    { name: "Fractional Distillation", mods: { refineryOutput: 0.25 } },
    { name: "Advanced Metallurgy", mods: { foundryOutput: 0.25 } },
    { name: "Assembly Lines", mods: { factoryOutput: 0.25 } },
    { name: "Orbital Solar Arrays", mods: { solarOutput: 0.25 }, unlocks: ["fission"] },
    { name: "Nanofabrication", mods: { allProduction: 0.2 }, unlocks: ["fusion"] },
  ]),
  science: ladder("science", [
    { name: "Computing", mods: { labOutput: 0.25 } },
    { name: "Signals Intelligence", mods: { envoySlots: 1 }, unlocks: ["envoy"] },
    { name: "Machine Learning", mods: { labOutput: 0.25 } },
    { name: "Quantum Computing", mods: { techCost: -0.1 } },
    { name: "Planetary Science", mods: { labOffEarth: 0.25 } },
    { name: "Artificial General Intelligence", mods: { labOutput: 0.5, techCost: -0.15 } },
  ]),
  society: ladder("society", [
    { name: "Closed-loop Life Support", mods: { colonyUpkeep: -0.25 } },
    { name: "Pressurised Habitats", mods: { slotsOffEarth: 1 } },
    { name: "Superconductors", mods: { buildingUpkeepE: -0.2 } },
    { name: "Arcologies", mods: { slotsEarth: 1 } },
    { name: "Signal Relays", mods: { envoySlots: 1 } },
    { name: "Post-scarcity Economy", mods: { colonyUpkeep: -0.75, envoySlots: 1 } },
  ]),
};

export const RUNGS: Record<string, Rung> = Object.fromEntries(
  Object.values(LADDERS).flat().map((r) => [r.id, r]),
);

export const TECH = {
  costs: [40, 80, 160, 320, 640, 1280], // R, by rung
  researchSPerRung: 15, // flagged: research time isn't in game-design.md
};
