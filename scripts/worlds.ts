// system-design.md §3: builds client/public/worlds/ from real sources.
// Region maps (game-design.md §12): Earth from Natural Earth borders, other
// bodies a weighted Voronoi on real features. Run: node scripts/worlds.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { feature } from "topojson-client";
type Topology = Parameters<typeof feature>[0];
import { EARTH_MEMBERS, REGIONS } from "../rules/data/index.ts";
import { RADIUS_KM, sphereOf, SPHERES } from "../client/src/scene/layout.ts";

const OUT = "client/public/worlds";
const CACHE = ".cache/worlds";
const ADMIN1 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
export const STEP = 8; // index × STEP per pixel, so decoding noise can't shift it
const SPLIT = ["United States of America", "Russia", "China"];
const OVERSEAS_DEG = 25; // farther than this from the mainland: nearest region

type Ring = [number, number][];
type Poly = Ring[];
interface Geo { properties: Record<string, string | null>; geometry: { type: string; coordinates: unknown } }

// Regions on a sphere, in the order the client numbers them (index = i + 1).
export const regionsOf = (sphere: string) => Object.values(REGIONS).filter((r) => sphereOf(r.body) === sphere);
export const size = (sphere: string): [number, number] => (sphere === "earth" ? [4096, 2048] : [1024, 512]);

const polys = (g: Geo["geometry"]): Poly[] =>
  g.type === "Polygon" ? [g.coordinates as Poly] : g.type === "MultiPolygon" ? (g.coordinates as Poly[]) : [];

// Even-odd scanline fill of one polygon (outer ring and holes) in lon/lat.
function fill(px: Uint8Array, w: number, h: number, poly: Poly, value: number): void {
  const edges = poly.flatMap((ring) => ring.slice(1).map((b, i) => [ring[i], b] as const));
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) * 180) / h;
    const xs: number[] = [];
    for (const [[x1, y1], [x2, y2]] of edges) {
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(((xs[k] + 180) / 360) * w - 0.5));
      const b = Math.min(w - 1, Math.floor(((xs[k + 1] + 180) / 360) * w - 0.5));
      for (let x = a; x <= b; x++) px[y * w + x] = value;
    }
  }
}

const centroid = (p: Poly): [number, number] => {
  const r = p[0];
  return [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length];
};
const area = (p: Poly) => Math.abs(p[0].reduce((a, q, i) => {
  const n = p[0][(i + 1) % p[0].length];
  return a + q[0] * n[1] - n[0] * q[1];
}, 0)) / 2;
const angle = ([lo1, la1]: [number, number], [lo2, la2]: [number, number]) => {
  const r = Math.PI / 180;
  const c = Math.sin(la1 * r) * Math.sin(la2 * r) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.cos((lo1 - lo2) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

async function cached(url: string, name: string): Promise<string> {
  const path = `${CACHE}/${name}`;
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`fetching ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

// Earth: every country (or province, for the split three) filled with its
// region; overseas pieces go to the nearest region's mainland.
async function earthMap(): Promise<Uint8Array> {
  const [w, h] = size("earth");
  const index = new Map(regionsOf("earth").map((r, i) => [r.id, i + 1]));
  const owner = new Map<string, string>();
  for (const [region, names] of Object.entries(EARTH_MEMBERS)) for (const n of names) owner.set(n, region);
  const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8")) as Topology;
  const countries = (feature(topo, topo.objects.countries) as unknown as { features: Geo[] }).features
    .filter((f) => !SPLIT.includes(f.properties.name!));
  const admin = (JSON.parse(readFileSync(await cached(ADMIN1, "admin1.geojson"), "utf8")) as { features: Geo[] }).features
    .filter((f) => SPLIT.includes(f.properties.admin!));
  const pieces: { region: string; polys: Poly[]; overseas: boolean }[] = [];
  for (const f of countries) {
    const region = owner.get(f.properties.name!);
    if (!region) throw new Error(`no region for ${f.properties.name}`);
    pieces.push({ region, polys: polys(f.geometry), overseas: true });
  }
  for (const f of admin) {
    const p = f.properties;
    const region = owner.get(`${p.admin}:${p.region}`) ?? owner.get(`${p.admin}:${p.name}`);
    if (!region) throw new Error(`no region for ${p.admin}: ${p.name} (${p.region})`);
    pieces.push({ region, polys: polys(f.geometry), overseas: false });
  }
  const mainland = pieces.filter((x) => x.overseas).map((x) => {
    const big = [...x.polys].sort((a, b) => area(b) - area(a))[0];
    return { region: x.region, at: centroid(big), big };
  });
  const px = new Uint8Array(w * h);
  for (const x of pieces) {
    const home = mainland.find((m) => m.region === x.region && x.polys.includes(m.big));
    for (const p of x.polys) {
      let region = x.region;
      if (home && p !== home.big && angle(centroid(p), home.at) > OVERSEAS_DEG) {
        region = mainland.reduce((a, m) => (angle(centroid(p), m.at) < angle(centroid(p), a.at) ? m : a)).region;
      }
      fill(px, w, h, p, index.get(region)! * STEP);
    }
  }
  return px;
}

// Off Earth: each pixel goes to the feature it is nearest to, less that
// feature's angular radius, so a big basin claims a big region.
function featureMap(sphere: string): Uint8Array {
  const [w, h] = size(sphere);
  const rs = regionsOf(sphere);
  const radius = rs.map((r) => ((r.km ?? 0) / 2 / RADIUS_KM[sphere]) * (180 / Math.PI));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) * 180) / h;
    for (let x = 0; x < w; x++) {
      const lon = -180 + ((x + 0.5) * 360) / w;
      let best = 0, score = Infinity;
      rs.forEach((r, i) => {
        const d = angle([lon, lat], [r.lon, r.lat]) - 0.5 * radius[i];
        if (d < score) [best, score] = [i, d];
      });
      px[y * w + x] = (best + 1) * STEP;
    }
  }
  return px;
}

// Gas giants have orbits, not ground: no region map (game-design.md §4).
export const hasGround = (sphere: string) => regionsOf(sphere).some((r) => r.km !== 0);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  for (const sphere of SPHERES.filter(hasGround)) {
    const [w, h] = size(sphere);
    const px = sphere === "earth" ? await earthMap() : featureMap(sphere);
    await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/${sphere}.regions.png`);
    console.log(`${sphere}.regions.png ${w}×${h}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
