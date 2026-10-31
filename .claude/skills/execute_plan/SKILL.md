---
name: execute_plan
description: Turn a software design/plan document into a sequence of small, independently executable implementation steps, then execute those steps sequentially using a fresh subagent for every step. The purpose of this skill is to reduce context accumulation and long-task drift. The parent model owns the plan and orchestration. A new implementation subagent is created for every atomic step.  Subagents do not inherit the conversational context of previous steps; they reconstruct their working context from the repository, the plan, the source specification, the relevant CLAUDE.md files, and the step brief supplied by the parent.
---

## Core principle

A step is not complete when the code works. A step is complete only when it has been:
1. scaffolded,
2. implemented,
3. optimised,
4. reviewed against the code,
5. reviewed against the specification and plan,
6. reviewed against the design principles,
7. checked, visually inspected, and committed,
8. and used to re-align the remaining plan.

The review loop is mandatory and must never be skipped.
The loop is autonomous. It is not a request for human review or approval.

## Phase 1 — Understand the project

Before decomposing or implementing anything:
- Inspect the repository.
- Identify the project's package manager and commands.
- Locate all relevant CLAUDE.md files.
- Locate the source design/plan document supplied to this skill.
- Locate existing BUILD_PLAN.md, if present.
- Locate the project's design principles or equivalent architectural guidance.
- Identify relevant scripts, tests, check commands, build commands, and visual/rendering commands.
- Understand the existing architecture sufficiently to avoid creating steps that conflict with it.
- CLAUDE.md files are hierarchical. A CLAUDE.md closer to a file's directory takes precedence for work in that subtree, while broader instructions remain relevant.

The parent model must gather the applicable instructions for each planned step.

## Phase 2 — Convert the design into atomic steps

Read the entire source design/plan before creating the execution plan.

Create or update the `BUILD_PLAN.md` document. This plan must describe the implementation as a sequence of atomic, ordered steps. An atomic step should represent one coherent unit of work that can be implemented, reviewed, visually inspected, and committed independently.

A step should be small enough that a fresh model can understand its entire scope without reconstructing the whole project.

Step format

Every step in BUILD_PLAN.md should contain:
- The Goal of the step
- The scope regarding affected entities in the software
- Relevant dependencies and specification
- Inputs 
- Outputs 
- Acceptance: Observable behaviour that proves the step is complete 
- Constraints 
- Testing methodlogy 

## Phase 3 — Execute steps sequentially

The parent model must execute BUILD_PLAN.md from top to bottom.

**For every step:**
1. Create a new subagent. Do not reuse the previous implementation subagent. Do not run multiple implementation subagents in parallel.The fresh subagent must receive:
       - the exact current step from BUILD_PLAN.md,
       - the mandatory execution loop in this document,
       - the relevant source specification/plan sections,
       - the relevant design principles,
       - the CLAUDE.md file,
       - relevant project scripts and commands,
       - the current repository state,
       - any review notes already present in the step's ephemeral scaffold,
       - the requirement that it owns the entire step through commit.
       - The subagent must not be asked to rediscover the entire task from the original conversation.
       - Its context should be deliberately bounded to the current step.

Conceptually:

```
Parent
  |
  +-- Step 1 -> fresh subagent -> complete loop -> commit
  |
  +-- Step 2 -> fresh subagent -> complete loop -> commit
  |
  +-- Step 3 -> fresh subagent -> complete loop -> commit
  |
  +-- ...
```

The parent waits for a step to finish before creating the next subagent.

### Mandatory per-step execution loop 

Every step runs the following loop. The loop is never skipped. Steps 3–6 are review passes. Each review pass either:
- finds nothing and falls through to the next pass, or
- finds one or more issues, writes them to the ephemeral scaffold file, and returns to step 1.
- A review finding therefore causes a complete re-scaffold and re-implementation cycle.
- The step is not finished merely because tests pass.

1. **Design scaffold**
Before changing implementation code, plan the step in detail. Read any review notes left by an earlier pass through this loop. Those notes are inputs to the new scaffold. The scaffold must describe the implementation from, when necessary:
- high-level architecture,
- module boundaries,
- data flow,
- state ownership,
- interfaces,
- exact files,
- exact functions,
- exact types,
- exact components,
- important control flow,
- testing implications.

The scaffold must be concrete enough that implementation is largely mechanical. Write the scaffold to an ephemeral working file. Do not commit the scaffold.

2. **Implement**
Implement the scaffold.

After implementation, run:
```
pnpm check
```
Do not proceed to review passes while the project is in a non-compiling or otherwise failing check state.
Fix problems introduced by this step until:
```
pnpm check
```
is green.
A review pass over code that does not compile is wasted effort.

3. **Optimise**
Review what was just implemented for unnecessary work, duplication, and inefficiency.
Look specifically for:
- work recomputed that could be derived once,
- repeated computation that could be cached or hoisted,
- duplicated entities or times 
- unnecessary allocations,
- algorithms doing more work than the problem requires,
- abstractions that add machinery without reducing complexity,
- additions where a modification was required,
- unnecessary renders, effects, network or filesystem operations,

Do not optimise merely for theoretical performance. Prefer simple, materially better designs.

If there are findings in this phase:
- write every finding to the ephemeral scaffold file,
- return to Step 1 (Design Scaffold),
- revise the scaffold,
- implement the revised scaffold,
- run pnpm check,
- repeat the loop.

If there are no findings, continue to Step 4.

4. **Review the code**
Review the implementation as code.
Judge:

- clarity,
- maintainability,
- readability,
- structure,
- whether the implementation works for the reasons the tests claim it works,
- whether the tests merely happen to cover the implementation's current behaviour,
- whether the code can be read end to end by someone who did not write it.

Look for correctness that is not captured by tests.

**IMPORTANT**: Comments must be one line, concise and descriptive. Do not add elaborate explanatory comments when the code can be made clearer instead.
If findings exist:

If there are findings in this phase:
- write every finding to the ephemeral scaffold file,
- return to Step 1 (Design Scaffold),
- revise the scaffold,
- implement the revised scaffold,
- run pnpm check,
- repeat the loop.

Else continue to Step 5.

5. **Write Tests**
Write unit tests that will ensure the code functions correctly as per the `BUILD.md` plan. Tests should not only check for fine grained logic, but overall execution flow of the program. 

Write only one test file per code file maximum. 

After writing the tests, run them. Ensure all tests pass because the code is correct, not becasue the tests are built for the code.

5. **Review the design principles**
Walk the project's Design principles section against the actual implementation, and judge the code that now exists
Do not treat the principles as aspirational prose.

Also review the general interface rules at the end of the design principles.

If there are findings in this phase:
- write every finding to the ephemeral scaffold file,
- return to Step 1 (Design Scaffold),
- revise the scaffold,
- implement the revised scaffold,
- run pnpm check,
- repeat the loop.
If there are no findings, continue to Step 6.

6. **Check, look, and commit**

Run:
```
pnpm check
```
It must be green.
Never commit a red state.

Then inspect the rendered result.

Open the relevant rendered page/application at both marking viewports:
```
1920x1080
390x844
```
Actually look at what is on screen.
Confirm that:

- the implementation renders,
- the expected feature is visible,
- the layout is correct,
- responsive behaviour is correct,
- nothing unexpectedly shifted,
- typography and spacing are correct,
- interactive elements appear correctly,
- the visual result matches the step's claimed output.
- A green test suite is not a substitute for visual inspection.
If the rendered result exposes an implementation problem, return to Step 1 and treat the observation as a review finding.

Only once:
1. pnpm check is green,
2. the rendered result has been inspected at both viewports,
3. the result matches the step,
4. Make one commit for the step.

The commit message must say what changed and why.

8. **Re-align the plan**
After the step is committed, compare the resulting implementation with the remaining BUILD_PLAN.md.
If any review pass changed the understanding of:
- architecture,
- dependencies,
- scope,
- sequencing,
- acceptance criteria,
- remaining work,
- amend BUILD_PLAN.md before starting the next step.

This is expected.

Amending the plan is the normal outcome of review. It is not evidence that the original plan was wrong. The plan must describe the repository as it now exists, not the repository as it was imagined before implementation. Do not start the next subagent until the plan is re-aligned.

Review-loop invariant
The following state machine is mandatory:
```
                ┌─────────────────────────────┐
                │                             │
                ▼                             │
          1. DESIGN SCAFFOLD                  │
                │                             │
                ▼                             │
           2. IMPLEMENT                       │
                │                             │
                │ pnpm check must pass        │
                ▼                             │
           3. OPTIMISE                        │
                │                             │
         finding? ── yes ─────────────────────┘
                │ no
                ▼
           4. REVIEW CODE                     │
                │                             │
         finding? ── yes ─────────────────────┘
                │ no
                ▼
        5. REVIEW ALIGNMENT                   │
                │                             │
         finding? ── yes ─────────────────────┘
                │ no
                ▼
      6. REVIEW DESIGN PRINCIPLES             │
                │                             │
         finding? ── yes ─────────────────────┘
                │ no
                ▼
       7. CHECK / LOOK / COMMIT
                │
                ▼
        8. RE-ALIGN BUILD_PLAN
                │
                ▼
        NEXT ATOMIC STEP
```

# Responsibilities 

The parent must:
- understand the complete design,
- create BUILD_PLAN.md,
- identify atomic steps,
- determine dependencies,
- gather relevant CLAUDE.md instructions,
- gather relevant scripts and commands,
- create exactly one fresh subagent per step,
- run steps sequentially,
- wait for each step to finish,
- inspect the resulting repository state,
- re-read the amended plan,
- launch the next fresh subagent.

The parent should not accumulate implementation reasoning from every step in its conversational context. The repository and BUILD_PLAN.md are the durable source of truth.

Each subagent must:
- read the supplied context,
- inspect the current repository state,
- read relevant CLAUDE.md instructions,
- read the relevant specification,
- read the relevant plan step,
- run the mandatory loop,
- make all required corrections autonomously,
- perform visual inspection,
- make exactly one final step commit,
- leave the repository in a clean, checked state,
- report the completed commit and any plan changes.
- The subagent must not ask the user for permission to perform a review correction.
- The subagent must not pause merely because it found a problem.