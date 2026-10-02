// system-design.md §14: incoming messages are checked for shape before the
// engine sees them. The engine still validates meaning (ids, costs, rules).
import type { Command } from "../rules/index.ts";

type Kind = "str" | "num" | "goods";
const S: Record<Exclude<Command["type"], "setEmpire">, Record<string, Kind>> = {
  join: { region: "str" },
  build: { region: "str", building: "str" },
  demolish: { region: "str", slot: "num" },
  cancelBuild: { region: "str", index: "num" },
  setMode: { region: "str", slot: "num", mode: "str" },
  research: { tech: "str" },
  cancelResearch: {},
  train: { region: "str", count: "num" },
  buildShip: { region: "str", unit: "str", count: "num" },
  launch: { from: "str", to: "str", units: "goods" },
  colonise: { fleet: "str", region: "str" },
  invade: { fleet: "str", region: "str" },
  march: { from: "str", to: "str", count: "num" },
  declareWar: { nation: "str" },
  offerPeace: { nation: "str" },
  acceptPeace: { war: "str" },
  offerTrade: { to: "str", give: "goods", get: "goods" },
  acceptTrade: { offer: "str" },
  declineTrade: { offer: "str" },
  cancelTrade: { offer: "str" },
  gift: { to: "str", goods: "goods" },
  exchange: { give: "str", amount: "num", get: "str" },
  sendEnvoy: { nation: "str" },
  recallEnvoy: { nation: "str" },
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

const ok: Record<Kind, (x: unknown) => boolean> = {
  str: (x) => typeof x === "string" && x.length <= 64,
  num: (x) => typeof x === "number" && Number.isFinite(x),
  goods: (x) => isObj(x) && Object.keys(x).length <= 12 && Object.values(x).every((v) => typeof v === "number" && Number.isFinite(v)),
};

// setEmpire is server-issued only, so it is absent here on purpose.
export function parseCommand(x: unknown): Command | null {
  if (!isObj(x) || typeof x.type !== "string" || !Object.hasOwn(S, x.type)) return null;
  const fields = S[x.type as keyof typeof S];
  const out: Record<string, unknown> = { type: x.type };
  for (const [k, kind] of Object.entries(fields)) {
    if (!ok[kind](x[k])) return null;
    out[k] = x[k];
  }
  return out as Command;
}

export type ClientMessage = { t: "cmd"; id: string; cmd: Command } | { t: "ping"; clientTime: number };

export function parseMessage(raw: string): ClientMessage | { bad: string } {
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { bad: "Not JSON" };
  }
  if (!isObj(x)) return { bad: "Not an object" };
  if (x.t === "ping" && typeof x.clientTime === "number") return { t: "ping", clientTime: x.clientTime };
  if (x.t !== "cmd" || typeof x.id !== "string" || x.id.length > 64) return { bad: "Unknown message" };
  const cmd = parseCommand(x.cmd);
  return cmd ? { t: "cmd", id: x.id, cmd } : { bad: "Unknown or malformed command" };
}
