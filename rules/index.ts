// game-design.md §13: the rules engine's public surface. Pure: no I/O, no clock.
import { advance, settle, settled } from "./advance.ts";
import { isRejection } from "./check.ts";
import { check } from "./commands.ts";
import type { Command, Id, Ms, Rejection } from "./protocol.ts";
import type { State } from "./state.ts";

export { settled } from "./advance.ts";
export { legalActions, observe } from "./observe.ts";
export { newSeason, type State } from "./state.ts";
export type * from "./protocol.ts";

// Bump when rule logic changes, so commands never replay under other rules.
export const RULES_VERSION = "1";

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

// Why a command would be rejected right now, or null if it would apply.
export function validate(state: State, nation: Id, cmd: Command): Rejection | null {
  const plan = check(settled(state), nation, cmd);
  return isRejection(plan) ? plan : null;
}
