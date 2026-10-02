// game-design.md §11 onboarding step 3: choose a free Earth start region,
// each showing its M, V, S. Also the respawn screen after elimination.
import { REGIONS } from "../../../rules/data/index.ts";
import { Action, Chip } from "./common.tsx";
import { myNation, world } from "../store.ts";

export function StartChooser() {
  const w = world.value!;
  const eliminated = myNation.value?.eliminated;
  const owner = (id: string) => w.regions.find((r) => r.id === id)?.owner;
  const starts = Object.values(REGIONS).filter((r) => r.start);
  const free = starts.filter((r) => !owner(r.id));
  const offEarth = Object.values(REGIONS).filter((r) => r.body !== "earth" && r.body !== "antarctica");
  return (
    <main class="narrow wide">
      <h1>{eliminated ? "Your nation has fallen" : "Choose where to begin"}</h1>
      <p>
        {eliminated
          ? "Pick a free region to return. You'll be protected for 5 minutes with double production."
          : "Every start region's Metals + Volatiles + Solar adds up to 3.3, so geography is flavour, not advantage. You start with a Power Plant, Mine, Refinery and Lab, two Armies, and five minutes of protection."}
      </p>
      <table class="starts">
        <thead>
          <tr><th>Region</th><th title="Metals">M</th><th title="Volatiles">V</th><th title="Solar">S</th><th /></tr>
        </thead>
        <tbody>
          {starts.map((r) => (
            <tr key={r.id} class={owner(r.id) ? "taken" : ""}>
              <th scope="row">{r.name}</th>
              <td>{r.m.toFixed(1)}</td>
              <td>{r.v.toFixed(1)}</td>
              <td>{r.s.toFixed(1)}</td>
              <td>{owner(r.id) ? <Chip id={owner(r.id)} /> : <Action cmd={{ type: "join", region: r.id }}>Start here</Action>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {eliminated && !free.length && (
        <section class="card">
          <h3>Earth is full: return on a colony</h3>
          <ul class="plain">
            {offEarth.map((r) => <li key={r.id}>{r.name} <Action kind="quiet" cmd={{ type: "join", region: r.id }}>Return here</Action></li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
