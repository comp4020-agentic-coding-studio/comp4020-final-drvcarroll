// game-design.md §7: units, travel, launch energy, combat, war rules.
import type { Goods } from "./economy.ts";
import type { Zone } from "./map.ts";

export type Unit =
  | "army" | "colonyShip" | "freighter" | "troopTransport"
  | "corvette" | "destroyer" | "battleship" | "dreadnought";

export interface UnitData {
  name: string;
  cost: Goods;
  timeS: number;
  strength: number; // 0 for non-combat
  mass: number; // 0: carried as cargo
  speed: number;
  upkeepE: number;
  unlock?: string;
  atSpaceport: boolean;
}

export const UNITS: Record<Unit, UnitData> = {
  army: { name: "Army", cost: { Mt: 10 }, timeS: 15, strength: 10, mass: 0, speed: 1, upkeepE: 0.5, atSpaceport: false },
  colonyShip: {
    name: "Colony Ship", cost: { A: 40, Mt: 10 }, timeS: 45, strength: 0, mass: 2, speed: 1, upkeepE: 0, atSpaceport: true,
  },
  freighter: {
    name: "Freighter", cost: { A: 30, Mt: 10 }, timeS: 30, strength: 0, mass: 1, speed: 1, upkeepE: 0.5, atSpaceport: true,
  },
  troopTransport: {
    name: "Troop Transport", cost: { A: 40, Mt: 15 }, timeS: 30, strength: 0, mass: 2, speed: 1, upkeepE: 0.5,
    atSpaceport: true,
  },
  corvette: {
    name: "Corvette", cost: { A: 20, Mt: 10 }, timeS: 20, strength: 10, mass: 1, speed: 1.25, upkeepE: 1, atSpaceport: true,
  },
  destroyer: {
    name: "Destroyer", cost: { A: 40, Mt: 40 }, timeS: 40, strength: 30, mass: 2, speed: 1, upkeepE: 2,
    unlock: "voidcraft.2", atSpaceport: true,
  },
  battleship: {
    name: "Battleship", cost: { A: 80, Mt: 80 }, timeS: 80, strength: 90, mass: 4, speed: 0.85, upkeepE: 4,
    unlock: "voidcraft.4", atSpaceport: true,
  },
  dreadnought: {
    name: "Dreadnought", cost: { A: 160, Mt: 160 }, timeS: 150, strength: 270, mass: 8, speed: 0.65, upkeepE: 8,
    unlock: "voidcraft.6", atSpaceport: true,
  },
};

// Energy per unit mass by destination zone, at Voidcraft 0.
export const ZONE_LAUNCH_COST: Record<Zone, number> = {
  terrestrial: 10, // flagged: not in the doc's table; matches Cislunar
  cislunar: 10,
  inner: 25,
  belt: 40,
  jovian: 60,
  saturnian: 80,
  outer: 120,
};

export const TRAVEL = {
  hohmannDaysPerAU: 182.6, // t = 182.6 × ((a₁ + a₂) / 2)^1.5
  localS: 30, // Earth↔Luna, moon↔moon of one planet
  marchHopS: 30,
  windowCoefficient: 2, // penalty = 1 + k × |Δθ| / π
};

export const MILITARY = {
  transportCapacity: 4, // Armies per Troop Transport
  freighterCapacity: 500,
  garrisonBonus: 0.5,
  maxTrainCount: 20,
  maxBuildCount: 20,
};

export const WAR = {
  activationS: 60,
  protectionS: 300,
  boostS: 300,
};
