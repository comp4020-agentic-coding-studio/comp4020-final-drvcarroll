// system-design.md §11: one JSON line per user action to stdout, and the
// rolling numbers the /admin live view shows (goals.md S4, S7).
import type { Command } from "../rules/index.ts";

export interface Line {
  ts: number;
  user?: string;
  nation?: string;
  action: string;
  target?: string;
  result: string; // "ok", a rejection code, or an HTTP outcome
  reason?: string;
  ms?: number;
}

export interface Stats {
  at: number;
  online: string[];
  sockets: number;
  commandsPerMin: number;
  rejections: Record<string, number>;
  recent: Line[];
  tickMs: { p50: number; p99: number };
  appendMs: { p99: number };
  rssMb: number;
  heapMb: number;
}

const RECENT = 30;
const TICKS = 240; // two minutes of 500 ms ticks

// The one thing a command acts on, for the log's target field.
export function targetOf(c: Command): string | undefined {
  const x = c as Record<string, unknown>;
  for (const k of ["region", "to", "nation", "fleet", "offer", "war", "tech", "from"]) if (typeof x[k] === "string") return x[k] as string;
  return undefined;
}

export class Log {
  private recent: Line[] = [];
  private commands: number[] = [];
  private rejections: Record<string, number> = {};
  private ticks: number[] = [];
  private sink: (s: string) => void;

  constructor(sink: (s: string) => void = (s) => process.stdout.write(`${s}\n`)) {
    this.sink = sink;
  }

  write(line: Line): void {
    this.sink(JSON.stringify(line));
    this.recent = [line, ...this.recent].slice(0, RECENT);
    if (line.nation && line.ms !== undefined) { // a game command
      this.commands.push(line.ts);
      if (line.result !== "ok") this.rejections[line.result] = (this.rejections[line.result] ?? 0) + 1;
    }
  }

  tick(ms: number): void {
    this.ticks.push(ms);
    if (this.ticks.length > TICKS) this.ticks.shift();
  }

  stats(now: number, online: string[], sockets: number, appends: number[] = []): Stats {
    this.commands = this.commands.filter((t) => t > now - 60_000);
    const q = (xs: number[], p: number) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length ? Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2)) : 0;
    };
    const mem = process.memoryUsage();
    return {
      at: now, online, sockets, commandsPerMin: this.commands.length, rejections: { ...this.rejections },
      recent: this.recent, tickMs: { p50: q(this.ticks, 0.5), p99: q(this.ticks, 0.99) }, appendMs: { p99: q(appends, 0.99) },
      rssMb: Math.round(mem.rss / 2 ** 20), heapMb: Math.round(mem.heapUsed / 2 ** 20),
    };
  }
}
