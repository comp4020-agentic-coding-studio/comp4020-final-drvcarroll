// Internal world state: plain JSON, so a snapshot is JSON.stringify.
import { REGIONS, RESOURCES, SEASON, type Goods, type Resource, type Unit } from "./data/index.ts";
import type {
  Alliance, Battle, Id, Ms, NationPublic, News, PlacedBuilding, Season, TradeOffer, Transit, War,
} from "./protocol.ts";

export interface NationState extends NationPublic {
  joined: boolean;
  stocks: Record<Resource, number>; // value at State.stocksAt
  techs: string[];
  research: { tech: string; startAt: Ms; finishAt: Ms; paid: number } | null;
  envoys: { nation: Id; since: Ms }[];
}

export interface QueueItem {
  id: Id;
  item: string; // a Building, or a Unit
  startAt: Ms;
  finishAt: Ms;
  paid: Goods;
  slot?: number; // pinned by replace
}

export interface RegionState {
  id: Id;
  owner: Id | null;
  buildings: PlacedBuilding[];
  armies: number;
  queue: QueueItem[];
  rev: number;
}

export interface FleetState {
  id: Id;
  owner: Id;
  units: Partial<Record<Unit, number>>;
  at?: string;
  transit?: Transit;
  colonise?: Id; // region to claim on arrival
  rev: number;
}

export type WarState = War;

export type GameEvent = { id: number; at: Ms } & (
  | { kind: "queue"; region: Id; item: Id }
  | { kind: "research"; nation: Id; tech: string }
  | { kind: "arrive"; fleet: Id }
  | { kind: "march"; nation: Id; from: Id; to: Id; count: number }
  | { kind: "warActive"; war: Id }
  | { kind: "battle"; region: Id }
  | { kind: "deliver"; to: Id; goods: Goods }
  | { kind: "offerExpire"; offer: Id }
  | { kind: "rateChange" }
  | { kind: "stageEnd" }
);

export interface State {
  season: Season;
  t: Ms;
  stocksAt: Ms; // stocks are valid here: the last event or command, never a bare tick
  nextId: number;
  nations: Record<Id, NationState>;
  regions: Record<Id, RegionState>;
  fleets: Record<Id, FleetState>;
  wars: Record<Id, WarState>;
  battles: Record<Id, Battle>; // by region
  alliances: Record<Id, Alliance>;
  offers: Record<Id, TradeOffer>;
  events: GameEvent[];
  news: News[];
}

export const emptyStocks = (): Record<Resource, number> =>
  Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;

export function newSeason(id: Id, startedAt: Ms): State {
  const s: State = {
    season: { id, startedAt, status: "running", stage: 1, stageEndsAt: startedAt + SEASON.stageS * 1000, base: {}, winners: [] },
    t: startedAt,
    stocksAt: startedAt,
    nextId: 1,
    nations: {},
    regions: Object.fromEntries(
      Object.keys(REGIONS).map((r) => [r, { id: r, owner: null, buildings: [], armies: 0, queue: [], rev: 0 }]),
    ),
    fleets: {},
    wars: {},
    battles: {},
    alliances: {},
    offers: {},
    events: [],
    news: [],
  };
  schedule(s, { kind: "stageEnd", at: s.season.stageEndsAt });
  return s;
}

type EventBody = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "id"> : never) : never;

export function schedule(s: State, e: EventBody): void {
  s.events.push({ ...e, id: s.nextId++ } as GameEvent);
}

export const newId = (s: State, prefix: string): Id => `${prefix}_${s.nextId++}`;

export function news(s: State, kind: string, text: string, refs: Id[]): void {
  s.news.push({ at: s.t, kind, text, refs });
  if (s.news.length > SEASON.newsKept) s.news.shift();
}

export const touch = (x: { rev: number }) => void x.rev++;
