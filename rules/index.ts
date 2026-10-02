// game-design.md §13: the rules engine's public surface. Pure: no I/O, no clock.
import { advance } from "./advance.ts";
import { check, isRejection } from "./commands.ts";
import type { Command, Id, Ms, Rejection } from "./protocol.ts";
import type { State } from "./state.ts";

export { newSeason, type State } from "./state.ts";
export type * from "./protocol.ts";

export type ApplyResult = { ok: true; state: State } | Rejection;

export function advanceTo(state: State, t: Ms): State {
  const s = structuredClone(state);
  advance(s, t);
  return s;
}

export function apply(state: State, nation: Id, cmd: Command, at: Ms): ApplyResult {
  const s = advanceTo(state, at);
  const plan = check(s, nation, cmd);
  if (isRejection(plan)) return plan;
  plan();
  return { ok: true, state: s };
}

// Why a command would be rejected right now, or null if it would apply.
export function validate(state: State, nation: Id, cmd: Command): Rejection | null {
  const plan = check(state, nation, cmd);
  return isRejection(plan) ? plan : null;
}
