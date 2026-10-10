// system-design.md §3: builds client/public/worlds/ from real sources.
// Region maps (game-design.md §12): Earth from Natural Earth borders, other
// bodies a weighted Voronoi on real features. Textures: SOURCES, in tiers.
// Run: pnpm worlds (downloads ~2 GB once into .cache/worlds/).
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { feature } from "topojson-client";
type Topology = Parameters<typeof feature>[0];
import { EARTH_MEMBERS } from "../rules/data/index.ts";
import { RADIUS_KM, regionsOn, SPHERES } from "../client/src/scene/layout.ts";

const OUT = "client/public/worlds";
const CACHE = ".cache/worlds";
const ADMIN1 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
export const STEP = 8; // index × STEP per pixel, so decoding noise can't shift it
const SPLIT = ["United States of America", "Russia", "China"];
const OVERSEAS_DEG = 25; // farther than this from the mainland: nearest region

const SSS = "https://www.solarsystemscope.com/textures/download";
const USGS = "https://planetarymaps.usgs.gov/mosaic";
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons";

// Each body's real map. `tint` colourises a greyscale mosaic. Credits are
// shown in the Guide (client/src/ui/Guide.tsx).
interface Source { url: string; tint?: string }
export const SOURCES: Record<string, Source> = {
  mercury: { url: `${SSS}/2k_mercury.jpg` },
  venus: { url: `${SSS}/2k_venus_atmosphere.jpg` },
  earth: { url: `${SSS}/8k_earth_daymap.jpg` },
  "earth.night": { url: `${SSS}/2k_earth_nightmap.jpg` },
  "earth.clouds": { url: `${SSS}/2k_earth_clouds.jpg` },
  luna: { url: `${SSS}/2k_moon.jpg` },
  mars: { url: `${SSS}/2k_mars.jpg` },
  jupiter: { url: `${SSS}/2k_jupiter.jpg` },
  saturn: { url: `${SSS}/2k_saturn.jpg` },
  uranus: { url: `${SSS}/2k_uranus.jpg` },
  neptune: { url: `${SSS}/2k_neptune.jpg` },
  io: { url: `${USGS}/Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif` },
  europa: { url: `${USGS}/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif`, tint: "#d9c8ae" },
  ganymede: { url: `${USGS}/Ganymede_Voyager_GalileoSSI_global_mosaic_1km.tif`, tint: "#b5a894" },
  callisto: { url: `${USGS}/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif`, tint: "#9c8b78" },
  titan: { url: `${USGS}/Titan_ISS_P19658_Mosaic_Global_4km.tif`, tint: "#d99a4e" },
  enceladus: { url: `${COMMONS}/a/aa/Enceladus_Color_Map.jpg` },
  vesta: { url: `${USGS}/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif`, tint: "#a89a88" },
  phobos: { url: `${USGS}/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif`, tint: "#8a7c6e" },
  deimos: { url: `${COMMONS}/6/6b/Deimos_color_map.jpg` },
  titania: { url: `${COMMONS}/8/85/Titania_map_JPL_USGS.jpg`, tint: "#b8afa6" },
  oberon: { url: `${COMMONS}/1/1d/Oberon_map_JPL_USGS.jpg`, tint: "#a39589" },
  triton: { url: `${USGS}/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif` },
  pluto: { url: `${USGS}/Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif`, tint: "#d8bc9c" },
};
// Pixel widths per tier; Earth's day map gets a 4K top tier.
const TIERS = { "512": 512, "2k": 2048 } as const;
const TOP: Record<string, number> = { earth: 4096 };

type Ring = [number, number][];
type Poly = Ring[];
interface Geo { properties: Record<string, string | null>; geometry: { type: string; coordinates: unknown } }

export const regionsOf = regionsOn;
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
    const res = await fetch(url, { headers: { "User-Agent": "grow-worlds/1.0 (COMP4020 student game build script)" } });
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

// A GeoTIFF's west edge in degrees, from its ModelTiepoint and PixelScale
// tags: 0 means a 0..360 map that needs rolling to −180..180.
function westEdge(path: string): number | null {
  const fd = openSync(path, "r");
  const read = (at: number, n: number) => { const b = Buffer.alloc(n); readSync(fd, b, 0, n, at); return b; };
  try {
    const head = read(0, 16);
    const le = head.toString("latin1", 0, 2) === "II";
    const u16 = (b: Buffer, o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
    const u32 = (b: Buffer, o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const big = u16(head, 2) === 43;
    const ifd = big ? Number(le ? head.readBigUInt64LE(8) : head.readBigUInt64BE(8)) : u32(head, 4);
    const n = big ? Number(le ? read(ifd, 8).readBigUInt64LE(0) : read(ifd, 8).readBigUInt64BE(0)) : u16(read(ifd, 2), 0);
    const size = big ? 20 : 12;
    const tags = read(ifd + (big ? 8 : 2), n * size);
    const f64s = (tag: number) => {
      for (let i = 0; i < n; i++) {
        if (u16(tags, i * size) !== tag) continue;
        const count = big ? Number(le ? tags.readBigUInt64LE(i * size + 4) : tags.readBigUInt64BE(i * size + 4)) : u32(tags, i * size + 4);
        const off = big ? Number(le ? tags.readBigUInt64LE(i * size + 12) : tags.readBigUInt64BE(i * size + 12)) : u32(tags, i * size + 8);
        const b = read(off, count * 8);
        return Array.from({ length: count }, (_, k) => (le ? b.readDoubleLE(k * 8) : b.readDoubleBE(k * 8)));
      }
      return null;
    };
    const tie = f64s(33922), scale = f64s(33550);
    if (!tie || !scale) return null;
    return tie[3]; // projected x of the west edge: ~0 or ~−πR
  } finally {
    closeSync(fd);
  }
}

// Unimaged gaps (one flat fill colour over > 5% of the map), widened past
// their rims, take the first imaged copy of the same spot mirrored across
// the equator, half a turn round, or both; else a blend down the column.
function fillGaps(px: Buffer, w: number, h: number, ch: number): void {
  const key = (i: number) => (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
  const count = new Map<number, number>();
  for (let i = 0; i < px.length; i += ch) count.set(key(i), (count.get(key(i)) ?? 0) + 1);
  const [flat, n] = [...count].reduce((a, b) => (b[1] > a[1] ? b : a));
  if (n <= (w * h) / 20) return;
  const gap = (i: number) => key(i) === flat;
  let mask = new Uint8Array(w * h).map((_, k) => +gap(k * ch));
  const rim = Math.max(2, Math.round(w / 400));
  for (let pass = 0; pass < rim; pass++) {
    const m = mask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k] && (mask[y * w + ((x + 1) % w)] || mask[y * w + ((x + w - 1) % w)] || (y > 0 && mask[k - w]) || (y < h - 1 && mask[k + w]))) m[k] = 1;
    }
    mask = m;
  }
  const left = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!mask[k]) continue;
      const x2 = (x + w / 2) % w, y2 = h - 1 - y;
      const from = [y2 * w + x, y * w + x2, y2 * w + x2].find((f) => !mask[f]);
      if (from === undefined) left[k] = 1;
      else for (let c = 0; c < 3; c++) px[k * ch + c] = px[from * ch + c];
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!left[y * w + x]) continue;
      let a = y, b = y;
      while (a >= 0 && left[a * w + x]) a--;
      while (b < h && left[b * w + x]) b++;
      for (let yy = y; yy < b; yy++) {
        const t = (yy - a) / (b - a);
        for (let c = 0; c < 3; c++) {
          const top = a >= 0 ? px[(a * w + x) * ch + c] : px[(b * w + x) * ch + c];
          const bot = b < h ? px[(b * w + x) * ch + c] : top;
          px[(yy * w + x) * ch + c] = top + (bot - top) * t;
        }
      }
      y = b;
    }
  }
}

// A greyscale mosaic coloured by `hex`, keeping its brightness.
function tint(px: Buffer, ch: number, hex: string): void {
  const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  for (let i = 0; i < px.length; i += ch) {
    const g = (px[i] + px[i + 1] + px[i + 2]) / 3;
    for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, (g * t[c]) / lum);
  }
}

async function texture(id: string, src: Source): Promise<void> {
  const file = await cached(src.url, src.url.split("/").pop()!);
  const west = file.endsWith(".tif") ? westEdge(file) : null;
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  const w = Math.floor(Math.min(meta.width!, 8192) / 2) * 2;
  const img = sharp(file, { limitInputPixels: false }).resize(w, w / 2, { fit: "fill" }).removeAlpha().toColourspace("srgb");
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  fillGaps(data, info.width, info.height, info.channels);
  if (src.tint) tint(data, info.channels, src.tint);
  let full = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  if (west !== null && Math.abs(west) < 1) { // 0..360: roll half a turn
    const half = info.width / 2;
    full = sharp({ create: { width: info.width, height: info.height, channels: 3, background: "#000" } }).composite([
      { input: await full.clone().extract({ left: half, top: 0, width: half, height: info.height }).png().toBuffer(), left: 0, top: 0 },
      { input: await full.clone().extract({ left: 0, top: 0, width: half, height: info.height }).png().toBuffer(), left: half, top: 0 },
    ]);
    full = sharp(await full.png().toBuffer());
  }
  const tiers: [string, number][] = [...Object.entries(TIERS), ...(TOP[id] ? [["top", TOP[id]] as [string, number]] : [])];
  for (const [name, tw] of tiers) {
    await full.clone().resize(tw, tw / 2, { fit: "fill" }).webp({ quality: 82 }).toFile(`${OUT}/${id}.${name}.webp`);
  }
  console.log(`${id}: ${meta.width}×${meta.height}${src.tint ? " tinted" : ""}${west !== null ? ` west ${west.toFixed(0)}` : ""}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  if (only !== "regions") {
    for (const [id, src] of Object.entries(SOURCES)) if (!only || only === id) await texture(id, src);
    if (only) return;
  }
  for (const sphere of SPHERES.filter(hasGround)) {
    const [w, h] = size(sphere);
    const px = sphere === "earth" ? await earthMap() : featureMap(sphere);
    await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/${sphere}.regions.png`);
    console.log(`${sphere}.regions.png ${w}×${h}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
