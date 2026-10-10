// game-design.md §12 Empires: one row per nation with rank, score, war
// status, your Envoy and your trade deals with them; the Earth Exchange last.
import { useState } from "preact/hooks";
import { ECONOMY, RESOURCES, SCORE, TRADE, WAR, type Goods, type Resource } from "../../../rules/data/index.ts";
import { mods } from "../../../rules/economy.ts";
import type { NationPublic, TradeOffer } from "../../../rules/index.ts";
import { tradeMultiplier } from "../../../rules/trade.ts";
import { dur, num } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, season, world, you } from "../store.ts";
import { Action, Chip } from "./common.tsx";
import { Amt, Goodsline, ResIcon } from "./icons.tsx";

export function EmpiresPanel() {
  const w = world.value!, y = you.value!, sz = season.value!;
  const ranked = [...w.nations].sort((a, b) => (w.scores[b.id]?.total ?? 0) - (w.scores[a.id]?.total ?? 0));
  const slots = mods(mirror.value!.nations[me.value!]).envoySlots;
  return (
    <div class="panel">
      <p class="hint">
        First to {sz.threshold} wins; Territory, Economy and Tech each count for at most {num(SCORE.categoryCap * sz.threshold)}.
        {" "}Envoys: {y.envoys.length} of {slots}{slots ? "" : " (research Signals Intelligence)"}.
      </p>
      <p class="legend"><i class="ter" /> Territory <i class="eco" /> Economy <i class="tec" /> Tech</p>
      <ol class="nations">
        {ranked.map((n, i) => <NationRow key={n.id} n={n} rank={i + 1} />)}
        <Exchange />
      </ol>
    </div>
  );
}

function NationRow({ n, rank }: { n: NationPublic; rank: number }) {
  const w = world.value!, y = you.value!, sz = season.value!, t = clock.value;
  const [trading, setTrading] = useState(false);
  const self = n.id === me.value;
  const s = w.scores[n.id] ?? { territory: 0, economy: 0, tech: 0, total: 0 };
  const war = w.wars.find((x) => (x.a === n.id && x.b === me.value) || (x.b === n.id && x.a === me.value));
  const envoy = y.envoys.some((e) => e.nation === n.id);
  const deals = y.trades.filter((o) => o.from === n.id || o.to === n.id);
  const status = self ? "you" : n.eliminated ? "eliminated" : !war ? (n.protectedUntil > t ? `protected ${dur(n.protectedUntil - t)}` : "at peace")
    : war.peaceFrom === n.id ? "offers peace" : war.peaceFrom === me.value ? "you offered peace"
    : war.activeAt > t ? `war in ${dur(war.activeAt - t)}` : "at war";
  return (
    <li class={`nation ${self ? "me" : ""} ${war && war.activeAt <= t ? "war" : ""}`}>
      <div class="n-head">
        <span class="rank">{rank}</span>
        <span><Chip id={n.id} />{w.presence.includes(n.id) && <span class="online" title="Online"> ●</span>}{sz.winner === n.id && " 🏆"}</span>
        <span class={`status ${war ? "war" : ""}`}>{status}</span>
        <b>{num(s.total)}</b>
      </div>
      <div class="bars" title={`Territory ${num(s.territory)} · Economy ${num(s.economy)} · Tech ${num(s.tech)}`}>
        <i class="ter" style={{ width: `${(s.territory / sz.threshold) * 100}%` }} />
        <i class="eco" style={{ width: `${(s.economy / sz.threshold) * 100}%` }} />
        <i class="tec" style={{ width: `${(s.tech / sz.threshold) * 100}%` }} />
      </div>
      {!self && !n.eliminated && (
        <div class="n-actions">
          {!war && <Action kind="danger" confirm={`Declare war on ${n.name}? Everyone sees it, and it goes active in ${WAR.activationS / 60} min.`} cmd={{ type: "declareWar", nation: n.id }}>Declare war</Action>}
          {war && war.peaceFrom !== n.id && <Action kind="quiet" cmd={{ type: "offerPeace", nation: n.id }}>Offer peace</Action>}
          {war?.peaceFrom === n.id && <Action cmd={{ type: "acceptPeace", war: war.id }}>Accept peace</Action>}
          {envoy
            ? <Action kind="quiet" cmd={{ type: "recallEnvoy", nation: n.id }}>Recall Envoy</Action>
            : <Action kind="quiet" cmd={{ type: "sendEnvoy", nation: n.id }}>Send Envoy <Amt res="E" v={ECONOMY.envoyUpkeepE} />/min</Action>}
          <span class="action"><button class={`quiet ${trading ? "on" : ""}`} aria-expanded={trading} onClick={() => setTrading(!trading)}>Trade</button></span>
        </div>
      )}
      {deals.length > 0 && <ul class="list deals">{deals.map((o) => <Deal key={o.id} o={o} />)}</ul>}
      {trading && <OfferForm to={n.id} />}
    </li>
  );
}

function Deal({ o }: { o: TradeOffer }) {
  const t = clock.value;
  const theirs = o.to === me.value;
  return (
    <li class="item">
      <div>
        {theirs ? "They give" : "You give"} <Goodsline goods={o.give} /> for <Goodsline goods={o.get} />
        <small>expires in {dur(o.expiresAt - t)}</small>
      </div>
      {theirs ? <>
        <Action cmd={{ type: "acceptTrade", offer: o.id }}>Accept</Action>
        <Action kind="quiet" cmd={{ type: "declineTrade", offer: o.id }}>Decline</Action>
      </> : <Action kind="quiet" cmd={{ type: "cancelTrade", offer: o.id }}>Withdraw</Action>}
    </li>
  );
}

// Six icons as one radio group: no letters, no select box.
function ResPick({ value, onChange, label }: { value: Resource; onChange: (r: Resource) => void; label: string }) {
  return (
    <span class="respick" role="radiogroup" aria-label={label}>
      {RESOURCES.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} class={value === r ? "on" : ""} onClick={() => onChange(r)}>
          <ResIcon res={r} size={18} />
        </button>
      ))}
    </span>
  );
}

function Amount({ value, onInput, label }: { value: number; onInput: (n: number) => void; label: string }) {
  return <input class="count" type="number" min={1} value={value} aria-label={label}
    onInput={(e) => onInput(Math.max(0, Number((e.target as HTMLInputElement).value) || 0))} />;
}

const one = (r: Resource, n: number): Goods => ({ [r]: n });

function OfferForm({ to }: { to: string }) {
  const s = mirror.value!;
  const [give, setGive] = useState<Resource>("M"), [giveN, setGiveN] = useState(50);
  const [get, setGet] = useState<Resource>("V"), [getN, setGetN] = useState(50);
  const mult = s.nations[to] ? tradeMultiplier(s.nations[me.value!], s.nations[to]) : 1;
  return (
    <div class="form offer">
      <label>You give <Amount value={giveN} onInput={setGiveN} label="Amount to give" /> <ResPick value={give} onChange={setGive} label="Resource to give" /></label>
      <label>You ask <Amount value={getN} onInput={setGetN} label="Amount to ask for" /> <ResPick value={get} onChange={setGet} label="Resource to ask for" /></label>
      <p class="hint">
        Both sides are escrowed on accept and land in {TRADE.earthDeliveryS}s between Earth capitals; Freighters carry them off Earth.
        {mult > 1 ? ` Envoy link: both sides arrive ×${mult.toFixed(2)}.` : ""}
      </p>
      <div class="inline">
        <Action cmd={{ type: "offerTrade", to, give: one(give, giveN), get: one(get, getN) }}>Offer</Action>
        <Action kind="quiet" cmd={{ type: "gift", to, goods: one(give, giveN) }}>Gift <Amt res={give} v={giveN} /></Action>
      </div>
    </div>
  );
}

function Exchange() {
  const [give, setGive] = useState<Resource>("E"), [n, setN] = useState(30), [get, setGet] = useState<Resource>("M");
  return (
    <li class="nation exchange">
      <div class="n-head"><span class="rank">⇄</span><b>Earth Exchange</b><small>flat {ECONOMY.exchangeRate}:1, settles at once</small></div>
      <div class="form">
        <label>Give <Amount value={n} onInput={setN} label="Amount to exchange" /> <ResPick value={give} onChange={setGive} label="Resource to give" /></label>
        <label>Get <Amt res={get} v={Number((n / ECONOMY.exchangeRate).toFixed(1))} /> <ResPick value={get} onChange={setGet} label="Resource to get" /></label>
        <div class="inline"><Action cmd={{ type: "exchange", give, amount: n, get }}>Exchange</Action></div>
      </div>
    </li>
  );
}
