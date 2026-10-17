// system-design.md §9, §10, §14.2: HTTP routes, and the server's wiring.
import { serve, type ServerType } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { marked } from "marked";
import {
  ADMIN, SESSION_MAX_AGE_S, checkSignup, createSession, createUser, endSession, ensureAdmin, rateLimited, sessionUser, verify, type User,
} from "./auth.ts";
import { freeColour } from "../rules/commands.ts";
import { openDb, type Db } from "./db.ts";
import { Hub } from "./hub.ts";
import { Log } from "./log.ts";
import { adminPage, page, empirePage, loginPage, shellPage } from "./pages.ts";
import { World, nationOf } from "./world.ts";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "client", "dist");

// The built client's entry, from Vite's manifest; read per request so a
// watch rebuild is picked up.
function clientAssets(): { js: string; css: string[] } | null {
  try {
    const m = JSON.parse(readFileSync(join(DIST, ".vite", "manifest.json"), "utf8"));
    const e = Object.values(m).find((x: any) => x.isEntry) as { file: string; css?: string[] };
    return { js: `/static/${e.file}`, css: (e.css ?? []).map((f) => `/static/${f}`) };
  } catch {
    return null;
  }
}
const COOKIE = "session";

export interface ServerOptions {
  port: number;
  dataDir: string;
  build?: string;
  secureCookies?: boolean;
  now?: () => number;
  admins?: string[]; // usernames that may open /admin (ADMIN_USERS)
  log?: Log;
}

export interface Running {
  server: ServerType;
  port: number;
  world: World;
  hub: Hub;
  db: Db;
  close(): Promise<void>;
}

const isForm = (c: Context) => !(c.req.header("content-type") ?? "").includes("application/json");

async function body(c: Context): Promise<Record<string, string>> {
  const raw = isForm(c) ? await c.req.parseBody() : await c.req.json().catch(() => ({}));
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

const ip = (c: Context) => c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0] ?? "local";

export function createApp(db: Db, world: World, hub: Hub, opts: { secureCookies: boolean; now: () => number; admins: string[] }) {
  const app = new Hono();
  const readme = page("README", marked.parse(readFileSync(join(ROOT, "README.md"), "utf8")) as string);
  const user = (c: Context): User | null => sessionUser(db, getCookie(c, COOKIE));
  const signIn = (c: Context, u: User) =>
    setCookie(c, COOKIE, createSession(db, u.id), {
      httpOnly: true, secure: opts.secureCookies, sameSite: "Lax", path: "/", maxAge: SESSION_MAX_AGE_S,
    });
  const log = (action: string, result: string, username?: string) =>
    hub.log.write({ ts: opts.now(), ...(username ? { user: username.toLowerCase() } : {}), action, result });
  const admin = (c: Context) => {
    const u = user(c);
    return u && (u.username === ADMIN.username || opts.admins.includes(u.username)) ? u : null;
  };
  const empireOf = (u: User) => {
    const n = world.state?.nations[nationOf(u.id)];
    return n ? { name: n.name, primary: n.primary, secondary: n.secondary } : undefined;
  };

  app.get("/", (c) => {
    const u = user(c);
    return c.html(u ? shellPage(u.username, clientAssets()) : loginPage());
  });
  app.get("/readme/", (c) => c.html(readme));
  app.get("/healthz", (c) => c.text("ok"));
  app.use("/static/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/static/*", serveStatic({ root: DIST, rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

  app.get("/empire", (c) => {
    const u = user(c);
    if (!u) return c.redirect("/", 303);
    const s = world.ensureSeason(opts.now());
    const prev = world.lastEmpire(u.id);
    const fresh = { name: prev?.name ?? "", primary: freeColour(s, nationOf(u.id)), secondary: prev?.secondary ?? "#ffffff" };
    return c.html(empirePage(empireOf(u) ?? fresh));
  });

  app.post("/api/signup", async (c) => {
    const { username = "", password = "" } = await body(c);
    const bad = checkSignup(username, password);
    if (bad) {
      log("signup", "INVALID", username);
      return isForm(c) ? c.html(loginPage(bad.reason), 400) : c.json(bad, 400);
    }
    const u = await createUser(db, username, password);
    log("signup", u ? "ok" : "TAKEN", username);
    if (!u) {
      const e = { field: "username", reason: "That username is taken" };
      return isForm(c) ? c.html(loginPage(e.reason), 409) : c.json(e, 409);
    }
    signIn(c, u);
    return isForm(c) ? c.redirect("/empire", 303) : c.json({ username: u.username });
  });

  app.post("/api/login", async (c) => {
    const { username = "", password = "" } = await body(c);
    if (rateLimited(username, ip(c))) {
      log("login", "RATE_LIMIT", username);
      return isForm(c) ? c.html(loginPage("Too many attempts; try again later"), 429) : c.json({ reason: "Too many attempts" }, 429);
    }
    const u = await verify(db, username, password, ip(c));
    log("login", u ? "ok" : "UNAUTHORIZED", username);
    if (!u) {
      const reason = "Wrong username or password";
      return isForm(c) ? c.html(loginPage(reason), 401) : c.json({ reason }, 401);
    }
    signIn(c, u);
    return isForm(c) ? c.redirect("/", 303) : c.json({ username: u.username });
  });

  app.post("/api/logout", (c) => {
    const u = user(c);
    if (u) log("logout", "ok", u.username);
    endSession(db, getCookie(c, COOKIE));
    deleteCookie(c, COOKIE, { path: "/" });
    return isForm(c) ? c.redirect("/", 303) : c.json({ ok: true });
  });

  app.get("/api/me", (c) => {
    const u = user(c);
    return u ? c.json({ username: u.username, empire: empireOf(u) }) : c.json({ reason: "Not signed in" }, 401);
  });

  app.post("/api/empire", async (c) => {
    const u = user(c);
    if (!u) return c.json({ reason: "Not signed in" }, 401);
    const { name = "", primary = "", secondary = "" } = await body(c);
    const now = opts.now();
    world.ensureSeason(now);
    const r = world.submit(nationOf(u.id), { type: "setEmpire", name, primary, secondary }, null, now);
    if (!r.ok) {
      const e = { field: /colour/i.test(r.reason) ? "primary" : "name", reason: r.reason };
      const status = r.code === "TAKEN" ? 409 : 400;
      return isForm(c) ? c.html(empirePage({ name, primary, secondary }, e.reason), status) : c.json(e, status);
    }
    return isForm(c) ? c.redirect("/", 303) : c.json({ empire: empireOf(u) });
  });

  // system-design.md §11: the live view, for ADMIN_USERS only; others see 404.
  app.get("/admin", (c) => (admin(c) ? c.html(adminPage()) : c.notFound()));
  app.get("/api/admin/stream", (c) => {
    if (!admin(c)) return c.notFound();
    return streamSSE(c, async (stream) => {
      while (!stream.aborted) {
        await stream.writeSSE({ data: JSON.stringify(hub.stats()) });
        await stream.sleep(1000);
      }
    });
  });

  app.post("/api/admin/reset", (c) => {
    const u = admin(c);
    if (!u) return c.notFound();
    log("reset", "ok", u.username);
    hub.reset();
    return c.json({ ok: true });
  });

  app.get("/api/season", (c) => c.json({ season: world.state?.season ?? null, hallOfFame: world.hallOfFame() }));

  return app;
}

export async function start(o: ServerOptions): Promise<Running> {
  const now = o.now ?? (() => Date.now());
  const db = openDb(o.dataDir);
  await ensureAdmin(db);
  const world = new World(db);
  const t0 = performance.now();
  world.boot(now());
  const bootMs = performance.now() - t0;
  const hub = new Hub(world, o.build ?? "dev", now, o.log ?? new Log());
  hub.log.write({ ts: now(), action: "boot", result: "ok", ms: Number(bootMs.toFixed(1)) }); // S5
  const app = createApp(db, world, hub, { secureCookies: o.secureCookies ?? false, now, admins: o.admins ?? [] });
  const snapshots = setInterval(() => world.snapshot(), 60_000);
  snapshots.unref();

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: o.port, hostname: "0.0.0.0" }, (info) => {
      resolve({
        server, port: info.port, world, hub, db,
        close: () => new Promise((done) => {
          clearInterval(snapshots);
          hub.close(4003, "Server restarting");
          world.snapshot();
          server.close(() => {
            db.close();
            done();
          });
          (server as import("node:http").Server).closeAllConnections();
        }),
      });
    });
    server.on("upgrade", (req, socket, head) => {
      if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") return socket.destroy();
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return socket.destroy();
      const token = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
      const u = sessionUser(db, token && decodeURIComponent(token));
      if (u) return hub.upgrade(req, socket, head, u);
      hub.reject(req, socket, head, token ? 4002 : 4001);
    });
  });
}
