// game-design.md §5, §6: resources, buildings, upkeep, starting kit.

export const RESOURCES = ["E", "M", "V", "A", "R", "Mt"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Goods = Partial<Record<Resource, number>>;

export type Building = "powerPlant" | "mine" | "refinery" | "foundry" | "lab" | "factory" | "spaceport";
export type PowerMode = "solar" | "fission" | "fusion";

export interface BuildingData {
  name: string;
  cost: Goods;
  timeS: number;
  // per minute; `yield` scales by the region's multiplier of that resource
  output?: { res: Resource; base: number; yield?: "m" | "v" };
  input?: Goods;
  upkeep: Goods;
}

export const BUILDINGS: Record<Building, BuildingData> = {
  powerPlant: { name: "Power Plant", cost: { M: 40 }, timeS: 20, output: { res: "E", base: 10 }, upkeep: {} },
  mine: { name: "Mine", cost: { M: 30 }, timeS: 20, output: { res: "M", base: 6, yield: "m" }, upkeep: { E: 2 } },
  refinery: {
    name: "Refinery", cost: { M: 30 }, timeS: 20, output: { res: "V", base: 4, yield: "v" }, upkeep: { E: 3 },
  },
  foundry: { name: "Foundry", cost: { M: 50 }, timeS: 30, output: { res: "A", base: 2 }, input: { M: 4 }, upkeep: { E: 4 } },
  lab: { name: "Lab", cost: { M: 40, V: 10 }, timeS: 30, output: { res: "R", base: 5 }, upkeep: { E: 3, Mt: 0.5 } },
  factory: {
    name: "Factory", cost: { M: 60, V: 10 }, timeS: 30, output: { res: "Mt", base: 3 }, input: { A: 2, V: 1 },
    upkeep: { E: 5 },
  },
  spaceport: { name: "Spaceport", cost: { M: 60, A: 20 }, timeS: 45, upkeep: { E: 2 } },
};

// Power Plant output per mode, E/min. Solar is base × region S.
export const POWER_MODES: Record<PowerMode, { flat?: number; unlock?: string }> = {
  solar: {},
  fission: { flat: 15, unlock: "industry.5" },
  fusion: { flat: 25, unlock: "industry.6" },
};

export const ECONOMY = {
  capBase: 1000,
  capPerRegion: 500,
  demolishRefund: 0.5,
  colonyUpkeepMt: 1, // per off-Earth region, per minute
  colonyShortfallOutput: 0.5,
  fusionBodyBonus: 0.5,
  boostMultiplier: 2,
  startKit: {
    buildings: ["powerPlant", "mine", "refinery", "lab"] as Building[],
    armies: 2,
    stocks: { E: 500, M: 200, V: 100, A: 30, R: 30, Mt: 50 } as Record<Resource, number>,
  },
  exchangeRate: 3, // Earth Exchange: give 3, get 1
  envoyUpkeepE: 3, // per minute; flagged: not given in game-design.md
};
