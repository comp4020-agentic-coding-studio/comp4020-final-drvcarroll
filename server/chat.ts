// game-design.md §9 Chat; system-design.md §4, §14.3. Not a game rule: kept
// beside the command log, never in rules/ or replay.
import type { ChatMessage, ChatResult, Id, State } from "../rules/index.ts";
import type { Db } from "./db.ts";

export const CHAT = { maxLen: 280, perWindow: 5, windowMs: 10_000, onConnect: 50, kept: 200 };

// Channel ids: "global", "a:<alliance>", "d:<nation>:<nation>" (sorted).
export const direct = (a: Id, b: Id) => `d:${[a, b].sort().join(":")}`;

export function allianceOf(s: State, nation: Id): Id | undefined {
  return Object.values(s.alliances).find((a) => a.members.includes(nation))?.id;
}

export function canRead(s: State, nation: Id, channel: string): boolean {
  if (channel === "global") return true;
  if (channel.startsWith("a:")) return allianceOf(s, nation) === channel.slice(2);
  if (channel.startsWith("d:")) return channel.split(":").slice(1).includes(nation);
  return false;
}

export class Chat {
  private db: Db;
  private sent = new Map<Id, number[]>();

  constructor(db: Db) {
    this.db = db;
  }

  // Resolves the client's channel name, checks it and stores the message.
  post(s: State, nation: Id, id: string, channel: string, raw: string, at: number): ChatResult & { msg?: ChatMessage } {
    const no = (code: "INVALID" | "NOT_JOINED" | "RATE_LIMIT", reason: string) => ({ id, ok: false as const, code, reason });
    const n = s.nations[nation];
    if (!n?.joined) return no("NOT_JOINED", "Join the world to chat");
    const text = raw.trim();
    if (!text || text.length > CHAT.maxLen) return no("INVALID", `Messages are 1 to ${CHAT.maxLen} characters`);
    let ch: string;
    if (channel === "global") ch = "global";
    else if (channel === "alliance") {
      const a = allianceOf(s, nation);
      if (!a) return no("INVALID", "Join an alliance to use its channel");
      ch = `a:${a}`;
    } else if (s.nations[channel] && channel !== nation) ch = direct(nation, channel);
    else return no("INVALID", "Send to global, alliance, or a nation id like n_3");
    const recent = (this.sent.get(nation) ?? []).filter((t) => t > at - CHAT.windowMs);
    if (recent.length >= CHAT.perWindow) return no("RATE_LIMIT", `At most ${CHAT.perWindow} messages per ${CHAT.windowMs / 1000} s; wait a moment`);
    this.sent.set(nation, [...recent, at]);
    const r = this.db.prepare("INSERT INTO messages (season_id, channel, from_nation, text, at) VALUES (?, ?, ?, ?, ?)")
      .run(s.season.id, ch, nation, text, at);
    const msgId = Number(r.lastInsertRowid);
    this.db.prepare("DELETE FROM messages WHERE season_id = ? AND channel = ? AND id <= ?").run(s.season.id, ch, msgId - CHAT.kept);
    return { id, ok: true, msg: { id: msgId, channel: ch, from: nation, text, at } };
  }

  // The last messages of every channel a nation can read, oldest first.
  history(s: State, nation: Id | null): ChatMessage[] {
    if (!nation) return [];
    const rows = this.db.prepare(`
      SELECT id, channel, from_nation AS "from", text, at FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY channel ORDER BY id DESC) AS k FROM messages WHERE season_id = ?
      ) WHERE k <= ? ORDER BY id`).all(s.season.id, CHAT.onConnect) as unknown as ChatMessage[];
    return rows.filter((m) => canRead(s, nation, m.channel));
  }
}
