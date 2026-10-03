// goals.md P10 and P7: the map-first client, driven in real Chrome against an
// in-process server. `pnpm test:e2e` builds the client first.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start, type Running } from "../server/app.ts";

let app: Running;
let browser: Browser;
let base: string;

beforeAll(async () => {
  if (!existsSync("client/dist/.vite/manifest.json")) throw new Error("run `pnpm build` first");
  app = await start({ port: 0, dataDir: mkdtempSync(join(tmpdir(), "grow-e2e-")) });
  base = `http://127.0.0.1:${app.port}`;
  browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

const errors: string[] = [];

async function player(name: string, region: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const p = await browser.newPage({ viewport });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  const f = p.locator('form[action="/api/signup"]');
  await f.locator("input[name=username]").fill(name);
  await f.locator("input[name=password]").fill("correct horse");
  await f.locator("button").click();
  await p.fill("input[name=name]", name);
  await p.click("text=Save");
  await p.locator(".start details summary").click();
  await p.locator(".start details button.row", { hasText: region }).click();
  await p.locator(".start button", { hasText: "Start here" }).click();
  await p.waitForSelector(".empire");
  return p;
}

const camDistance = (p: Page) => p.evaluate(() => {
  const s = (window as any).scene;
  return s.camera.position.distanceTo(s.controls.target) as number;
});

describe("the map is the screen (goals.md P10)", () => {
  it("onboards on the globe and fills the viewport with the map", async () => {
    const p = await player("alpha", "Siberia");
    const box = await p.locator("canvas.scene").boundingBox();
    expect(box).toMatchObject({ width: 1440, height: 900 });
    await expect.poll(() => p.locator(".stocks").innerText()).toMatch(/200/);
    expect(errors).toEqual([]);
    await p.close();
  });

  it("zooms with the wheel, pans with a drag, cycles and backs out with keys", async () => {
    const p = await player("bravo", "Brazil");
    await p.waitForTimeout(1500);
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1400);
    const far = await camDistance(p);
    await p.mouse.move(720, 450);
    for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -240);
    await p.waitForTimeout(600);
    expect(await camDistance(p)).toBeLessThan(far * 0.8);

    const target = () => p.evaluate(() => (window as any).scene.controls.target.toArray() as number[]);
    const before = await target();
    await p.mouse.move(700, 500);
    await p.mouse.down();
    await p.mouse.move(900, 600, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    expect(await target()).not.toEqual(before);

    await p.keyboard.press("]");
    await expect.poll(() => p.evaluate(() => (window as any).scene.focus)).not.toBeNull();
    await p.close();
  });

  it("selects a region by clicking it on the globe and explains a refusal", async () => {
    const p = await player("charlie", "India");
    await p.locator(".empire .list.sub button.row", { hasText: "India" }).click();
    await p.waitForTimeout(1600);
    await p.keyboard.press("Escape"); // deselect, then pick it on the map
    const at = await p.evaluate(() => (window as any).scene.screenOf("r_india"));
    expect(at).not.toBeNull();
    await p.mouse.click(at.x, at.y);
    await expect.poll(() => p.locator(".selection h2").innerText()).toBe("India");
    await p.locator(".seg button", { hasText: "build" }).click();
    const mine = p.locator(".selection li.item", { has: p.locator('b:text-is("Mine")') });
    expect(await mine.locator("button").isDisabled()).toBe(true);
    expect(await mine.locator(".why").innerText()).toBe("No free slot in India");
    await p.close();
  });

  it("drops a region down to its slots and output, and breaks a gain down per day", async () => {
    const p = await player("golf", "Canada");
    await p.locator(".empire .list.sub button.row", { hasText: "Canada" }).click();
    expect(await p.locator(".drop .slot").allInnerTexts()).toEqual(["Solar plant", "Mine", "Refinery", "Lab"]);
    expect(await p.locator(".drop .flows").first().innerText()).toMatch(/M\s*\+0\.13/); // 7.8 Metals/min
    await p.locator(".stocks button.gain").nth(1).click();
    const rows = await p.locator(".breakdown tbody tr").allInnerTexts();
    expect(rows).toEqual([expect.stringMatching(/Mine\s+\+0\.13\s+\+7\.8/)]);
    await p.keyboard.press("Escape");
    await expect.poll(() => p.locator(".breakdown").count()).toBe(0);
    await p.close();
  });

  it("settles a neighbour by march from the region's Military tab", async () => {
    const p = await player("delta", "Arabia");
    await p.locator(".empire .list.sub button.row", { hasText: "Arabia" }).click();
    await p.locator(".seg button", { hasText: "military" }).click();
    await p.locator(".selection li.item", { hasText: "Iran" }).locator("button", { hasText: "Settle" }).click();
    await expect.poll(() => p.locator(".toast").allInnerTexts()).toContain("March to Iran & Central Asia: done");
    await p.close();
  });

  it("shows another player's arrival live and fits a phone", async () => {
    const a = await player("echo", "Western Europe", { width: 390, height: 844 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const b = await player("foxtrot", "Southern Africa");
    await a.locator(".drawers button", { hasText: "Empires" }).click();
    await expect.poll(() => a.locator(".drawer").innerText(), { timeout: 2000 }).toMatch(/foxtrot/);
    await a.close();
    await b.close();
  });
});
