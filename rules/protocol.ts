// system-design.md §14: types shared by server and client.
import type { Building, Goods, Resource } from "./data/economy.ts";
import type { Unit } from "./data/military.ts";

export type { Building, Goods, Resource, Unit };
export type Id = string;
export type Ms = number;

export type Command =
  | { type: "setEmpire"; name: string; primary: string; secondary: string } // server-issued, from POST /api/empire
  | { type: "join"; region: Id }
  | { type: "build"; region: Id; building: Building }
  | { type: "demolish"; region: Id; slot: number }
  | { type: "cancelBuild"; region: Id; index: number }
  | { type: "setMode"; region: Id; slot: number; mode: string }
  | { type: "research"; tech: string }
  | { type: "cancelResearch" }
  | { type: "train"; region: Id; count: number }
  | { type: "buildShip"; region: Id; unit: Unit; count: number }
  | { type: "launch"; from: string; to: string; units: Partial<Record<Unit, number>> }
  | { type: "colonise"; fleet: Id; region: Id }
  | { type: "invade"; fleet: Id; region: Id }
  | { type: "march"; from: Id; to: Id; count: number }
  | { type: "declareWar"; nation: Id }
  | { type: "offerPeace"; nation: Id }
  | { type: "acceptPeace"; war: Id }
  | { type: "offerTrade"; to: Id; give: Goods; get: Goods }
  | { type: "acceptTrade"; offer: Id }
  | { type: "declineTrade"; offer: Id }
  | { type: "cancelTrade"; offer: Id }
  | { type: "gift"; to: Id; goods: Goods }
  | { type: "exchange"; give: Resource; amount: number; get: Resource }
  | { type: "sendEnvoy"; nation: Id }
  | { type: "recallEnvoy"; nation: Id };

export type RejectCode =
  | "INVALID" | "NOT_JOINED" | "NOT_OWNER" | "INSUFFICIENT" | "LOCKED" | "NO_SLOT"
  | "NO_ENVOY_SLOT" | "NOT_ADJACENT" | "PROTECTED" | "NOT_AT_WAR" | "TAKEN"
  | "SEASON_OVER" | "RATE_LIMIT";

export interface Rejection { ok: false; code: RejectCode; reason: string }

export type CommandResult = { id: string; ok: true } | ({ id: string } & Rejection);

export interface Season {
  id: Id; startedAt: Ms; endsAt: Ms;
  threshold: number;
  status: "running" | "ended";
  winner?: Id;
}

export interface NationPublic {
  id: Id; name: string; primary: string; secondary: string;
  capital: Id | null;
  protectedUntil: Ms;
  boostUntil: Ms;
  eliminated: boolean;
}

export interface PlacedBuilding { slot: number; type: Building; mode?: string }

export interface Region {
  id: Id; body: string; slots: number;
  owner?: Id; rev?: number;
  buildings?: PlacedBuilding[];
  armies?: number;
}

export interface Transit { from: string; to: string; departAt: Ms; arriveAt: Ms }

export interface Fleet {
  id: Id; owner: Id; rev: number;
  units: Partial<Record<Unit, number>>;
  at?: string;
  transit?: Transit;
}

export interface War { id: Id; a: Id; b: Id; declaredAt: Ms; activeAt: Ms; peaceFrom?: Id }

export interface Score { territory: number; economy: number; tech: number; total: number }

export interface News { at: Ms; kind: string; text: string; refs: Id[] }

export interface TradeOffer { id: Id; from: Id; to: Id; give: Goods; get: Goods; expiresAt: Ms }

export interface QueueEntry { item: string; startAt: Ms; finishAt: Ms }

export interface PrivateState {
  nation: Id;
  stocks: Record<Resource, { v: number; rate: number; cap: number }>;
  efficiency: number;
  techs: string[];
  research: { tech: string; startAt: Ms; finishAt: Ms } | null;
  queues: Record<Id, QueueEntry[]>;
  trades: TradeOffer[];
  envoys: { nation: Id; since: Ms }[];
}

export interface VisibleWorld {
  nations: NationPublic[];
  regions: Region[];
  fleets: Fleet[];
  wars: War[];
  scores: Record<Id, Score>;
  presence: Id[];
  news: News[];
}
