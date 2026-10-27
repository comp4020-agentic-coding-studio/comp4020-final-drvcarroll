# PRFAQ: Interstellar Expansion (Claude draft)

Draft written by Claude (Opus 5.5) on 2026-10-27 from README.md, docs/goals.md,
docs/balance-log.md, docs/checks.md and docs/measurements.md. Raw material
to argue with, not the final document.

---

## Press release

**Interstellar Expansion: a solar system you share with everyone in the room**

*A real-time strategy game where conquerors, traders, builders and
researchers all compete in one persistent solar system, and every path can win.*

CANBERRA, 9 November 2026. Strategy games usually ask you to give up a whole
evening and play against strangers' build orders. Interstellar Expansion
asks for a minute. You sign up, land in one of Earth's real regions, and
you're growing an empire in the same solar system as everyone else
who's online. There's no lobby and no match to wait for, and the world
doesn't end when you leave.

Growth is scored three ways: Territory, Economy and Tech. Each one on its
own is enough to win, so the player who never fires a shot can beat the one
who fights every war. Fleets fly real Hohmann transfer windows, so timing a
launch matters, and a rival fleet six minutes out is a real threat. You
only see what you hold or pay an Envoy to watch, so what you know about
your rivals is something you earned.

"I wanted something a room full of people could play together for one
afternoon, where the person beside you is your ally until they aren't,"
said the developer. "The solar system is the board, and how you grow is up to you."

The whole game is the map. You zoom from the full solar system down to a
country's borders like Google Maps, click a planet or fleet, and its actions
appear beside it. It runs on a laptop or a phone, and if you close the tab
and come back tomorrow, your empire is still there.

*Hypothetical player quote:* "I spent the whole game researching and never
built an Army. My neighbour conquered half of Asia, and I still won the
stage on Tech."

Play now at comp4020-final-drvcarroll.fly.dev.

---

## Customer FAQ

**How long does a game take?** It never ends. A stage closes every 20
minutes and is scored, then the next stage begins with a new global
modifier. You can play for ten minutes or come back all week.

**I joined late. Can I still win?** Anyone joining five or more minutes in
gets double production for five minutes and one minute of protection.
Honestly though, the simulations put a 30-minute joiner at 15% of the
median score, against a target of 25%. Late joiners are behind right now.

**What if I get wiped out?** You respawn on a free Earth region with the
same boost. If Earth is full, you wait until a region frees up.

**Do I need to know Stellaris or orbital mechanics?** No. The target is
that you're playing within a minute without reading anything, and every
rejected action tells you why it was rejected and what to do next.

**Does it work on my phone?** It's designed for 390×844 with touch. So far
that's been checked on an emulated phone, not a real one.

---

## Internal FAQ (the hard questions)

**Who is the customer, exactly?** The README says "a handful of friends in
one shared world". But the marker spends about 10 minutes with two people,
and at the showcase people play for 10 to 30 minutes. The design targets
something else again: a 24-nation world where Mars takes 12 to 25 minutes.
These are three different products. **In the marked scenario (2 players,
10 minutes) nobody leaves Earth.** Is the game good in that window? Nothing
in goals.md measures it.

**Is the game good with two players?** The co-presence brief says the app
should be better because others are there. With 2 of 24 nations filled,
the solar system is mostly empty and the fog means you might never meet.
Neither the sims nor the playtests cover a 2-player world.

**What evidence do we have that humans like it?** P1 and P10 are
"Judged: timed stranger run at each crit", but docs/checks.md has no
human stranger runs recorded. Every playtest is Haiku agents using
`scripts/play.ts`, a text interface. So the map UI, P10's main
claim, has never been playtested by anyone. The rubric they did return
("waiting 2.0 of 5", "fast wins 2.7") points to dead time, which the
sims measure at 4%. One of those two numbers is wrong.

**Is the scope rule doing any work?** "A feature ships only if it grows
one of the three scores." Alliances, sanctions, Envoys, trade multipliers,
tech ladders, plunder and respawn all pass it. A rule that nothing fails
doesn't constrain anything. What did it actually cut?

**Is this one strong idea?** The README sells growth with three ways to
win. The feature list asks a stranger to learn four resources, buildings,
Armies, research, orbital windows, fog, Envoys, alliances and sanctions.
The P1 target is under a minute. Which of these could go and still leave
the core idea intact?

**What are the open risks?** The researcher path wins 6% of stages (target
10 to 35%). The late joiner sits at 15% (target 25%). Voidcraft 2 is reached
in 91% of runs. Repeated playtest confusions: Replace silently removes an
only producer (5 of 6 players), research shows no time-to-afford, and
"no Spaceport" names no next step. The e2e tests time out in full runs.
And a cold start takes about 5 s on /readme/.

---

## RICE: what to do in the 13 days left

Reach = players affected, out of about 30 (showcase plus markers).
Impact: 3 massive, 2 high, 1 medium, 0.5 low. Effort is in person-days.
Score = R × I × C ÷ E.

| Candidate | R | I | C | E | Score | Note |
|---|---|---|---|---|---|---|
| Two human stranger runs, recorded in checks.md | 30 | 3 | 0.8 | 0.5 | **144** | Not a feature, but it validates P1 and P10 for everyone. The only human evidence |
| Fill gaps in rejection reasons (NO_SLOT, no Spaceport, sanction) | 30 | 2 | 0.9 | 1 | **54** | P2 already claims 100%; playtests say it isn't |
| Replace warns when it removes an only producer | 25 | 1 | 0.9 | 0.5 | **45** | Top confusion, 5 of 6 players |
| Time-to-afford on research | 20 | 1 | 0.8 | 0.5 | **32** | Repeated in two playtests |
| Real phone pass | 10 | 1 | 0.8 | 0.25 | **32** | P7 claim currently rests on emulation |
| Two-player, 10-minute scenario check | 2 | 3 | 0.6 | 0.5 | **7.2** | Low reach, but those 2 are the markers. RICE undervalues this |
| Late-joiner tuning (15% → 25%) | 15 | 2 | 0.5 | 2 | **7.5** | Three loops haven't moved it |
| Keep a machine warm (no cold start) | 5 | 1 | 0.7 | 0.25 | **14** | Only the first visitor pays it, and it breaks S2's zero-idle-work goal |
| Researcher path viability (6% → 10%) | 8 | 2 | 0.5 | 2 | **4** | Sim-only problem; confidence low |
| Spectator view for the showcase | 30 | 0.5 | 0.5 | 3 | **2.5** | Fails the scope rule anyway: grows no score |

**What RICE says:** the top four are cheap, cover nearly everyone, and are
about legibility, not balance. Balance work (late joiner, researcher) ranks
low because three loops show confidence is poor and the effort is high.
**Where RICE is wrong for this product:** reach counts players equally, but
two of them are the markers, and the 2-player/10-minute scenario is the
one that's graded. Weighting reach by "is this person marking it" moves
that row near the top.
