# the-pact

*The terms I work with AI agents under.*

Your words are the source code. An agent ships exactly what you said.

<p align="center">
  <img src="docs/img/hero.jpg" alt="Pencil illustration of an emptied software office. A developer with a coffee stands frozen in the doorway beside his own sticky note: 'pls clean up the repo before standup'. A smiling robot carries the last potted plant toward a dumpster labelled 'ARCHIVED'. A wall screen reads 'CLEANUP COMPLETE: 4,312 FILES, 9 DESKS, 1 INTERN (ARCHIVED, RECOVERABLE)'." width="800">
</p>

<p align="center"><b>He meant the repo.</b></p>

Faust signed a pact with no way out. This one has escape clauses written in: the human decides at every seam, and the agent stops and asks when it should. The skills live in [grimoire](https://github.com/mephistopheles4/grimoire), the spellbook. This repo holds the terms, and the familiars, its agents, bound by them.

## Words are code

An agent acts on what your words say. If "clean up the repo" can also be read as "clean up everything", sooner or later an agent will read it that way, and it will build, test and merge the result.

When you build something that matters, what you say to an agent deserves the care you give a commit. So the pact writes the terms down: which decisions stay yours, when the agent must stop and ask, and what gets checked before anything counts as done.

## Four moves

The pact is a small, runnable version of my [engineering playbook](https://aymandiab.com/work/engineering-workflow-playbook): how humans and AI agents build software together, with the human as the architect of intent and the agent as the executor. Four moves govern it. They are my practices, with or without AI, and I take each up as the work needs it. The agent follows my lead, and when a move seems to drop, it nudges once, lightly. Two guards sit under the moves: stop and ask when the work goes round twice (under a standing goal I set, after one bounded step), leaves the plan, is hard to reverse or can no longer be explained; and wait before expensive work when weekly usage is high.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/fig-01-moves-dark.svg">
  <img src="docs/img/fig-01-moves.svg" alt="FIG. 01, four moves, one owner. At each move I decide and the agent carries it out: I sense the work, think before doing, checkpoint the seams and stay the owner, each as the work needs it." width="800">
</picture>

<details>
<summary>Text of FIG. 01</summary>

| Move | Me, the architect of intent | The agent, the executor |
|---|---|---|
| 1. Sense the work | How big, how risky, and ready to plan? | Proposes a tier, with a line of why. |
| 2. Think before doing | Get the intent clear enough to defend. | Prototypes when the intent is still forming. |
| 3. Checkpoint the seams | Costly work waits for a checkpoint. | Builds what it was given, test-first. |
| 4. Stay the owner | Verify it, and know when to stop it. | Runs the tests and reviews. Brings decisions. |

As the work needs it.

</details>

The moves name no skills. You put your own skills and commands on the stages of the workflow instead, with the Scriptorium builder page: type `/scriptorium` after installing, or write a configuration file by hand (there is an example in [`examples/pact-config/`](examples/pact-config/)). With no configuration file of your own, the install renders the builder's full workflow, Level 3 · Full, as the pact's default configuration. The builder starts from it and ships six presets, [Matt Pocock's skills](https://github.com/mattpocock/skills) and Superpowers among them.

## How much checking

Not every change needs a spec. Each piece of work gets a tier (quick, standard or thorough), and the tier says how much checking it needs. Sensitive work, by default auth, crypto, input validation and data migrations, gets more when I choose it. When the work matches that list, the agent says why in one line in its tier proposal and recommends the sensitive route: thorough, planned and built on Opus at high, with the security pair on the spec and the diff. If I don't take it, the security pair is offered once more at Test when the change matches the list, and a flag I haven't answered stays open in the result. The rules file's Workflow table says what each tier sets at each stage, from Plan to Maintain, and which lenses to offer there.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/fig-02-tiers-dark.svg">
  <img src="docs/img/fig-02-tiers.svg" alt="FIG. 02, rigour follows risk. What quick, standard and thorough work each fits, and the models that plan and build it. By default, auth, crypto, input validation and data migrations are sensitive work; the agent recommends the sensitive route, thorough and on Opus at high, and I take it or not." width="800">
</picture>

<details>
<summary>Text of FIG. 02</summary>

| Tier | Fits | Plan | Build |
|---|---|---|---|
| Quick | Small, one session, no plan needed | — | Opus, low |
| Standard | Needs a short spec | Opus, medium | Sonnet, medium |
| Thorough | Too big for one session, or risky; cut into tickets, each its own session | Opus, high | Sonnet, medium |

**Sensitive work · when I choose it.** By default, sensitive work is auth, crypto, input validation and data migrations. The sensitive route: thorough, planned and built on Opus at high, with the security pair on the spec and the diff. The agent recommends the route, with its why, in its tier proposal, and I take it or not. If I don't, the security pair is offered once more at Test on a list match, and a flag I haven't answered stays open in the result. Keep one model for a whole session.

**Models.** Opus plans. Sonnet builds, and Opus builds quick work. The sensitive route runs on Opus at high effort.

</details>

## Review lenses

A lens is a reviewer agent that asks one question from one angle. Lenses are tools that help you through a stage faster, and they are offers: when the work calls for one, the agent says why in one line and offers it, and I answer. The security pair comes with the sensitive route, and is offered once more at Test on a list match if I didn't take the route. On a change of about one line that matches nothing on the list and isn't flagged sensitive, the agent may judge that no lens is needed, and says so. A skill I typed runs its own lenses without asking again. Each lens starts fresh and never sees its partner's report. They read and report, and none of them builds anything.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/fig-03-lenses-dark.svg">
  <img src="docs/img/fig-03-lenses.svg" alt="FIG. 03, lenses advise, I decide. Four pairs of review lenses each ask one question, and each pair is offered with a one-line why, at most two pairs a review round; the security pair comes with the sensitive route, and once more at Test on a list match if I didn't take the route. Their reports are crossed by a template and posted in the work's record, and I decide." width="800">
</picture>

<details>
<summary>Text of FIG. 03</summary>

- **Spec pair, offered on a spec, standard and up.** `executability-lens`: would the spec, built as written, run end to end? `unstated-lens`: what need did nobody write down?
- **QA pair, offered at every build.** `behaviour-lens` runs the change: does it do what was asked? `integrity-lens`: can the tests behind the pass actually fail, and does each one earn its place?
- **Standards pair, offered on a diff, standard and up.** `conventions-lens`: does the diff keep the repo's written rules? `reader-lens`: can the next reader act on what it says?
- **Security pair, with the sensitive route, and once more at Test on a list match if I didn't take the route.** `adversarial-lens`: which attack paths does no control stop? `data-lens`: where can the data leak?

Each pair is offered with a one-line why, and I say yes or no; a review runs at most two pairs a round, and past that another pair waits as a trade-off for me; the security pair, a lens the repo's own rules require and a skill's lenses I typed never wait. Each lens runs fresh and alone, and neither lens of a pair sees the other's report. The session crosses the pair by a template; where both lenses hit one spot, it shows first. The reports are posted in the work's record word for word. I decide: done, fix, or stop.

</details>

The rules file also lists the qualities that matter in my work, each with how it is measured and the lenses that check it; a lens checks the rows it is handed against their measures, and a project may list its own. A Cost limits part says what the work may spend to reach them, such as tests added or follow-up issues; each quality names the costs it answers to, and a cost holds back the lenses of the qualities that name it; a cost no quality names, such as Lens pairs, limits the review itself.

Their reports go into the work's record word for word. The agent sorts the findings and acts on its recommendation for each, and I can reverse any of them. Whether the work is done is my call.

## Who it's for

**It is one person's working configuration, shared as a reference.** Read it, borrow from it, or install it, but adopt it with your own judgement. It is written for my setup (PowerShell on Windows, auto mode, the Concise output style), and a configuration file can change some of it.

**It reaches beyond your machine.** It keeps the work's record where your project keeps it, and posts review reports there word for word, security findings included. This repo keeps its own record in GitHub issues; that is how this repo is run, not part of what the pact installs. Read [Before you install](docs/install.md#before-you-install) and [the threat model](docs/threat-model.md) first.

## What's here

| Path | What it is |
|---|---|
| `claude/CLAUDE.md` | The rules: the moves, how much checking, the lenses, the qualities that matter, and when to stop |
| `claude/review.md` | The review procedure a session reads before it runs a lens |
| `claude/agents/` | The lenses, in pairs, and `scout`, the search helper |
| `claude/commands/` | The pact commands: `/scriptorium`, always installed, and `/make-it-so` and `/finis`, when you list them |
| `claude/tools/` | The pact tools, off unless you list them: today the poster, which posts free text to GitHub, edits what a session posted, and reads it back, and the cleaner, which removes leftover worktrees and their branches after your yes |
| `familiars/` | Each agent's contract |
| `gate/` | The install gate: the pact checks itself before it installs |
| `builder/` | `scriptorium.html`, a page for building a configuration without writing JSON, and its presets; it installs with `/scriptorium` |
| `cloud-sessions/` | Setup for Claude Code cloud sessions |

The full table, with every agent and where each file installs, is in [docs/reference.md](docs/reference.md).

## Install

Run the install script from the repo root with Node 24 or later. With no switch it is a dry run: it shows what it would change, and installs nothing until you pass `--apply`.

```sh
node gate/install.mjs
```

The full how-to, with the command for each shell, is in [docs/install.md](docs/install.md).

## Depends on

- **Claude Code.** The pact is a rules file, agents and settings for it.
- **Node 24 or later,** the current LTS, to install and to run the gate's tests, on Windows, macOS or Linux.
- **git.** The install reads the clone's committed files. On Windows, the gate's tests also use the `sh` that ships with Git for Windows.
- **The models Opus and Sonnet,** and Fable for a second opinion when reviewers disagree.
- **[grimoire](https://github.com/mephistopheles4/grimoire).** Each agent's contract follows its format; its skills are optional.
- **[Matt Pocock's skills](https://github.com/mattpocock/skills),** optional: one of the builder's presets puts them on the workflow's stages.
- **For this repo's own work,** optional: the GitHub CLI (`gh`) for its tracker, and Docker for the Linux test run, with [athanor](https://github.com/mephistopheles4/athanor) at `4121c28` or later to run it through `athanor.json`.
