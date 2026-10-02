// Shared validation helpers for command handlers.
import { REGIONS, RESOURCE_NAMES, type Goods } from "./data/index.ts";
import { canAfford } from "./economy.ts";
import type { Command, Id, RejectCode, Rejection } from "./protocol.ts";
import { schedule, touch, type NationState, type QueueItem, type RegionState, type State } from "./state.ts";

export type Plan = Rejection | (() => void);
export type Cmd<T extends Command["type"]> = Extract<Command, { type: T }>;
export type Handler<T extends Command["type"]> = (s: State, n: NationState, c: Cmd<T>) => Plan;

export const no = (code: RejectCode, reason: string): Rejection => ({ ok: false, code, reason });

export const isRejection = (x: unknown): x is Rejection =>
  typeof x === "object" && x !== null && (x as Rejection).ok === false;

export const regionName = (id: Id) => REGIONS[id].name;

export const isInt = (x: unknown, min: number, max: number) =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

export function needs(n: NationState, cost: Goods): Rejection | null {
  const r = canAfford(n, cost);
  return r && no("INSUFFICIENT", `Needs ${Math.ceil(cost[r]! - n.stocks[r])} more ${RESOURCE_NAMES[r]}`);
}

export function ownRegion(s: State, n: NationState, id: Id): Rejection | RegionState {
  const r = s.regions[id];
  if (!r) return no("INVALID", "Unknown region");
  if (r.owner !== n.id) return no("NOT_OWNER", `You don't control ${regionName(id)}`);
  return r;
}

export function enqueue(s: State, r: RegionState, item: string, durMs: number, paid: Goods): void {
  const startAt = r.queue.at(-1)?.finishAt ?? s.t;
  const q: QueueItem = { id: `q_${s.nextId++}`, item, startAt, finishAt: startAt + durMs, paid };
  r.queue.push(q);
  if (r.queue.length === 1) schedule(s, { kind: "queue", at: q.finishAt, region: r.id, item: q.id });
  touch(r);
}
