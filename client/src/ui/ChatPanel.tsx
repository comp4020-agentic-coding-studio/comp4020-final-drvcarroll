// game-design.md §9 Chat: Global, Alliance and one tab per direct
// conversation. Text renders as text, never HTML.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatMessage, Id } from "../../../rules/index.ts";
import { say } from "../net.ts";
import { chat, chatSeen, chatTab, drawer, me, nations, world } from "../store.ts";
import { Chip } from "./common.tsx";

const MAX = 280;

// The client's name for a message's channel: global, alliance, or the other nation.
export function tabOf(m: ChatMessage, self: Id | null): string {
  if (m.channel === "global") return "global";
  if (m.channel.startsWith("a:")) return "alliance";
  return m.channel.split(":").slice(1).find((n) => n !== self) ?? m.channel;
}

export function unread(tab?: string): number {
  const self = me.value, seen = chatSeen.value;
  return chat.value.filter((m) => m.from !== self && (!tab || tabOf(m, self) === tab) && m.id > (seen[tabOf(m, self)] ?? 0)).length;
}

export function openChat(tab = "global"): void {
  chatTab.value = tab;
  drawer.value = "chat";
}

export function ChatPanel() {
  const self = me.value;
  const inAlliance = !!world.value?.alliances.some((a) => self && a.members.includes(self));
  const directs = [...new Set(chat.value.map((m) => tabOf(m, self)).filter((t) => t !== "global" && t !== "alliance"))];
  if (!["global", "alliance"].includes(chatTab.value) && !directs.includes(chatTab.value)) directs.push(chatTab.value);
  const tabs = ["global", ...(inAlliance ? ["alliance"] : []), ...directs];
  const tab = tabs.includes(chatTab.value) ? chatTab.value : "global";
  const shown = chat.value.filter((m) => tabOf(m, self) === tab);
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const last = shown.at(-1)?.id ?? 0;
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
    if (last > (chatSeen.value[tab] ?? 0)) chatSeen.value = { ...chatSeen.value, [tab]: last };
  }, [tab, last]);
  const submit = (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    say(tab, t);
    setText("");
  };
  const label = (t: string) => (t === "global" ? "Global" : t === "alliance" ? "Alliance" : nations.value[t]?.name ?? t);
  return (
    <div class="chat">
      <div class="chat-tabs" role="tablist" aria-label="Channels">
        {tabs.map((t) => {
          const n = t === tab ? 0 : unread(t);
          return (
            <button key={t} role="tab" aria-selected={t === tab} class={t === tab ? "on" : ""} onClick={() => (chatTab.value = t)}>
              {label(t)}{n > 0 && <span class="count" aria-label={`${n} unread`}>{n}</span>}
            </button>
          );
        })}
      </div>
      <ol class="chat-log" ref={list} aria-live="polite" aria-label={`${label(tab)} messages`}>
        {shown.length === 0 && <li class="muted">No messages yet.{tab === "global" ? " Everyone in the world reads this channel." : ""}</li>}
        {shown.map((m) => (
          <li key={m.id} class={m.from === self ? "mine" : ""}>
            <Chip id={m.from} /> <time>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      <form class="chat-send" onSubmit={submit}>
        <input value={text} maxLength={MAX} aria-label={`Message ${label(tab)}`} placeholder={`Message ${label(tab)}`}
          onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <button class="primary" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
