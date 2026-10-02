// Shared pieces. Every action button asks the rules why it would be refused
// and says so (game-design.md §11: every disabled action says why).
import type { ComponentChildren } from "preact";
import { RESOURCE_NAMES, type Goods, type Resource } from "../../../rules/data/index.ts";
import type { Command, Id } from "../../../rules/index.ts";
import { num } from "../format.ts";
import { why } from "../mirror.ts";
import { send } from "../net.ts";
import { clock, nations, pending, stockNow } from "../store.ts";

export function Action(p: { cmd: Command; children: ComponentChildren; confirm?: string; kind?: "primary" | "quiet" | "danger" }) {
  const bad = why(p.cmd);
  const key = JSON.stringify(p.cmd);
  const busy = Object.values(pending.value).some((c) => JSON.stringify(c) === key);
  return (
    <span class="action">
      <button
        class={p.kind ?? "primary"}
        disabled={!!bad || busy}
        title={bad?.reason}
        onClick={() => (!p.confirm || confirm(p.confirm)) && send(p.cmd)}
      >
        {busy ? "…" : p.children}
      </button>
      {bad && <small class="why">{bad.reason}</small>}
    </span>
  );
}

export function Chip({ id }: { id?: Id | null }) {
  const n = id ? nations.value[id] : undefined;
  if (!n) return <span class="chip muted">{id ? "Unknown" : "Unclaimed"}</span>;
  return (
    <span class="chip">
      <i style={{ background: n.primary, borderColor: n.secondary }} />
      {n.name}
    </span>
  );
}

export function Progress({ start, end, label }: { start: number; end: number; label?: string }) {
  const f = Math.min(1, Math.max(0, (clock.value - start) / Math.max(1, end - start)));
  return (
    <div class="progress" role="progressbar" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${f * 100}%` }} />
    </div>
  );
}

// A cost, each part red when you can't cover it yet.
export function Cost({ cost }: { cost: Goods }) {
  return (
    <span class="cost">
      {(Object.entries(cost) as [Resource, number][]).map(([r, v]) => (
        <span key={r} class={stockNow(r) + 1e-9 < v ? "short" : ""} title={RESOURCE_NAMES[r]}>
          {num(v)} <abbr title={RESOURCE_NAMES[r]}>{r}</abbr>
        </span>
      ))}
    </span>
  );
}

export function Section({ title, children, hint }: { title: string; children: ComponentChildren; hint?: string }) {
  return (
    <section class="card">
      <h3>{title}</h3>
      {hint && <p class="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Count({ value, max, onInput, label }: { value: number; max: number; onInput: (n: number) => void; label: string }) {
  return (
    <input
      class="count"
      type="number"
      min={1}
      max={Math.max(1, max)}
      value={value}
      aria-label={label}
      onInput={(e) => onInput(Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 1)))}
    />
  );
}
