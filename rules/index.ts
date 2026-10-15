// game-design.md §13: the rules engine's public surface. Pure: no I/O, no clock.
import { advance, settle, settled } from "./advance.ts";
import { isRejection } from "./check.ts";
import { check } from "./commands.ts";
import type { Command, Id, Ms, Rejection } from "./protocol.ts";
import type { State } from "./state.ts";

export { settled } from "./advance.ts";
export { legalActions, observe, viewCache, type ViewCache } from "./observe.ts";
export { newSeason, type State } from "./state.ts";
export type * from "./protocol.ts";

// Bump when rule logic changes, so commands never replay under other rules.
export const RULES_VERSION = "3";

export type ApplyResult = { ok: true; state: State } | Rejection;

export function advanceTo(state: State, t: Ms): State {
  const s = structuredClone(state);
  advance(s, t);
  return s;
}

export function apply(state: State, nation: Id, cmd: Command, at: Ms): ApplyResult {
  const s = advanceTo(state, at);
  settle(s);
  const plan = check(s, nation, cmd);
  if (isRejection(plan)) return plan;
  plan();
  return { ok: true, state: s };
}

// apply() for a sole owner of the state (the server): mutates it, no copy.
// A rejection leaves it exactly as an advance alone would, as on replay.
export function applyInPlace(s: State, nation: Id, cmd: Command, at: Ms): Rejection | null {
  advance(s, at);
  const stocksAt = s.stocksAt;
  const stocks = Object.values(s.nations).map((n) => [n, { ...n.stocks }] as const);
  settle(s);
  const plan = check(s, nation, cmd);
  if (!isRejection(plan)) return (plan(), null);
  s.stocksAt = stocksAt;
  for (const [n, st] of stocks) n.stocks = st;
  return plan;
}

export { advance } from "./advance.ts";

// Why a command would be rejected right now, or null if it would apply.
export function validate(state: State, nation: Id, cmd: Command): Rejection | null {
  const plan = check(settled(state), nation, cmd);
  return isRejection(plan) ? plan : null;
}
