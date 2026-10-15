// game-design.md §12 Empires: one row per nation with rank, score, war
// status, your Envoy and your trade deals with them; the Earth Exchange last.
import { useState } from "preact/hooks";
import { ECONOMY, RESOURCES, STAGES, TRADE, WAR, type Goods, type Resource } from "../../../rules/data/index.ts";
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
  const gain = (id: string) => (w.scores[id]?.total ?? 0) - (sz.base[id] ?? 0);
  const ranked = [...w.nations].sort((a, b) => gain(b.id) - gain(a.id) || (w.scores[b.id]?.total ?? 0) - (w.scores[a.id]?.total ?? 0));
  const slots = mods(mirror.value!.nations[me.value!], sz.stage).envoySlots;
  const st = STAGES[Math.min(sz.stage, STAGES.length) - 1];
  return (
    <div class="panel">
      <p class="hint">
        <b>Stage {sz.stage}: {st.name}</b> ({st.desc}), {dur(sz.stageEndsAt - clock.value)} left. Ranked by score gained this stage.
        {" "}Envoys: {y.envoys.length} of {slots}{slots ? "" : " (research Signals Intelligence)"}.
      </p>
      <AllianceRow />
      <p class="legend"><i class="ter" /> Territory <i class="eco" /> Economy <i class="tec" /> Tech</p>
      <ol class="nations">
        {ranked.map((n, i) => <NationRow key={n.id} n={n} rank={i + 1} gain={gain(n.id)} />)}
        <Exchange />
      </ol>
      <PastStages />
    </div>
  );
}

// game-design.md §9: your alliance, its sanctions, and invites to you.
function AllianceRow() {
  const w = world.value!;
  const mine = w.alliances.find((a) => a.members.includes(me.value!));
  const invites = w.alliances.filter((a) => a.invites.includes(me.value!));
  if (!mine && !invites.length) return null;
  return (
    <section class="alliance" aria-label="Alliance">
      {mine && mine.members.length > 1 && (
        <div class="item">
          <div><b>Your alliance</b> {mine.members.map((m) => <Chip key={m} id={m} />)}
            {mine.invites.length > 0 && <small>Invited: {mine.invites.map((m) => <Chip key={m} id={m} />)}</small>}
            {mine.sanctions.length > 0 && <small>Sanctions: {mine.sanctions.map((m) => <Chip key={m} id={m} />)}</small>}</div>
          <Action kind="quiet" confirm="Leave your alliance?" cmd={{ type: "leaveAlliance" }}>Leave</Action>
        </div>
      )}
      {invites.map((a) => (
        <div key={a.id} class="item invite">
          <div><b>Alliance invitation</b> {a.members.map((m) => <Chip key={m} id={m} />)}
            <small>Joining makes peace with every member.</small></div>
          <Action cmd={{ type: "acceptAlly", alliance: a.id }}>Join</Action>
          <Action kind="quiet" cmd={{ type: "declineAlly", alliance: a.id }}>Decline</Action>
        </div>
      ))}
    </section>
  );
}

// game-design.md §10: past stage winners, newest first.
function PastStages() {
  const sz = season.value!;
  if (!sz.winners.length) return null;
  return (
    <section class="stages" aria-label="Past stages">
      <h3>Stages</h3>
      <ol class="list tight">
        {[...sz.winners].reverse().map((x) => (
          <li key={x.stage} class="item">
            <div><b>Stage {x.stage}</b> <small>{STAGES[Math.min(x.stage, STAGES.length) - 1].name}</small></div>
            {x.ranking.map((r, i) => <span key={r.nation}>{["🥇", "🥈", "🥉"][i]} <Chip id={r.nation} /> +{num(r.gain)}</span>)}
          </li>
        ))}
      </ol>
    </section>
  );
}

function NationRow({ n, rank, gain }: { n: NationPublic; rank: number; gain: number }) {
  const w = world.value!, y = you.value!, sz = season.value!, t = clock.value;
  const [trading, setTrading] = useState(false);
  const self = n.id === me.value;
  const s = w.scores[n.id] ?? { territory: 0, economy: 0, tech: 0, total: 0 };
  const top = Math.max(1, ...Object.values(w.scores).map((x) => x.total)); // bars scale to the leader
  const war = w.wars.find((x) => (x.a === n.id && x.b === me.value) || (x.b === n.id && x.a === me.value));
  const envoy = y.envoys.some((e) => e.nation === n.id);
  const deals = y.trades.filter((o) => o.from === n.id || o.to === n.id);
  const ally = w.alliances.find((a) => a.members.includes(me.value!));
  const allied = !!ally?.members.includes(n.id);
  const sanctioned = !!ally?.sanctions.includes(n.id) || w.alliances.some((a) => a.members.includes(n.id) && a.sanctions.includes(me.value!));
  const status = self ? "you" : n.eliminated ? "eliminated" : allied ? "allied" : !war ? (n.protectedUntil > t ? `protected ${dur(n.protectedUntil - t)}` : "at peace")
    : war.peaceFrom === n.id ? "offers peace" : war.peaceFrom === me.value ? "you offered peace"
    : war.activeAt > t ? `war in ${dur(war.activeAt - t)}` : "at war";
  return (
    <li class={`nation ${self ? "me" : ""} ${war && war.activeAt <= t ? "war" : ""}`}>
      <div class="n-head">
        <span class="rank">{rank}</span>
        <span><Chip id={n.id} />{w.presence.includes(n.id) && <span class="online" title="Online"> ●</span>}{sz.winners.at(-1)?.ranking[0]?.nation === n.id && <span title="Won the last stage"> 🏆</span>}</span>
        <span class={`status ${war ? "war" : ""}`}>{status}</span>
        <b title="Gained this stage">+{num(gain)}</b>
      </div>
      <div class="bars" title={`Score ${num(s.total)}: Territory ${num(s.territory)} · Economy ${num(s.economy)} · Tech ${num(s.tech)}`}>
        <i class="ter" style={{ width: `${(s.territory / top) * 100}%` }} />
        <i class="eco" style={{ width: `${(s.economy / top) * 100}%` }} />
        <i class="tec" style={{ width: `${(s.tech / top) * 100}%` }} />
      </div>
      {!self && !n.eliminated && (
        <div class="n-actions">
          {!allied && !ally?.invites.includes(n.id) && <Action kind="quiet" cmd={{ type: "inviteAlly", nation: n.id }}>Invite to alliance</Action>}
          {ally && !allied && (ally.sanctions.includes(n.id)
            ? <Action kind="quiet" cmd={{ type: "liftSanction", nation: n.id }}>Lift sanction</Action>
            : <Action kind="danger" confirm={`Sanction ${n.name}? No trade between your alliance and them.`} cmd={{ type: "sanction", nation: n.id }}>Sanction</Action>)}
          {!war && !allied && <Action kind="danger" confirm={`Declare war on ${n.name}? Everyone sees it, and it goes active in ${WAR.activationS / 60} min.`} cmd={{ type: "declareWar", nation: n.id }}>Declare war</Action>}
          {war && war.peaceFrom !== n.id && <Action kind="quiet" cmd={{ type: "offerPeace", nation: n.id }}>Offer peace</Action>}
          {war?.peaceFrom === n.id && <Action cmd={{ type: "acceptPeace", war: war.id }}>Accept peace</Action>}
          {envoy
            ? <Action kind="quiet" cmd={{ type: "recallEnvoy", nation: n.id }}>Recall Envoy</Action>
            : <Action kind="quiet" cmd={{ type: "sendEnvoy", nation: n.id }}>Send Envoy <Amt res="E" v={ECONOMY.envoyUpkeepE} />/min</Action>}
          {!sanctioned && <span class="action"><button class={`quiet ${trading ? "on" : ""}`} aria-expanded={trading} onClick={() => setTrading(!trading)}>Trade</button></span>}
          {sanctioned && <small class="warn">Under sanction: no trade</small>}
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
