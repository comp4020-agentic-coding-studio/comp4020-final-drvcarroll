// game-design.md §9: alliances force peace, fight as one side, sanction.
import { ALLIANCE } from "./data/index.ts";
import { isRejection, no, type Handler } from "./check.ts";
import type { Alliance, Id, Rejection } from "./protocol.ts";
import { newId, news, type NationState, type State } from "./state.ts";

export const allianceOf = (s: State, n: Id): Alliance | undefined =>
  Object.values(s.alliances).find((a) => a.members.includes(n));

export const allied = (s: State, a: Id, b: Id) => a !== b && !!allianceOf(s, a)?.members.includes(b);

// Trade between a member and a nation its alliance sanctions is barred.
export function sanctioned(s: State, a: Id, b: Id): Rejection | null {
  const by = [allianceOf(s, a), allianceOf(s, b)].find((x, i) => x?.sanctions.includes(i ? a : b));
  if (!by) return null;
  const target = s.nations[by.members.includes(a) ? b : a];
  return no("SANCTIONED", `Your alliance and ${target.name} are under sanction`);
}

function nation(s: State, n: NationState, id: Id): Rejection | NationState {
  const t = s.nations[id];
  if (!t?.joined || t.id === n.id) return no("INVALID", "Unknown nation");
  if (t.eliminated) return no("INVALID", `${t.name} has been eliminated`);
  return t;
}

const names = (s: State, a: Alliance) => a.members.map((m) => s.nations[m].name).join(", ");

export const inviteAlly: Handler<"inviteAlly"> = (s, n, c) => {
  const t = nation(s, n, c.nation);
  if (isRejection(t)) return t;
  const mine = allianceOf(s, n.id);
  if (mine?.members.includes(t.id)) return no("ALLIED", `${t.name} is already your ally`);
  if (allianceOf(s, t.id)) return no("INVALID", `${t.name} is already in an alliance`);
  if (mine?.sanctions.includes(t.id)) return no("SANCTIONED", `Your alliance sanctions ${t.name}`);
  if (mine?.invites.includes(t.id)) return no("INVALID", `${t.name} is already invited`);
  if ((mine?.members.length ?? 1) >= ALLIANCE.maxMembers) return no("INVALID", `An alliance holds at most ${ALLIANCE.maxMembers}`);
  return () => {
    let a = mine;
    if (!a) {
      const id = newId(s, "a");
      a = s.alliances[id] = { id, members: [n.id], sanctions: [], invites: [] };
    }
    a.invites.push(t.id);
  };
};

export const acceptAlly: Handler<"acceptAlly"> = (s, n, c) => {
  const a = s.alliances[c.alliance];
  if (!a?.invites.includes(n.id)) return no("INVALID", "No invitation from that alliance");
  if (allianceOf(s, n.id)) return no("INVALID", "Leave your alliance first");
  if (a.members.length >= ALLIANCE.maxMembers) return no("INVALID", `An alliance holds at most ${ALLIANCE.maxMembers}`);
  if (a.sanctions.includes(n.id)) return no("SANCTIONED", "That alliance sanctions you");
  return () => {
    a.invites = a.invites.filter((x) => x !== n.id);
    a.members.push(n.id);
    for (const w of Object.values(s.wars)) {
      const other = w.a === n.id ? w.b : w.b === n.id ? w.a : null;
      if (other && a.members.includes(other)) delete s.wars[w.id];
    }
    news(s, "alliance", `${n.name} joins an alliance: ${names(s, a)}`, [...a.members]);
  };
};

export const declineAlly: Handler<"declineAlly"> = (s, n, c) => {
  const a = s.alliances[c.alliance];
  if (!a?.invites.includes(n.id)) return no("INVALID", "No invitation from that alliance");
  return () => {
    a.invites = a.invites.filter((x) => x !== n.id);
    if (a.members.length < 2 && !a.invites.length) delete s.alliances[a.id];
  };
};

export const leaveAlliance: Handler<"leaveAlliance"> = (s, n) => {
  const a = allianceOf(s, n.id);
  if (!a) return no("INVALID", "You aren't in an alliance");
  return () => leave(s, a, n.id);
};

// Out of the alliance; one left (or none) and it dissolves.
export function leave(s: State, a: Alliance, id: Id): void {
  a.members = a.members.filter((x) => x !== id);
  news(s, "alliance", `${s.nations[id].name} leaves its alliance`, [id, ...a.members]);
  if (a.members.length < 2) delete s.alliances[a.id];
}

export const sanction: Handler<"sanction"> = (s, n, c) => {
  const t = nation(s, n, c.nation);
  if (isRejection(t)) return t;
  const a = allianceOf(s, n.id);
  if (!a || a.members.length < 2) return no("INVALID", "Only an alliance can sanction");
  if (a.members.includes(t.id)) return no("ALLIED", `${t.name} is in your alliance`);
  if (a.sanctions.includes(t.id)) return no("INVALID", `Your alliance already sanctions ${t.name}`);
  return () => {
    a.sanctions.push(t.id);
    a.invites = a.invites.filter((x) => x !== t.id);
    for (const o of Object.values(s.offers)) {
      if ((a.members.includes(o.from) && o.to === t.id) || (a.members.includes(o.to) && o.from === t.id)) delete s.offers[o.id];
    }
    news(s, "sanction", `${names(s, a)} sanction ${t.name}`, [t.id, ...a.members]);
  };
};

export const liftSanction: Handler<"liftSanction"> = (s, n, c) => {
  const a = allianceOf(s, n.id);
  if (!a?.sanctions.includes(c.nation)) return no("INVALID", "Your alliance doesn't sanction them");
  return () => {
    a.sanctions = a.sanctions.filter((x) => x !== c.nation);
    news(s, "sanction", `${names(s, a)} lift the sanction on ${s.nations[c.nation].name}`, [c.nation, ...a.members]);
  };
};
