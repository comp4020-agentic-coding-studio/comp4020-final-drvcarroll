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
  desc: string;
  mods: Partial<Record<Mod, number>>;
  unlocks?: string[];
}

const ladder = (id: Ladder, rungs: Omit<Rung, "id">[]): Rung[] =>
  rungs.map((r, i) => ({ id: `${id}.${i + 1}`, ...r }));

export const LADDERS: Record<Ladder, Rung[]> = {
  voidcraft: ladder("voidcraft", [
    { name: "Thrust Vectoring", desc: "Launch energy −15%", mods: { launchCost: -0.15 } },
    { name: "Ion Drives", desc: "Ship speed ×1.25; unlocks the Destroyer", mods: { speed: 0.25 }, unlocks: ["destroyer"] },
    { name: "Gravity Assists", desc: "Launch-window penalty −30%", mods: { windowCoefficient: -0.6 } },
    { name: "Nuclear Thermal Drive", desc: "Ship speed ×1.5; unlocks the Battleship", mods: { speed: 0.25 }, unlocks: ["battleship"] },
    { name: "Fusion Drive", desc: "Launch energy −30% in all; ship speed ×1.75", mods: { launchCost: -0.15, speed: 0.25 } },
    // "almost none": flagged as a coefficient of 0.2
    { name: "Torch Ships", desc: "Ship speed ×2; launch windows barely matter; unlocks the Dreadnought", mods: { speed: 0.25, windowCoefficient: -1.2 }, unlocks: ["dreadnought"] },
  ]),
  industry: ladder("industry", [
    { name: "Automated Mining", desc: "Mine output +25%", mods: { mineOutput: 0.25 } },
    { name: "Fractional Distillation", desc: "Refinery output +25%", mods: { refineryOutput: 0.25 } },
    { name: "Advanced Metallurgy", desc: "Foundry output +25%", mods: { foundryOutput: 0.25 } },
    { name: "Assembly Lines", desc: "Factory output +25%", mods: { factoryOutput: 0.25 } },
    { name: "Orbital Solar Arrays", desc: "Solar Power Plants +25%; unlocks Fission mode", mods: { solarOutput: 0.25 }, unlocks: ["fission"] },
    { name: "Nanofabrication", desc: "All production +20%; unlocks Fusion mode", mods: { allProduction: 0.2 }, unlocks: ["fusion"] },
  ]),
  science: ladder("science", [
    { name: "Computing", desc: "Lab output +25%", mods: { labOutput: 0.25 } },
    { name: "Signals Intelligence", desc: "Unlocks the Envoy (one slot)", mods: { envoySlots: 1 }, unlocks: ["envoy"] },
    { name: "Machine Learning", desc: "Research +25%", mods: { labOutput: 0.25 } },
    { name: "Quantum Computing", desc: "Tech costs −10%", mods: { techCost: -0.1 } },
    { name: "Planetary Science", desc: "Labs off Earth +25%", mods: { labOffEarth: 0.25 } },
    { name: "Artificial General Intelligence", desc: "Research +50%; tech costs −25% in all", mods: { labOutput: 0.5, techCost: -0.15 } },
  ]),
  society: ladder("society", [
    { name: "Closed-loop Life Support", desc: "Colony Materiel upkeep −25%", mods: { colonyUpkeep: -0.25 } },
    { name: "Pressurised Habitats", desc: "+1 building slot off Earth", mods: { slotsOffEarth: 1 } },
    { name: "Superconductors", desc: "Building Energy upkeep −20%", mods: { buildingUpkeepE: -0.2 } },
    { name: "Arcologies", desc: "+1 building slot on Earth", mods: { slotsEarth: 1 } },
    { name: "Signal Relays", desc: "+1 Envoy slot", mods: { envoySlots: 1 } },
    { name: "Post-scarcity Economy", desc: "No colony Materiel upkeep; +1 Envoy slot", mods: { colonyUpkeep: -0.75, envoySlots: 1 } },
  ]),
};

export const RUNGS: Record<string, Rung> = Object.fromEntries(
  Object.values(LADDERS).flat().map((r) => [r.id, r]),
);

export const TECH = {
  costs: [40, 80, 160, 320, 640, 1280], // R, by rung
  researchSPerRung: 15, // flagged: research time isn't in game-design.md
};
