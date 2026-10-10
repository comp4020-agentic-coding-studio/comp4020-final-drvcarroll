// goals.md P10 and P7: the map-first client, driven in real Chrome against an
// in-process server. `pnpm test:e2e` builds the client first.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start, type Running } from "../server/app.ts";
import { Log } from "../server/log.ts";

let app: Running;
let browser: Browser;
let base: string;

beforeAll(async () => {
  if (!existsSync("client/dist/.vite/manifest.json")) throw new Error("run `pnpm build` first");
  app = await start({ port: 0, dataDir: mkdtempSync(join(tmpdir(), "grow-e2e-")), log: new Log(() => {}) });
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
    await expect.poll(() => p.locator(".selection h2").textContent()).toBe("India");
    await expect.poll(() => p.locator(".selection button.tile").count()).toBe(4);
    await p.locator(".selection .forces input[aria-label='Armies to train']").fill("6");
    const train = p.locator(".selection .forces .action", { hasText: "Train" });
    expect(await train.locator("button").isDisabled()).toBe(true);
    expect(await train.locator(".why").innerText()).toMatch(/^Needs 1\d more Materiel$/);
    await p.locator(".selection button.tile").nth(1).click();
    expect(await p.locator(".tile-menu button", { hasText: "Upgrade" }).isDisabled()).toBe(true);
    expect(await p.locator(".tile-menu .hint").innerText()).toMatch(/Automated Mining/);
    await p.close();
  });

  it("drops a region down to its slots and output, and breaks a gain down per day", async () => {
    const p = await player("golf", "Canada");
    await p.locator(".empire .list.sub button.row", { hasText: "Canada" }).click();
    const slots = await p.locator(".drop .slot svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(slots).toEqual(["Solar Power Plant", "Mine", "Refinery", "Lab"]);
    expect(await p.locator(".drop .flows").first().innerText()).toMatch(/\+0\.13/); // 7.8 Metals/min
    expect(await p.locator(".drop .flows svg[aria-label=Metals]").count()).toBe(1);
    await p.locator(".stocks button.gain").nth(1).click();
    const rows = await p.locator(".breakdown tbody tr").allInnerTexts();
    expect(rows).toEqual([expect.stringMatching(/Mine\s+\+0\.13\s+\+7\.8/)]);
    await p.keyboard.press("Escape");
    await expect.poll(() => p.locator(".breakdown").count()).toBe(0);
    await p.close();
  });

  it("replaces a slot from its tile, with the refund counted", async () => {
    const p = await player("hotel", "Japan & Korea");
    await p.locator(".empire .list.sub button.row", { hasText: "Japan" }).click();
    await p.locator(".selection button.tile").nth(3).click();
    await p.locator(".tile-menu button", { hasText: "Replace" }).first().click();
    await p.locator(".picker li.item", { has: p.locator('b:text-is("Spaceport")') }).locator("button", { hasText: "Replace" }).click();
    await expect.poll(() => p.locator(".selection button.tile.busy").count()).toBe(1);
    expect(await p.locator(".selection button.tile").nth(3).getAttribute("aria-label")).toMatch(/^Spaceport, building/);
    await p.close();
  });

  it("settles a neighbour by march from Forces here", async () => {
    const p = await player("delta", "Arabia");
    await p.locator(".empire .list.sub button.row", { hasText: "Arabia" }).click();
    await p.locator(".forces .march summary").click();
    await p.locator(".selection li.item", { hasText: "Iran" }).locator("button", { hasText: "Settle" }).click();
    await expect.poll(() => p.locator(".toast").allInnerTexts()).toContain("March to Iran & Central Asia: done");
    await p.close();
  });

  it("opens the Guide from the top bar, and names resources by icon, never letter", async () => {
    const p = await player("india", "Southeast Asia");
    await p.locator(".empire .list.sub button.row", { hasText: "Southeast Asia" }).click();
    await p.locator(".selection button.tile").nth(1).click();
    const text = await p.locator(".topbar, .empire, .selection").allInnerTexts();
    expect(text.join("\n")).not.toMatch(/\d\s?(E|M|V|A|R|Mt)\b|\b(E|M|V|A|R|Mt)\s?[×+−]\d/);
    const names = await p.locator(".stocks svg").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names).toEqual(["Energy", "Metals", "Volatiles", "Alloys", "Research", "Materiel"]);
    await p.locator(".drawers button", { hasText: "Guide" }).click();
    const pages = await p.locator(".guide nav button").allTextContents();
    for (const t of ["Building", "Armies", "Research", "Colonising", "Sending ships"]) expect(pages).toContain(t);
    await p.locator(".guide nav button", { hasText: "Sending ships" }).click();
    await expect.poll(() => p.locator(".guide article").innerText()).toMatch(/Launch/);
    await p.keyboard.press("Escape");
    await expect.poll(() => p.locator(".guide").count()).toBe(0);
    await p.close();
  });

  it("renders first in under 3 MB, real maps streaming after (goals.md P8)", async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(base);
    const f = p.locator('form[action="/api/signup"]');
    await f.locator("input[name=username]").fill("juliet");
    await f.locator("input[name=password]").fill("correct horse");
    await f.locator("button").click();
    await p.fill("input[name=name]", "juliet");
    let bytes = 0;
    const sizes: Promise<void>[] = [];
    p.on("response", (r) => sizes.push(r.body().then((b) => void (bytes += b.length), () => {})));
    await p.click("text=Save");
    await p.waitForSelector("canvas.scene");
    await p.waitForTimeout(1000);
    await Promise.all(sizes);
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
    await expect.poll(() => p.evaluate(() => performance.getEntriesByType("resource").some((e) => e.name.endsWith(".512.webp"))), { timeout: 10_000 }).toBe(true);
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
  }, 60_000);
});
