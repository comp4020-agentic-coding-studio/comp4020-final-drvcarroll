# Process overview

Opus 5.5 is making me question my future as a programmer. I decided to give it more freedom and a less constrictive harness, as I've seen other projects in the crits where a literal three line prompt to Opus 5.5 one-shots an extremely polished web app.

## 1. Planning

First I defined the goals ([6325c60]) aligned with the concept I wanted, a space-based game to appeal to my science fiction fantasies. The core game mechanic is expanding territory, growing the economy and discovering new technologies, basically a civilisation simulator. These goals can be broadly split into two categories: player-oriented goals, which concern the direct user experience of the game, and system-oriented goals, which concern how the system is designed to support that experience.

From there I defined the mechanics of the game ([7549419]) using `goals.md` as the core supporting document, and then the system requirements ([8745d21]) based off both the goals and the game design. Having this "ladder" of core documents to build off keeps the model aligned with the goal; LLMs are great at high level reasoning but less so at fine-grained detail, so it's worth starting wide and getting narrower with each document.

## 2. Building the plan, process and harness

A harness that's too fine grained worsens the results, so I wanted to capture the best of both worlds. Constant commits, good tests and consistent review and realignment steps are still necessary, but my `execute_plan` skill, which handed every atomic step to a fresh subagent, was probably too restrictive and worsened the code output. Thus, I gave Opus more agency, loosening the leash a little, and had it devise its own plan and build process based off `execute_plan`, swapping the rigid task list for stage gates with objective exit criteria ([297a6cf]). This build plan was also aligned with the crit due dates ([e65ad45]) to keep Opus on track and make sure those dates could be met, and committing as you go was made an explicit standing rule ([d0ab0c0]).

In place of `execute_plan` I made a simple skill called `comp4020_resume` ([b0cbb23]), which resumes the build plan by pulling in the context and progress ledger and picking up the building process from wherever it was left. The idea is that once all the foundational system design, goals and intent have been defined, I only need to run one command to continue building.

## 3. A human in the loop

While the backend and functionality were great, I find it faster to prototype iteratively, particularly for large software projects (anything more than a website with a few pages), since the details are too expansive to capture in a prompt, design document or system scaffold, at which point you may as well code it yourself. So instead I prompt, let Opus run with the skill, and interrupt whenever it's clear I haven't explained my vision or defined the goals well enough.

A clear example of this was the UI. The initial client was just a bunch of dropdown menus for the different planets ([8b7f4ae]), so I changed it to make the interactive solar system view the main interface, and had that decision recorded across all three design docs so later sessions wouldn't drift back ([604d19c]). That led to the 3D solar system with a Stellaris-style HUD ([ed41d5a]), with subtle side menus that I'm still working on designing.

[6325c60]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/6325c60
[7549419]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/7549419
[8745d21]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/8745d21
[297a6cf]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/297a6cf
[e65ad45]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/e65ad45
[d0ab0c0]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/d0ab0c0
[b0cbb23]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/b0cbb23
[8b7f4ae]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/8b7f4ae
[604d19c]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/604d19c
[ed41d5a]: https://github.com/comp4020-agentic-coding-studio/comp4020-final-drvcarroll/commit/ed41d5a
