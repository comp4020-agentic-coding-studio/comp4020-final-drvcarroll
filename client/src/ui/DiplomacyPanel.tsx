// game-design.md §7 war rules and §11 Envoys.
import { ECONOMY, WAR } from "../../../rules/data/index.ts";
import { mods } from "../../../rules/economy.ts";
import { dur, num, regionName } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, world, you } from "../store.ts";
import { Action, Chip, Section } from "./common.tsx";

export function DiplomacyPanel() {
  const w = world.value!, y = you.value!, t = clock.value;
  const others = w.nations.filter((n) => n.id !== me.value);
  const slots = mods(mirror.value!.nations[me.value!]).envoySlots;
  const warWith = (id: string) => w.wars.find((x) => (x.a === id && x.b === me.value) || (x.b === id && x.a === me.value));
  const online = new Set(w.presence);
  return (
    <div class="panel">
      <h2>Diplomacy</h2>
      <p class="hint">
        War is declared publicly and goes active {WAR.activationS / 60} min later. New and respawned nations are protected for {WAR.protectionS / 60} min.
        Peace takes both sides. An Envoy (Science: Signals Intelligence) shows a nation's territory, garrisons and fleets everywhere, never its buildings,
        for {ECONOMY.envoyUpkeepE} Energy/min, and boosts trade with it.
      </p>
      <Section title={`Envoys (${y.envoys.length} of ${slots} slots)`} hint={y.envoys.length ? undefined : slots ? "None sent." : "Research Signals Intelligence to send one."}>
        <ul class="rows">
          {y.envoys.map((e) => <li key={e.nation}><span><Chip id={e.nation} /> <small>since {dur(t - e.since)} ago</small></span><Action kind="quiet" cmd={{ type: "recallEnvoy", nation: e.nation }}>Recall</Action></li>)}
        </ul>
      </Section>
      <Section title="Nations" hint={others.length ? undefined : "Nobody else has joined this season yet."}>
        <ul class="rows nations">
          {others.map((n) => {
            const war = warWith(n.id);
            const envoy = y.envoys.some((e) => e.nation === n.id);
            return (
              <li key={n.id}>
                <span>
                  <Chip id={n.id} /> {online.has(n.id) && <span class="online" title="Online">●</span>}
                  <small>
                    capital {n.capital ? regionName(n.capital) : "none"} · score {num(w.scores[n.id]?.total ?? 0)}
                    {n.eliminated ? " · eliminated" : ""}
                    {n.protectedUntil > t ? ` · protected ${dur(n.protectedUntil - t)}` : ""}
                    {war ? (war.activeAt > t ? ` · war in ${dur(war.activeAt - t)}` : " · at war") : ""}
                    {war?.peaceFrom === n.id ? " · offers peace" : war?.peaceFrom === me.value ? " · you offered peace" : ""}
                  </small>
                </span>
                {!war && <Action kind="danger" confirm={`Declare war on ${n.name}? Everyone will see it.`} cmd={{ type: "declareWar", nation: n.id }}>Declare war</Action>}
                {war && war.peaceFrom !== n.id && <Action kind="quiet" cmd={{ type: "offerPeace", nation: n.id }}>Offer peace</Action>}
                {war?.peaceFrom === n.id && <Action cmd={{ type: "acceptPeace", war: war.id }}>Accept peace</Action>}
                {envoy
                  ? <Action kind="quiet" cmd={{ type: "recallEnvoy", nation: n.id }}>Recall Envoy</Action>
                  : <Action kind="quiet" cmd={{ type: "sendEnvoy", nation: n.id }}>Send Envoy</Action>}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
