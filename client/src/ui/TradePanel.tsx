// game-design.md §9: offers, gifts, the Earth Exchange, the Trade Multiplier.
import { useState } from "preact/hooks";
import { ECONOMY, RESOURCES, RESOURCE_NAMES, TRADE, type Goods, type Resource } from "../../../rules/data/index.ts";
import { tradeMultiplier } from "../../../rules/trade.ts";
import { dur, goods, num } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, world, you } from "../store.ts";
import { Action, Chip, Section } from "./common.tsx";

function ResPick({ value, onChange, label }: { value: Resource; onChange: (r: Resource) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as Resource)}>
      {RESOURCES.map((r) => <option key={r} value={r}>{RESOURCE_NAMES[r]}</option>)}
    </select>
  );
}

function Amount({ value, onInput, label }: { value: number; onInput: (n: number) => void; label: string }) {
  return <input class="count" type="number" min={1} value={value} aria-label={label}
    onInput={(e) => onInput(Math.max(0, Number((e.target as HTMLInputElement).value) || 0))} />;
}

export function TradePanel() {
  const w = world.value!, y = you.value!, t = clock.value;
  const others = w.nations.filter((n) => n.id !== me.value && !n.eliminated);
  const s = mirror.value!;
  const mult = (id: string) => (s.nations[id] ? tradeMultiplier(s.nations[me.value!], s.nations[id]) : 1);
  const incoming = y.trades.filter((o) => o.to === me.value);
  const outgoing = y.trades.filter((o) => o.from === me.value);

  const [to, setTo] = useState(others[0]?.id ?? "");
  const [give, setGive] = useState<Resource>("M"), [giveN, setGiveN] = useState(50);
  const [get, setGet] = useState<Resource>("V"), [getN, setGetN] = useState(50);
  const [xGive, setXGive] = useState<Resource>("E"), [xN, setXN] = useState(30), [xGet, setXGet] = useState<Resource>("M");
  const target = others.find((n) => n.id === to)?.id ?? others[0]?.id;
  const g = (r: Resource, n: number): Goods => ({ [r]: n });

  return (
    <div class="panel">
      <p class="hint">
        Accepting an offer escrows both sides at once; goods land in {TRADE.earthDeliveryS}s between Earth capitals (Freighters carry them off Earth).
        An Envoy with the other side multiplies both deliveries by 1 + {TRADE.envoyMultiplierPerScience} × Science rungs.
      </p>
      <Section title="Offers to you" hint={incoming.length ? undefined : "None right now."}>
        <ul class="rows">
          {incoming.map((o) => (
            <li key={o.id}>
              <span><Chip id={o.from} /> gives <b>{goods(o.give)}</b> for <b>{goods(o.get)}</b>
                <small>expires in {dur(o.expiresAt - t)}{mult(o.from) > 1 ? ` · ×${mult(o.from).toFixed(2)} via Envoy` : ""}</small>
              </span>
              <Action cmd={{ type: "acceptTrade", offer: o.id }}>Accept</Action>
              <Action kind="quiet" cmd={{ type: "declineTrade", offer: o.id }}>Decline</Action>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Your offers" hint={outgoing.length ? undefined : "None open."}>
        <ul class="rows">
          {outgoing.map((o) => (
            <li key={o.id}>
              <span>To <Chip id={o.to} />: <b>{goods(o.give)}</b> for <b>{goods(o.get)}</b><small>expires in {dur(o.expiresAt - t)}</small></span>
              <Action kind="quiet" cmd={{ type: "cancelTrade", offer: o.id }}>Withdraw</Action>
            </li>
          ))}
        </ul>
      </Section>
      {target ? (
        <Section title="Make an offer or a gift">
          <div class="form">
            <label>To <select value={target} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
              {others.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select></label>
            <label>You give <Amount value={giveN} onInput={setGiveN} label="Amount to give" /> <ResPick value={give} onChange={setGive} label="Resource to give" /></label>
            <label>You ask for <Amount value={getN} onInput={setGetN} label="Amount to ask for" /> <ResPick value={get} onChange={setGet} label="Resource to ask for" /></label>
            {mult(target) > 1 && <p class="hint">Envoy link: both sides arrive ×{mult(target).toFixed(2)}.</p>}
            <div class="inline">
              <Action cmd={{ type: "offerTrade", to: target, give: g(give, giveN), get: g(get, getN) }}>Offer</Action>
              <Action kind="quiet" cmd={{ type: "gift", to: target, goods: g(give, giveN) }}>Gift {num(giveN)} {RESOURCE_NAMES[give]}</Action>
            </div>
          </div>
        </Section>
      ) : <Section title="Make an offer"><p class="hint">Nobody else to trade with yet. The Earth Exchange always is.</p></Section>}
      <Section title="Earth Exchange" hint={`An NPC market at a flat ${ECONOMY.exchangeRate}:1, settled at once.`}>
        <div class="form">
          <label>Give <Amount value={xN} onInput={setXN} label="Amount to exchange" /> <ResPick value={xGive} onChange={setXGive} label="Resource to give" /></label>
          <label>Get <b>{num(xN / ECONOMY.exchangeRate, 1)}</b> <ResPick value={xGet} onChange={setXGet} label="Resource to get" /></label>
          <Action cmd={{ type: "exchange", give: xGive, amount: xN, get: xGet }}>Exchange</Action>
        </div>
      </Section>
    </div>
  );
}
