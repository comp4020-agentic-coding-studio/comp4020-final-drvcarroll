// Account and socket helpers shared by spec/ (running app) and server tests.
import { expect } from "vitest";
import { WebSocket } from "ws";

export type Msg = Record<string, any>;

const PASSWORD = "correct horse";

export function api(base: string) {
  const post = (path: string, body: object, cookie = "") =>
    fetch(new URL(path, base), {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
    });
  return {
    post,
    // Signs up (or logs in) and returns the session cookie; sets an empire if
    // named, picking another colour if it clashes with an existing one.
    async account(username: string, empire?: { name: string; primary?: string }): Promise<string> {
      let res = await post("/api/signup", { username, password: PASSWORD });
      if (res.status === 409) res = await post("/api/login", { username, password: PASSWORD });
      expect(res.ok, `account ${username}: ${res.status}`).toBe(true);
      const cookie = res.headers.get("set-cookie")!.split(";")[0];
      for (let i = 0; empire && i < 20; i++) {
        const r = await post("/api/empire", { name: empire.name, primary: i ? colour() : (empire.primary ?? colour()), secondary: "#ffffff" }, cookie);
        if (r.status === 200) break;
        const e = await r.json();
        expect(e.field, e.reason).toBe("primary");
      }
      return cookie;
    },
  };
}

export class Client {
  msgs: Msg[] = [];
  closed?: number;
  ws: WebSocket;

  constructor(base: string, cookie: string) {
    const u = new URL("/ws", base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(u, { headers: { cookie, origin: new URL(base).origin } });
    this.ws.on("message", (d) => this.msgs.push(JSON.parse(String(d))));
    this.ws.on("close", (code) => (this.closed = code));
  }

  static async open(base: string, cookie: string): Promise<Client> {
    const c = new Client(base, cookie);
    await c.until((m) => m.t === "welcome");
    return c;
  }

  get welcome(): Msg {
    return this.msgs.find((m) => m.t === "welcome")!;
  }

  async until(pred: (m: Msg) => boolean, ms = 3000): Promise<Msg> {
    const t0 = Date.now();
    for (;;) {
      const m = this.msgs.find(pred);
      if (m) return m;
      if (this.closed) throw new Error(`socket closed (${this.closed})`);
      if (Date.now() - t0 > ms) throw new Error("timed out waiting for a message");
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  send(id: string, cmd: object): void {
    this.ws.send(JSON.stringify({ t: "cmd", id, cmd }));
  }

  async result(id: string): Promise<Msg> {
    const m = await this.until((x) => x.t === "tick" && x.results?.some((r: Msg) => r.id === id));
    return m.results.find((r: Msg) => r.id === id);
  }

  // Joins at the first Earth start region this client sees as free.
  async join(): Promise<string> {
    const free = this.welcome.world.regions.filter((r: Msg) => r.body === "earth" && !r.owner).map((r: Msg) => r.id);
    for (const region of free) {
      const id = `join-${region}`;
      this.send(id, { type: "join", region });
      if ((await this.result(id)).ok) return region;
    }
    throw new Error("no free start region: run against a fresh data directory");
  }

  close(): void {
    this.ws.close();
  }
}

export const unique = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e4)}`;
export const colour = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
