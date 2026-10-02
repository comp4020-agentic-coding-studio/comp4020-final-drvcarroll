// game-design.md §2, §4: bodies, regions, yields, adjacency, orbits.

export type Zone = "terrestrial" | "cislunar" | "inner" | "belt" | "jovian" | "saturnian" | "outer";

export interface Orbit {
  a: number; // semi-major axis, AU (moons: parent's)
  periodDays: number;
  l0Deg: number; // mean longitude at J2000
}

export interface BodyData {
  id: string;
  name: string;
  zone: Zone;
  slots: number;
  parent?: string; // moons share the parent's heliocentric position
  orbit: Orbit;
  moonPeriodDays?: number; // around the parent; rendering only
  fusionBonus: boolean;
  m: number;
  v: number;
  regions: string[]; // display names
}

// J2000 mean longitudes; asteroids are approximate.
const orbits = {
  mercury: { a: 0.387, periodDays: 87.97, l0Deg: 252.25 },
  venus: { a: 0.723, periodDays: 224.7, l0Deg: 181.98 },
  earth: { a: 1.0, periodDays: 365.25, l0Deg: 100.46 },
  mars: { a: 1.524, periodDays: 686.98, l0Deg: 355.45 },
  vesta: { a: 2.362, periodDays: 1325.8, l0Deg: 307.8 },
  ceres: { a: 2.767, periodDays: 1681.6, l0Deg: 153.3 },
  psyche: { a: 2.924, periodDays: 1826.4, l0Deg: 228.6 },
  jupiter: { a: 5.203, periodDays: 4332.6, l0Deg: 34.4 },
  saturn: { a: 9.537, periodDays: 10759.2, l0Deg: 49.94 },
  uranus: { a: 19.19, periodDays: 30688.5, l0Deg: 313.23 },
  neptune: { a: 30.07, periodDays: 60182, l0Deg: 304.88 },
  pluto: { a: 39.48, periodDays: 90560, l0Deg: 238.93 },
} satisfies Record<string, Orbit>;

// Fairness rule: every start region's M + V + S sums to 3.3. Lat/lon seed the
// region's patch on the globe (game-design.md §12).
const earthRows: [string, string, number, number, number, number, number][] = [
  ["r_canada", "Canada", 1.3, 1.3, 0.7, 60, -100],
  ["r_us_west", "US West", 1.2, 0.9, 1.2, 40, -115],
  ["r_us_east", "US East", 1.1, 1.1, 1.1, 38, -84],
  ["r_mexico", "Mexico & Central America", 1.1, 1.0, 1.2, 19, -96],
  ["r_brazil", "Brazil", 1.1, 1.1, 1.1, -10, -52],
  ["r_andean", "Andean States", 1.4, 0.7, 1.2, -10, -74],
  ["r_southern_cone", "Southern Cone", 1.2, 1.1, 1.0, -36, -63],
  ["r_w_europe", "Western Europe", 1.0, 1.3, 1.0, 46, 3],
  ["r_n_europe", "Northern Europe", 1.2, 1.4, 0.7, 63, 16],
  ["r_e_europe", "Eastern Europe", 1.2, 1.2, 0.9, 50, 23],
  ["r_w_russia", "Western Russia", 1.2, 1.4, 0.7, 57, 42],
  ["r_siberia", "Siberia", 1.6, 1.2, 0.5, 63, 105],
  ["r_n_africa", "North Africa", 0.8, 1.1, 1.4, 26, 12],
  ["r_w_africa", "West Africa", 1.0, 1.1, 1.2, 10, -3],
  ["r_e_africa", "East Africa", 1.1, 0.9, 1.3, 3, 36],
  ["r_s_africa", "Southern Africa", 1.5, 0.6, 1.2, -22, 25],
  ["r_arabia", "Arabia", 0.4, 1.5, 1.4, 24, 45],
  ["r_iran", "Iran & Central Asia", 1.0, 1.1, 1.2, 38, 63],
  ["r_india", "India", 1.1, 0.9, 1.3, 22, 79],
  ["r_n_china", "North China", 1.4, 0.9, 1.0, 40, 108],
  ["r_s_china", "South China", 1.1, 1.1, 1.1, 26, 112],
  ["r_se_asia", "Southeast Asia", 1.0, 1.2, 1.1, 12, 103],
  ["r_japan_korea", "Japan & Korea", 1.0, 1.3, 1.0, 37, 134],
  ["r_aus_nz", "Australia & New Zealand", 1.5, 0.6, 1.2, -26, 136],
];

type BodyRow = Omit<BodyData, "id" | "fusionBonus"> & { fusionBonus?: boolean };

const moon = (parent: keyof typeof orbits, moonPeriodDays: number) => ({
  parent,
  orbit: orbits[parent],
  moonPeriodDays,
});

const rows: Record<string, BodyRow> = {
  earth: {
    name: "Earth", zone: "terrestrial", slots: 4, orbit: orbits.earth, m: 0, v: 0,
    regions: earthRows.map((r) => r[1]),
  },
  antarctica: {
    name: "Antarctica", zone: "terrestrial", slots: 2, parent: "earth", orbit: orbits.earth,
    m: 1.3, v: 2.0, regions: ["Antarctica"],
  },
  luna: {
    name: "Luna", zone: "cislunar", slots: 3, ...moon("earth", 27.32), fusionBonus: true, m: 1.0, v: 0.5,
    regions: ["Mare Imbrium", "Mare Tranquillitatis", "Shackleton", "Far Side"],
  },
  mercury: {
    name: "Mercury", zone: "inner", slots: 3, orbit: orbits.mercury, m: 2.0, v: 0.2,
    regions: ["Caloris", "Borealis"],
  },
  venus: {
    name: "Venus", zone: "inner", slots: 2, orbit: orbits.venus, m: 0.8, v: 1.5,
    regions: ["Ishtar Terra", "Aphrodite Terra"],
  },
  mars: {
    name: "Mars", zone: "inner", slots: 3, orbit: orbits.mars, m: 1.2, v: 1.0,
    regions: [
      "Tharsis", "Olympus", "Valles Marineris", "Hellas",
      "Utopia", "Arabia Terra", "Elysium", "Planum Boreum",
    ],
  },
  phobos: { name: "Phobos", zone: "inner", slots: 2, ...moon("mars", 0.319), m: 1.2, v: 0.3, regions: ["Stickney"] },
  deimos: { name: "Deimos", zone: "inner", slots: 2, ...moon("mars", 1.263), m: 1.0, v: 0.3, regions: ["Swift"] },
  ceres: { name: "Ceres", zone: "belt", slots: 2, orbit: orbits.ceres, m: 1.0, v: 2.0, regions: ["Occator", "Ahuna"] },
  vesta: { name: "Vesta", zone: "belt", slots: 2, orbit: orbits.vesta, m: 2.0, v: 0.2, regions: ["Rheasilvia"] },
  psyche: { name: "Psyche", zone: "belt", slots: 2, orbit: orbits.psyche, m: 3.0, v: 0.1, regions: ["Psyche"] },
  jupiter: {
    name: "Jupiter orbital", zone: "jovian", slots: 2, orbit: orbits.jupiter, fusionBonus: true, m: 0, v: 1.0,
    regions: ["Jupiter High Orbit", "Jupiter Low Orbit"],
  },
  io: { name: "Io", zone: "jovian", slots: 3, ...moon("jupiter", 1.769), m: 1.5, v: 0.5, regions: ["Loki", "Pele"] },
  europa: {
    name: "Europa", zone: "jovian", slots: 3, ...moon("jupiter", 3.551), m: 0.5, v: 3.0,
    regions: ["Conamara", "Thera", "Pwyll"],
  },
  ganymede: {
    name: "Ganymede", zone: "jovian", slots: 3, ...moon("jupiter", 7.155), m: 1.0, v: 2.0,
    regions: ["Galileo Regio", "Uruk Sulcus", "Osiris"],
  },
  callisto: {
    name: "Callisto", zone: "jovian", slots: 3, ...moon("jupiter", 16.69), m: 1.0, v: 1.5,
    regions: ["Valhalla", "Asgard", "Adlinda"],
  },
  saturn: {
    name: "Saturn orbital", zone: "saturnian", slots: 2, orbit: orbits.saturn, fusionBonus: true, m: 0, v: 1.0,
    regions: ["Saturn Ring Station", "Saturn High Orbit"],
  },
  titan: {
    name: "Titan", zone: "saturnian", slots: 3, ...moon("saturn", 15.95), m: 0.5, v: 3.0,
    regions: ["Kraken Mare", "Ligeia Mare", "Xanadu", "Shangri-La"],
  },
  enceladus: {
    name: "Enceladus", zone: "saturnian", slots: 2, ...moon("saturn", 1.37), m: 0.2, v: 3.0,
    regions: ["Tiger Stripes"],
  },
  uranus: {
    name: "Uranus orbital", zone: "outer", slots: 2, orbit: orbits.uranus, fusionBonus: true, m: 0, v: 1.0,
    regions: ["Uranus Orbit"],
  },
  titania: { name: "Titania", zone: "outer", slots: 2, ...moon("uranus", 8.706), m: 1.0, v: 1.5, regions: ["Titania"] },
  oberon: { name: "Oberon", zone: "outer", slots: 2, ...moon("uranus", 13.46), m: 1.0, v: 1.5, regions: ["Oberon"] },
  neptune: {
    name: "Neptune orbital", zone: "outer", slots: 2, orbit: orbits.neptune, fusionBonus: true, m: 0, v: 1.0,
    regions: ["Neptune Orbit"],
  },
  triton: {
    name: "Triton", zone: "outer", slots: 2, ...moon("neptune", 5.877), m: 0.8, v: 2.0,
    regions: ["Cipango", "Uhlanga Regio"],
  },
  pluto: { name: "Pluto", zone: "outer", slots: 2, orbit: orbits.pluto, m: 0.5, v: 2.0, regions: ["Sputnik Planitia"] },
};

export const BODIES: Record<string, BodyData> = Object.fromEntries(
  Object.entries(rows).map(([id, r]) => [id, { id, fusionBonus: false, ...r }]),
);

export interface RegionData {
  id: string;
  name: string;
  body: string;
  m: number;
  v: number;
  s: number;
  start: boolean; // an Earth start region
  lat?: number; // Earth's patches sit at real geography; other bodies spread evenly
  lon?: number;
}

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Solar output off Earth is 10 × 1/d², so S = 1/a².
const offEarth: RegionData[] = Object.values(BODIES)
  .filter((b) => b.zone !== "terrestrial")
  .flatMap((b) =>
    b.regions.map((name) => ({
      id: b.regions.length === 1 ? `r_${b.id}` : `r_${b.id}_${slug(name)}`,
      name,
      body: b.id,
      m: b.m,
      v: b.v,
      s: 1 / b.orbit.a ** 2,
      start: false,
    })),
  );

export const REGIONS: Record<string, RegionData> = Object.fromEntries(
  [
    ...earthRows.map(([id, name, m, v, s, lat, lon]) => ({ id, name, body: "earth", m, v, s, start: true, lat, lon })),
    { id: "r_antarctica", name: "Antarctica", body: "antarctica", m: 1.3, v: 2.0, s: 0.3, start: false, lat: -82, lon: 0 },
    ...offEarth,
  ].map((r) => [r.id, r]),
);

// Real land borders plus the Bering, Gibraltar, Malacca and Tasman/Drake links.
const borders: [string, string][] = [
  ["r_canada", "r_us_west"], ["r_canada", "r_us_east"], ["r_canada", "r_siberia"],
  ["r_us_west", "r_us_east"], ["r_us_west", "r_mexico"], ["r_us_east", "r_mexico"],
  ["r_mexico", "r_andean"],
  ["r_brazil", "r_andean"], ["r_brazil", "r_southern_cone"], ["r_andean", "r_southern_cone"],
  ["r_southern_cone", "r_antarctica"],
  ["r_w_europe", "r_n_europe"], ["r_w_europe", "r_e_europe"], ["r_w_europe", "r_n_africa"],
  ["r_n_europe", "r_e_europe"], ["r_n_europe", "r_w_russia"],
  ["r_e_europe", "r_w_russia"], ["r_e_europe", "r_arabia"],
  ["r_w_russia", "r_siberia"], ["r_w_russia", "r_iran"],
  ["r_siberia", "r_iran"], ["r_siberia", "r_n_china"], ["r_siberia", "r_japan_korea"],
  ["r_n_africa", "r_w_africa"], ["r_n_africa", "r_e_africa"], ["r_n_africa", "r_arabia"],
  ["r_w_africa", "r_e_africa"], ["r_w_africa", "r_s_africa"],
  ["r_e_africa", "r_s_africa"], ["r_s_africa", "r_antarctica"],
  ["r_arabia", "r_iran"],
  ["r_iran", "r_india"], ["r_iran", "r_n_china"],
  ["r_india", "r_n_china"], ["r_india", "r_se_asia"],
  ["r_n_china", "r_s_china"], ["r_n_china", "r_japan_korea"],
  ["r_s_china", "r_se_asia"],
  ["r_se_asia", "r_aus_nz"], ["r_aus_nz", "r_antarctica"],
];

export const ADJACENT: Record<string, string[]> = {};
for (const [a, b] of borders) {
  (ADJACENT[a] ??= []).push(b);
  (ADJACENT[b] ??= []).push(a);
}

export const MAP = {
  bodyControlBonus: 0.25,
  solarBase: 10, // E/min per unit of S
  calendarStartJ2000Days: 18262.5, // 1 Jan 2050 relative to J2000
  dayMs: 1000, // 1 game day = 1 real second
};
