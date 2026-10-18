// goals.md P10 and P7: the map-first client, driven in real Chrome against an
// in-process server. `pnpm test:e2e` builds the client first.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BUILDINGS, REGIONS, TRAVEL, WAR } from "../rules/data/index.ts";
import { start, type Running } from "../server/app.ts";
import { Log } from "../server/log.ts";

let app: Running;
let browser: Browser;
let base: string;
let skew = 0; // fast-forwards the server clock past long builds

beforeAll(async () => {
  if (!existsSync("client/dist/.vite/manifest.json")) throw new Error("run `pnpm build` first");
  app = await start({ port: 0, dataDir: mkdtempSync(join(tmpdir(), "grow-e2e-")), log: new Log(() => {}), now: () => Date.now() + skew });
  base = `http://127.0.0.1:${app.port}`;
  browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

const errors: string[] = [];
const pages: Page[] = [];
// A failed test skips its close(); this stops it starving the next ones.
afterEach(async () => {
  await Promise.all(pages.splice(0).map((p) => p.close().catch(() => {})));
});

async function player(name: string, region: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const p = await browser.newPage({ viewport });
  pages.push(p);
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

// Keyboard only (goals.md P7): focus plus Enter or typing, never a click.
const key = (l: import("playwright-core").Locator, k = "Enter") => l.press(k);

async function keyboardPlayer(name: string, region: string, viewport: { width: number; height: number }): Promise<Page> {
  const p = await browser.newPage({ viewport });
  pages.push(p);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  const f = p.locator('form[action="/api/signup"]');
  await f.locator("input[name=username]").fill(name);
  await f.locator("input[name=password]").fill("correct horse");
  await key(f.locator("input[name=password]"));
  await p.locator("input[name=name]").fill(name);
  await key(p.locator("input[name=name]"));
  await key(p.locator(".start details summary"));
  await key(p.locator(".start details button.row", { hasText: region }));
  await key(p.locator(".start button", { hasText: "Start here" }));
  await p.waitForSelector(".empire");
  return p;
}

// claim, build, launch, colonise: the core loop, end to end (build-process.md D).
async function coreLoopByKeyboard(p: Page, home: string, neighbour: string, moon: string, fromFleet = false): Promise<void> {
  const empire = p.locator(".empire");
  if (!(await empire.locator(".sec").count())) await key(empire.locator(".hud-title").first()); // phone: menu starts closed
  await key(empire.locator(".list.sub button.row", { hasText: home }));
  await key(p.locator(".forces .march summary"));
  await key(p.locator(".forces li.item", { hasText: neighbour }).locator("button", { hasText: "Settle" }));
  await expect.poll(() => p.locator(".toast").allInnerTexts()).toContain(`March to ${neighbour}: done`);
  // Alloys for a Spaceport and a Colony Ship: 60 Energy on the Exchange.
  await key(p.locator(".drawers button", { hasText: "Empires" }));
  const ex = p.locator(".exchange");
  await ex.locator("input[aria-label='Amount to exchange']").fill("60");
  await key(ex.locator("[aria-label='Resource to give'] button:has(svg[aria-label=Energy])"));
  await key(ex.locator("[aria-label='Resource to get'] button:has(svg[aria-label=Alloys])"));
  await key(ex.locator("button", { hasText: "Exchange" }));
  await expect.poll(() => p.locator(".toast").allInnerTexts()).toContainEqual(expect.stringMatching(/^Exchange 60 Energy/));
  await key(p.locator(".drawers button", { hasText: "Empires" }));
  // Build a Spaceport over the Lab, from its tile; skip its 4 min build.
  await key(empire.locator(".list.sub button.row", { hasText: home }));
  await key(p.locator(".selection button.tile").nth(3));
  await key(p.locator(".tile-menu button", { hasText: "Replace" }).first());
  await key(p.locator(".picker li.item", { has: p.locator('b:text-is("Spaceport")') }).locator("button", { hasText: "Replace" }));
  await expect.poll(() => p.locator(".selection button.tile").nth(3).getAttribute("aria-label")).toMatch(/^Spaceport, building/);
  skew += BUILDINGS.spaceport.timeS * 1000;
  await expect.poll(() => p.locator(".selection button.tile").nth(3).getAttribute("aria-label"), { timeout: 20_000 }).toMatch(/^Spaceport:/);
  await key(p.locator(".selection button.tile").nth(3));
  await key(p.locator(".tile-menu .picker li.item", { has: p.locator('b:text-is("Colony Ship")') }).locator("button", { hasText: "Build" }));
  // Launch it to Luna from the Fleets list and the destination picker.
  await expect.poll(() => empire.locator(".sec-head", { hasText: "Military" }).innerText(), { timeout: 60_000 }).toMatch(/· 1/);
  await key(empire.locator(".sec-head", { hasText: "Military" }));
  await key(empire.locator(".sec button.row", { hasText: "@" }).first());
  const dest = p.locator("select[aria-label=Destination]");
  await dest.focus();
  await p.keyboard.type("Luna");
  await key(p.locator(".planner button", { hasText: "Launch" }));
  await expect.poll(() => p.locator(".toast").allInnerTexts(), { timeout: 30_000 }).toContain("Launch to Luna: done");
  if (fromFleet) {
    // In orbit, the fleet lists Luna's free regions (game-design.md §12).
    await shift(30_000, p);
    await key(empire.locator(".sec-head", { hasText: "Military" }));
    await key(empire.locator(".sec button.row", { hasText: "@ Luna" }).first());
    await key(p.locator('.selection [aria-label="Free regions on Luna"] li', { hasText: moon }).locator("button", { hasText: "Colonise" }));
  } else {
    // Claim a Luna region while it flies (once it has left, so a pick selects).
    await key(empire.locator(".hud-title", { hasText: "All bodies" }));
    await key(empire.locator("button.row", { hasText: "cislunar" }));
    await key(p.locator(".selection button.row", { hasText: moon }));
    await key(p.locator(".selection button", { hasText: /Claim on arrival|Colonise/ }));
  }
  await expect.poll(async () => (await p.locator(".empire .list.sub button.row").allInnerTexts()).join(" "), { timeout: 60_000 }).toContain(moon);
}

describe("the map is the screen (goals.md P10)", () => {
  it("onboards on the globe and fills the viewport with the map", async () => {
    const p = await player("alpha", "Siberia");
    const box = await p.locator("canvas.scene").boundingBox();
    expect(box).toMatchObject({ width: 1440, height: 900 });
    await expect.poll(() => p.locator(".stocks").innerText()).toMatch(/200/);
    expect(await p.locator(".topbar .badge.stage").innerText()).toMatch(/Stage 1 · Founding/i);
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
    expect(await train.locator(".why").innerText()).toMatch(/^Needs 1\d more Materiel; a Factory makes it$/);
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
    expect(await p.locator(".drop .flows").first().innerText()).toMatch(/\+0\.22/); // 13 Metals/min
    expect(await p.locator(".drop .flows svg[aria-label=Metals]").count()).toBe(1);
    await p.locator(".stocks button.gain").nth(1).click();
    const rows = await p.locator(".breakdown tbody tr").allInnerTexts();
    expect(rows).toEqual([expect.stringMatching(/Mine\s+\+0\.22\s+\+13\b/)]);
    await p.keyboard.press("Escape");
    await expect.poll(() => p.locator(".breakdown").count()).toBe(0);
    await p.close();
  });

  it("replaces a slot from its tile, with the refund counted", async () => {
    const p = await player("hotel", "Japan & Korea");
    await p.locator(".empire .list.sub button.row", { hasText: "Japan" }).click();
    await p.locator(".selection button.tile").nth(3).click();
    await p.locator(".tile-menu button", { hasText: "Replace" }).first().click();
    await expect.poll(() => p.locator(".tile-menu .warn").innerText()).toBe("Removes your only Lab: Research 0/min.");
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

  it("steps graphics quality from the user menu, kept across reloads (system-design.md §8)", async () => {
    const p = await player("oscar", "Andean States");
    const ratio = () => p.evaluate(() => (window as any).scene?.renderer.getPixelRatio() as number | undefined);
    await p.locator(".menu summary").click();
    const gfx = p.locator(".menu button.graphics");
    expect(await gfx.textContent()).toMatch(/^Graphics: auto \((high|medium|low)\)$/);
    for (const t of ["high", "medium", "low"]) {
      await gfx.click();
      expect(await gfx.textContent()).toBe(`Graphics: ${t}`);
    }
    expect(await ratio()).toBe(1);
    await p.reload();
    await expect.poll(ratio, { timeout: 10_000 }).toBe(1);
    await p.close();
  });

  it("invites an ally from Empires, and the ally joins (build-process.md D4)", async () => {
    const a = await player("romeo", "Southern Cone");
    const b = await player("sierra", "South China");
    await a.locator(".drawers button", { hasText: "Empires" }).click();
    await a.locator("li.nation", { hasText: "sierra" }).locator("button", { hasText: "Invite to alliance" }).click();
    await b.locator(".drawers button", { hasText: "Empires" }).click();
    await b.locator(".alliance .invite button", { hasText: "Join" }).click();
    await expect.poll(() => a.locator("li.nation", { hasText: "sierra" }).locator(".status").innerText()).toMatch(/allied/i);
    await a.close();
    await b.close();
  }, 120_000);

  it("pins an Envoy beacon on the host's capital, for the sender only", async () => {
    const a = await player("november", "North China");
    const b = await player("mike", "West Africa");
    await a.locator(".drawers button", { hasText: "Empires" }).click();
    const ex = a.locator(".exchange");
    await ex.locator("input[aria-label='Amount to exchange']").fill("270");
    await ex.locator("[aria-label='Resource to get'] button:has(svg[aria-label=Research])").click();
    await ex.locator("button", { hasText: "Exchange" }).click();
    await a.locator(".empire .sec-head", { hasText: "Research" }).click();
    await a.locator(".empire .sec button", { hasText: "Tech tree" }).click();
    for (const tech of ["Computing", "Signals Intelligence"]) {
      await a.locator(".rungs li", { hasText: tech }).locator("button", { hasText: "Research" }).click();
      await expect.poll(() => a.locator(".rungs li.held", { hasText: tech }).count(), { timeout: 45_000 }).toBe(1);
    }
    await a.locator(".drawers button", { hasText: "Empires" }).click();
    await a.locator("li.nation", { hasText: "mike" }).locator("button", { hasText: "Send Envoy" }).click();
    await expect.poll(() => a.locator(".label.region.envoy").evaluateAll((els) => els.map((e) => e.firstChild?.textContent))).toEqual(["West Africa"]);
    expect(await b.locator(".label.envoy").count()).toBe(0);
    await a.close();
    await b.close();
  }, 120_000);
});

describe("the core loop by keyboard alone (goals.md P7; build-process.md D)", () => {
  it("claims, builds, launches and colonises at 1920×1080", async () => {
    const p = await keyboardPlayer("kilo", "US West", { width: 1920, height: 1080 });
    await coreLoopByKeyboard(p, "US West", "Mexico & Central America", "Mare Imbrium", true);
    expect(errors).toEqual([]);
    await p.close();
  }, 240_000);

  it("claims, builds, launches and colonises at 390×844", async () => {
    const p = await keyboardPlayer("lima", "Eastern Europe", { width: 390, height: 844 });
    await coreLoopByKeyboard(p, "Eastern Europe", "Western Russia", "Mare Tranquillitatis");
    await p.close();
  }, 240_000);
});

// Moves the server clock on, then reloads so each client resyncs its clock.
async function shift(ms: number, ...pages: Page[]): Promise<void> {
  skew += ms;
  await Promise.all(pages.map(async (p) => {
    await p.reload();
    await p.waitForSelector(".empire");
  }));
}

// Selects a region through the scene, once it's up, as a map click would.
async function pick(p: Page, region: string): Promise<void> {
  await p.waitForFunction(() => (window as any).scene);
  // Right after a reload the scene can drop a select: retry until it shows.
  await expect.poll(async () => {
    await p.evaluate((r) => (window as any).scene.select("earth", r), region);
    return p.locator(".selection .sel-head h2").allTextContents();
  }, { interval: 500, timeout: 15_000 }).toEqual([REGIONS[region].name]);
}

// Runs last: it moves the server clock past protection and war activation.
describe("war you can see (goals.md P10; build-process.md D3)", () => {
  it("has three dropdowns; declares war, attacks and shows the battle drain live (build-process.md D3)", async () => {
    const a = await player("papa", "North Africa");
    const b = await player("quebec", "East Africa");
    expect(await a.locator(".empire .sec-head span").allTextContents()).toEqual(["Territory", "Military", "Research"]);
    // Past both nations' protection; a reload resyncs each client's clock.
    await shift(WAR.protectionS * 1000, a, b);
    // Rival's region at peace: Declare war in place, Attack once active.
    await pick(a, "r_e_africa");
    a.once("dialog", (d) => d.accept());
    await a.locator(".selection .war-here button", { hasText: "Declare war" }).click();
    await expect.poll(() => a.locator(".selection .war-here").innerText()).toMatch(/War goes active/);
    await shift(WAR.activationS * 1000, a, b);
    await pick(a, "r_e_africa");
    await expect.poll(() => a.locator(".selection .war-here").count()).toBe(0);
    await a.locator(".selection li.item", { hasText: "From North Africa" }).locator("button", { hasText: "Attack" }).click();
    // Watch from the defender's side; the march lands 3 s from now.
    await shift(TRAVEL.marchHopS * 1000 - 3000, b);
    await pick(b, "r_e_africa");
    const battle = b.locator(".selection .battle-now");
    await expect.poll(() => battle.count(), { timeout: 20_000 }).toBe(1);
    const left = () => battle.locator("li.side .amt").allInnerTexts();
    const before = await left();
    await expect.poll(left, { timeout: 5000 }).not.toEqual(before);
    expect(await b.locator(".label.region .swords").count()).toBeGreaterThan(0);
    await a.close();
    await b.close();
  }, 180_000);
});

describe("the client trusts only the server (system-design.md §6; goals.md P9, S1)", () => {
  it("reconnects after a dropped socket and restores the view in under 3 s", async () => {
    const p = await player("tango", "Northern Europe");
    await expect.poll(() => p.locator(".conn").getAttribute("class")).toMatch(/open/);
    const t0 = Date.now();
    app.hub.close(4003, "Server restarting");
    await expect.poll(() => p.locator(".conn").getAttribute("class")).toMatch(/reconnecting/);
    await expect.poll(() => p.locator(".conn").getAttribute("class"), { timeout: 3000, interval: 50 }).toMatch(/open/);
    expect(Date.now() - t0).toBeLessThan(3000);
    await expect.poll(() => p.locator(".empire .list.sub button.row", { hasText: "Northern Europe" }).count()).toBe(1);
    await p.close();
 }, 60_000);

  it("changes nothing for a pending command until the server's result", async () => {
    const p = await player("uniform", "Australia & New Zealand");
    await p.locator(".empire .list.sub button.row", { hasText: "Australia & New Zealand" }).click();
    const queued = p.locator(".selection .forces li.item", { hasText: "Army" }).filter({ hasText: /left|starts in/ });
    expect(await queued.count()).toBe(0);
    const tick = app.hub.tick.bind(app.hub);
    let held = true;
    app.hub.tick = () => { if (!held) tick(); };
    try {
      const train = p.locator(".selection .forces .inline .action button");
      await train.click();
      await expect.poll(() => train.innerText()).toBe("…");
      await p.waitForTimeout(1200);
      expect(await queued.count()).toBe(0);
      held = false;
      await expect.poll(() => queued.count()).toBe(1);
    } finally {
      app.hub.tick = tick;
    }
    await p.close();
  }, 60_000);
});

