// goals.md P10, build-process.md E2: the region maps put real places in
// the right region, and every region's anchor and feature inside itself.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SPHERES } from "../client/src/scene/layout.ts";
import { hasGround, regionsOf, STEP } from "./worlds.ts";

const maps = new Map<string, { px: Buffer; w: number; h: number; ch: number }>();
async function at(sphere: string, lat: number, lon: number): Promise<string | null> {
  if (!maps.has(sphere)) {
    const { data, info } = await sharp(`client/public/worlds/${sphere}.regions.png`).raw().toBuffer({ resolveWithObject: true });
    maps.set(sphere, { px: data, w: info.width, h: info.height, ch: info.channels });
  }
  const m = maps.get(sphere)!;
  const x = Math.min(m.w - 1, Math.floor(((lon + 180) / 360) * m.w));
  const y = Math.min(m.h - 1, Math.floor(((90 - lat) / 180) * m.h));
  const k = Math.round(m.px[(y * m.w + x) * m.ch] / STEP);
  return k ? regionsOf(sphere)[k - 1].id : null;
}

describe("region maps (game-design.md §12)", () => {
  it("puts real cities in their region and the open ocean in none", async () => {
    const cities: [number, number, string | null][] = [
      [48.86, 2.35, "r_w_europe"], [39.74, -104.99, "r_us_west"], [41.88, -87.63, "r_us_east"],
      [55.76, 37.62, "r_w_russia"], [55.03, 82.92, "r_siberia"], [39.9, 116.4, "r_n_china"],
      [23.13, 113.26, "r_s_china"], [-33.87, 151.0, "r_aus_nz"], [-23.55, -46.63, "r_brazil"],
      [30.04, 31.24, "r_n_africa"], [-1.29, 36.82, "r_e_africa"], [35.69, 139.69, "r_japan_korea"],
      [0, -140, null], [-30, -20, null],
    ];
    for (const [lat, lon, want] of cities) expect(await at("earth", lat, lon), `${lat},${lon}`).toBe(want);
  });

  it("holds every region's anchor inside that region", async () => {
    for (const s of SPHERES.filter(hasGround)) {
      for (const r of regionsOf(s)) expect(await at(s, r.lat, r.lon), r.name).toBe(r.id);
    }
  });
});
