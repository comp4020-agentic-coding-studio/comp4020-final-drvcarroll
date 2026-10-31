# Interstellar Expansion

*Interstellar Expansion* is a real-time multiplayer 4X strategy game set across the solar system. The driving principle is simple: **survive and expand**. You start as a nation on Earth and expand however you see fit, through military might, trade, industry, technology, or any mix that suits your ideology. Resources are limited and competition is fierce.

## Motivation

I've always been a fan of science fiction, and I like to look far into the future and wonder where we're going as a species. I wanted other people to experience that too, to engage with civilisation as a whole through a long-term lens, and maybe think about how we function and, from there, why we function the way we do. To this end, I wanted to make a game that simulates civilisation on a large scale.

## Research

Plenty of games already do parts of this, and each is engaging for a reason worth borrowing:

- [Stellaris](https://www.paradoxinteractive.com/games/stellaris) builds systems that interlock so every run tells its own unscripted story [1], and setting it in space means any star system could hold anything, so not knowing pulls you forward [2].
- [Europa Universalis IV](https://www.paradoxinteractive.com/games/europa-universalis-iv) has no victory condition, so small goals like "just finish this war" escalate into continent-wide campaigns and hours disappear [3], and its real history sends players off to research and back with new strategies [4].
- [Age of Empires](https://www.ageofempires.com/games/aoe/) was play-balanced for a year to remove exploits, with Wonders as a clock that forces everyone to react [5], and its real historical theme meant "everybody got the story" [6].
- [Civilization](https://civilization.2k.com/civ/) is Sid Meier's "series of interesting decisions" [7]; every choice is a tradeoff and short, medium and long-term goals overlap [8], and each milestone hands you the next one, hence "one more turn" [9].
- [The Sims](https://www.ea.com/games/the-sims/the-sims-25th-anniv-edition) made its people deliberately flawed so the player has a reason to intervene, and recreating yourself makes it ten times more fascinating [10]; you're the author of your own experience [11].
- [Cities: Skylines](https://www.paradoxinteractive.com/games/cities-skylines) makes its problems readable (traffic jams are painted red), so once players understand the basics, optimising the city is hours of fun [12], which is Raph Koster's point that "fun is just another word for learning" [13]. Low pressure also leaves room for pure creative freedom [14].

The common thread is that the best of these are deep systems that players learn their way into; interlocking mechanics produce stories nobody wrote [1], every decision is a tradeoff between goals on different timescales [7], [8], and a readable system rewards the player for figuring it out [12], [13]. Grounding it in something real helps too, as real history gives everyone a story to latch onto [6] and sends them off to learn more [4]. Interstellar Expansion takes those ideas and adds its own twist; the space-based grand strategy games miss granularity, treating a planet as a single tile, so here every body has real regions and travel follows real orbital mechanics, and the Earth-based simulators lack scale, so here Earth is only the starting point.

## Defining "Good"

Humanity is a mosaic of unlimited desires and limited resources, stumbling forward through millennia as it expands. The game aims to emulate that expansion on a grand scale, and make players consider how a society functions and what drives it. A good game here is one where the player feels like they're at the head of a civilisation, steering something far bigger than themselves, in a world real enough to get lost in; the planets, regions and orbits are the real ones, so what they build and conquer feels tangible. They can't do it alone either, since every other player is chasing the same limited resources, so they have to trade, ally or go to war with each other, and for better or worse those interactions should play out much like they do between real nations. Nothing about how that goes is scripted. The stories come from the systems and the players, the same way history does.

The tension is realistic grandeur against digestible mechanics; a good game is complex enough for that emergent behaviour, but easy enough to learn fast.

Those ideas break down into game design goals ([game-design.md](docs/game-design.md)), which set system design goals ([system-design.md](docs/system-design.md)) to enable them. Each goal has an ADR that justifies it and says how it's evaluated, either **enforced** by a test on every push, **simulated** over seeded headless games, **measured** under load, or **judged** by playtests recorded in [checks.md](docs/checks.md).

| Game design goal | ADR |
|---|---|
| Military, economic and technological growth | [G1](docs/adr/G1.md) |
| The real solar system on a smaller scale | [G2](docs/adr/G2.md) |
| A complex economy | [G3](docs/adr/G3.md) |
| Player vs player interaction | [G4](docs/adr/G4.md) |
| Endless play | [G5](docs/adr/G5.md) |
| Aesthetic UI | [G6](docs/adr/G6.md) |

| System design goal | ADR |
|---|---|
| Compute pushed to the client | [S1](docs/adr/S1.md) |
| Persistent, traceable execution | [S2](docs/adr/S2.md) |
| Changes appear under a second | [S3](docs/adr/S3.md) |
| One stack | [S4](docs/adr/S4.md) |



## References

1. M. Pawlikowski, ["'We create the games. You create the stories.' Interview with Stephen Muray"](https://www.gamepressure.com/newsroom/interview-stephen-muray-about-stellaris-and-paradox-interactive/z65296), Gamepressure, 2023.
2. H. Dingman, ["Stellaris review: Etch your stories across the stars"](https://www.pcworld.com/article/414761/stellaris-review-etch-your-stories-across-the-stars-in-paradoxs-latest-grand-strategy-game.html), PCWorld, 2016.
3. T. Harrison, ["A Pre-Mortem Eulogy for Europa Universalis IV"](https://tripharrison.substack.com/p/a-pre-mortem-eulogy-for-europa-universalis), The Spieler, 2025.
4. R. Loban, ["Play, Encounter and Research in Europa Universalis IV"](https://gamescriticism.org/2023/07/25/i-never-asked-for-it-but-i-got-it-and-now-i-feel-that-my-knowledge-about-history-is-even-greater-play-encounter-and-research-in-europa-universalis-iv/), Journal of Games Criticism, 2022.
5. M. Pritchard, ["Postmortem: Ensemble's Age of Empires"](https://www.gamedeveloper.com/game-platforms/the-game-developer-archives-postmortem-ensemble-s-age-of-empires-), Game Developer, 1998.
6. R. Sickel and L. Alexander, ["Age of Empires: The Retrospective"](https://www.gamedeveloper.com/game-platforms/gcdc-i-age-of-empires-i-the-retrospective), Gamasutra, 2007.
7. S. Meier, ["Interesting Decisions"](https://www.gdcvault.com/play/1015756/Interesting), Game Developers Conference, 2012.
8. L. Alexander, ["Sid Meier on how to see games as sets of interesting decisions"](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions), Gamasutra, 2012.
9. D. Keller, ["Just one more turn"](https://www.gamedeveloper.com/game-platforms/just-one-more-turn---game-development-tips-and-tricks-from-the-creator-of-civilization-sid-meier-), Game Developer, 2021.
10. T. Donovan, ["The Replay Interviews: Will Wright"](https://www.gamedeveloper.com/business/the-replay-interviews-will-wright), Gamasutra, 2011.
11. W. Wiles, ["Will Wright interview"](https://www.iconeye.com/back-issues/will-wright-interview-3), ICON, 2008.
12. A. Lehto, D. Morello and K. Korppoo, ["Game Design Deep Dive: Traffic systems in Cities: Skylines"](https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-), Gamasutra, 2015.
13. R. Koster, [*A Theory of Fun for Game Design*](https://www.theoryoffun.com/), 2nd ed., O'Reilly, 2013.
14. L. Plunkett, ["Cities: Skylines: The Kotaku Review"](https://kotaku.com/cities-skylines-the-kotaku-review-1690432932), Kotaku, 2015.
