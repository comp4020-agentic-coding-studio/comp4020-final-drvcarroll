// system-design.md §6, §14.3: one socket; welcome is a full snapshot, each
// tick carries whole changed entities. No optimistic updates.
import { batch } from "@preact/signals";
import type { Command, CommandResult, VisibleWorld } from "../../rules/index.ts";
import { describe } from "./format.ts";
import { clock, conn, offset, pending, season, tickAt, toast, world, you } from "./store.ts";

type Msg = Record<string, any>;
let ws: WebSocket | undefined;
let backoff = 500;
const samples: number[] = [];

export function connect(): void {
  const url = new URL("/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(url);
  ws.onmessage = (e) => receive(JSON.parse(e.data));
  ws.onclose = (e) => {
    if (e.code === 4001 || e.code === 4002) {
      conn.value = "signed-out";
      return;
    }
    conn.value = "reconnecting";
    const wait = Math.min(15_000, backoff) * (0.5 + Math.random() / 2);
    backoff *= 2;
    setTimeout(connect, wait);
  };
}

setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "ping", clientTime: Date.now() })), 10_000);

function upsert<T extends { id: string }>(xs: T[], changed: T[] | undefined, removed: string[] | undefined): T[] {
  if (!changed?.length && !removed?.length) return xs;
  const m = new Map(xs.map((x) => [x.id, x]));
  for (const x of changed ?? []) m.set(x.id, x);
  for (const id of removed ?? []) m.delete(id);
  return [...m.values()];
}

function receive(m: Msg): void {
  if (m.t === "pong") {
    const now = Date.now();
    samples.push(m.serverTime - (m.clientTime + now) / 2);
    if (samples.length > 5) samples.shift();
    offset.value = [...samples].sort((a, b) => a - b)[samples.length >> 1];
    return;
  }
  batch(() => {
    if (m.t === "welcome") {
      if (document.documentElement.dataset.build && document.documentElement.dataset.build !== m.build) location.reload();
      document.documentElement.dataset.build = m.build;
      offset.value = m.serverTime - Date.now();
      clock.value = m.serverTime;
      world.value = m.world;
      you.value = m.you;
      season.value = m.season;
      tickAt.value = m.serverTime;
      conn.value = "open";
      backoff = 500;
      for (const [id, cmd] of Object.entries(pending.value)) ws!.send(JSON.stringify({ t: "cmd", id, cmd }));
      return;
    }
    if (m.t !== "tick") return;
    tickAt.value = m.at;
    const w = world.value;
    if (w) {
      const c = m.changes ?? {};
      const next: VisibleWorld = {
        ...w,
        nations: upsert(w.nations, c.nations, undefined),
        regions: upsert(w.regions, c.regions, undefined),
        fleets: upsert(w.fleets, c.fleets, c.removed?.fleets),
        wars: upsert(w.wars, c.wars, c.removed?.wars),
        scores: m.scores ?? w.scores,
        presence: m.presence ?? w.presence,
        news: m.news ? [...w.news, ...m.news].slice(-50) : w.news,
      };
      world.value = next;
    }
    if (m.you) you.value = you.value ? { ...you.value, ...m.you } : m.you;
    if (m.season) season.value = m.season;
    for (const r of (m.results ?? []) as CommandResult[]) settle(r);
  });
}

function settle(r: CommandResult): void {
  const cmd = pending.value[r.id];
  if (!cmd) return;
  const { [r.id]: _, ...rest } = pending.value;
  pending.value = rest;
  if (!r.ok) toast(`${describe(cmd)}: ${r.reason}`, "error");
  else toast(`${describe(cmd)}: done`);
}

export function send(cmd: Command): void {
  const id = crypto.randomUUID();
  pending.value = { ...pending.value, [id]: cmd };
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "cmd", id, cmd }));
}
