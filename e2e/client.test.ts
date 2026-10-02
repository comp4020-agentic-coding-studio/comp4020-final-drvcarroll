// Stage D: the DOM client driven in real Chrome against an in-process server.
// Needs `pnpm build` first; run with `pnpm test:e2e`.
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
  browser = await chromium.launch({ channel: "chrome" });
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

async function newPlayer(name: string, viewport = { width: 1440, height: 1000 }): Promise<Page> {
  const p = await browser.newPage({ viewport });
  p.on("pageerror", (e) => { throw e; });
  await p.goto(base);
  const f = p.locator('form[action="/api/signup"]');
  await f.locator("input[name=username]").fill(name);
  await f.locator("input[name=password]").fill("correct horse");
  await f.locator("button").click();
  await p.fill("input[name=name]", name);
  await p.click("text=Save");
  await p.waitForSelector("table.starts");
  return p;
}

const section = (p: Page, title: string) => p.locator("section.card", { has: p.locator(`h3:text-is("${title}")`) });

describe("the browser client (build-process.md stage D)", () => {
  it("onboards, joins, explains refusals and settles a neighbour by march", async () => {
    const p = await newPlayer("alpha");
    expect(await p.locator("table.starts tbody tr").count()).toBe(24);
    await p.locator("tr", { hasText: "Siberia" }).locator("button").click();
    await p.waitForSelector(".layout");
    await expect.poll(() => p.locator(".stocks").innerText()).toMatch(/M\s*200/);

    const mine = section(p, "Build").locator("li", { has: p.locator('b:text-is("Mine")') });
    expect(await mine.locator("button").isDisabled()).toBe(true);
    expect(await mine.locator(".why").innerText()).toBe("No free slot in Siberia");

    await section(p, "Armies").locator("li", { hasText: "Canada" }).locator("button", { hasText: "Settle" }).click();
    await expect.poll(() => p.locator(".toast").allInnerTexts()).toContain("March to Canada: done");
    await p.waitForTimeout(31_000);
    await p.click('.tabs.regions button:has-text("Canada")');
    await expect.poll(() => p.locator("dl.facts").first().innerText()).toMatch(/Owner\s*alpha/);
    await expect.poll(() => p.locator(".news").innerText()).toMatch(/claims Canada/);
    await p.close();
  }, 60_000);

  it("cycles bodies with [ and ] and fits a phone with no sideways scroll", async () => {
    const p = await newPlayer("bravo", { width: 390, height: 844 });
    await p.locator("tr", { hasText: "Brazil" }).locator("button").click();
    await p.waitForSelector(".layout");
    await p.keyboard.press("]");
    await expect.poll(() => p.locator(".panelhead h2").innerText()).toBe("Antarctica");
    await p.keyboard.press("Escape");
    await expect.poll(() => p.locator(".panelhead h2").innerText()).toBe("Earth");
    expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const tab = await p.locator('.tabs[aria-label=Panels] button').first().boundingBox();
    expect(tab!.height).toBeGreaterThanOrEqual(44);
    await p.close();
  }, 30_000);

  it("shows another player's claim live", async () => {
    const a = await newPlayer("charlie");
    await a.locator("tr", { hasText: "India" }).locator("button").click();
    await a.waitForSelector(".layout");
    const b = await newPlayer("delta");
    await b.locator("tr", { hasText: "Arabia" }).locator("button").click();
    await expect.poll(() => a.locator(".board").innerText(), { timeout: 2000 }).toMatch(/delta/);
    await a.close();
    await b.close();
  }, 30_000);
});
