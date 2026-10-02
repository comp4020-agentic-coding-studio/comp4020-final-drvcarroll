// Client state as signals: only what changed re-renders.
import { computed, signal } from "@preact/signals";
import type { Command, Id, NationPublic, PrivateState, Season, VisibleWorld } from "../../rules/index.ts";

export type Conn = "connecting" | "open" | "reconnecting" | "signed-out";
export interface Toast { id: number; text: string; kind: "error" | "info" }
export type Drawer = "tech" | "empires" | "trade";

export const world = signal<VisibleWorld | null>(null);
export const you = signal<PrivateState | null>(null);
export const season = signal<Season | null>(null);
export const tickAt = signal(0); // server time the last tick was computed for
export const offset = signal(0); // server clock − local clock
export const conn = signal<Conn>("connecting");
export const pending = signal<Record<string, Command>>({});
export const toasts = signal<Toast[]>([]);
export const clock = signal(Date.now()); // server time now, refreshed a few times a second

export const selBody = signal<string | null>(null);
export const selRegion = signal<Id | null>(null);
export const selFleet = signal<Id | null>(null);
export const launchTo = signal<string | null>(null); // set by clicking a body while a fleet is selected
export const drawer = signal<Drawer | null>(null);

export const me = computed(() => you.value?.nation ?? null);
export const nations = computed(() => Object.fromEntries((world.value?.nations ?? []).map((n) => [n.id, n])) as Record<Id, NationPublic>);
export const myNation = computed(() => (me.value ? nations.value[me.value] : undefined));
export const joined = computed(() => !!myNation.value && !myNation.value.eliminated);

// A stock as drawn between ticks: v + rate × elapsed, clamped to [0, cap].
export function stockNow(r: keyof PrivateState["stocks"]): number {
  const s = you.value?.stocks[r];
  if (!s) return 0;
  return Math.min(s.cap, Math.max(0, s.v + (s.rate * (clock.value - tickAt.value)) / 60_000));
}

let toastId = 0;
export function toast(text: string, kind: Toast["kind"] = "info"): void {
  const t = { id: ++toastId, text, kind };
  toasts.value = [...toasts.value.slice(-4), t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x !== t)), kind === "error" ? 6000 : 3000);
}

setInterval(() => (clock.value = Date.now() + offset.value), 250);
