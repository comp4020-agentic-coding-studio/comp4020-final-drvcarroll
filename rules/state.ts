// Internal world state: plain JSON, so a snapshot is JSON.stringify.
import { REGIONS, RESOURCES, SCORE, SEASON, type Goods, type Resource, type Unit } from "./data/index.ts";
import type {
  Id, Ms, NationPublic, News, PlacedBuilding, Season, TradeOffer, Transit, War,
} from "./protocol.ts";

export interface NationState extends NationPublic {
  joined: boolean;
  stocks: Record<Resource, number>; // value at State.t
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

export interface WarState extends War {
  peaceFrom?: Id;
}

export type GameEvent = { id: number; at: Ms } & (
  | { kind: "queue"; region: Id; item: Id }
  | { kind: "research"; nation: Id; tech: string }
  | { kind: "arrive"; fleet: Id }
  | { kind: "march"; nation: Id; from: Id; to: Id; count: number }
  | { kind: "rateChange" }
  | { kind: "seasonEnd" }
);

export interface State {
  season: Season;
  t: Ms;
  nextId: number;
  nations: Record<Id, NationState>;
  regions: Record<Id, RegionState>;
  fleets: Record<Id, FleetState>;
  wars: Record<Id, WarState>;
  offers: Record<Id, TradeOffer>;
  events: GameEvent[];
  news: News[];
}

export const emptyStocks = (): Record<Resource, number> =>
  Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;

export function newSeason(id: Id, startedAt: Ms): State {
  const s: State = {
    season: { id, startedAt, endsAt: startedAt + SEASON.lengthS * 1000, threshold: SCORE.threshold, status: "running" },
    t: startedAt,
    nextId: 1,
    nations: {},
    regions: Object.fromEntries(
      Object.keys(REGIONS).map((r) => [r, { id: r, owner: null, buildings: [], armies: 0, queue: [], rev: 0 }]),
    ),
    fleets: {},
    wars: {},
    offers: {},
    events: [],
    news: [],
  };
  schedule(s, { kind: "seasonEnd", at: s.season.endsAt });
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
