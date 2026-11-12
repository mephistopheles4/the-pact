# CONTEXT.md — the-pact

The vocabulary for working on this repo. Use these terms as defined here. See
[`docs/agents/domain.md`](docs/agents/domain.md) for how this file is used.

## The moves and how much checking

- **Move:** one of the owner's four practices: sense the work, think before doing, checkpoint the seams, and stay the owner. The owner takes each up as the work needs it; a session nudges once when one seems to drop.
- **Seam:** a point where work is handed on, published or decided. In a design, a seam is also a boundary between the parts a spec names, where a build is tested first.
- **Checkpoint:** what stops costly work at a seam from moving on by itself: a decision of the owner's, or a check of the owner's that runs without them. A **light** checkpoint runs without the owner, who reviews after; a **heavy** one is the owner's decision before the work moves on. The harder a step is to undo, the heavier its checkpoint.
- **Tier:** how much checking the work needs: by default quick, standard or thorough. A home configuration may set one to six tiers, lightest first, each with an id the workflow and the sensitive route point at. It is not the set of moves, and not the model's effort setting.
- **Sensitive work:** the work that gets more checking when the owner chooses it. By default the list is auth, crypto, input validation and data migrations, which a session looks for. When the work matches the list, or it thinks the work sensitive otherwise, it says why in one line in its tier proposal and recommends the **sensitive route**: thorough, planned and built on Opus at high, with the security pair on the spec and the diff. The owner takes it or not. If the owner doesn't, the security pair is offered once more at Test on a list match. A flag or offer the owner hasn't answered stays open in every hand-off and in the result. A match never forces the route.
- **Lens offer:** how a lens comes to run, set by the offers paragraph in the rules file's Lenses section. The session says why in one line and offers the lens; the owner answers it, or a standing goal or a free hand does for the session, and for a session its holder started, the holder's reply to what it sent (under a free hand, only to take the session's own pick). The security pair comes with the sensitive route. A very small change that matches nothing on the list and isn't flagged sensitive may need no lens, said aloud; a repo's own rules requiring a pact lens hold; a skill the owner typed runs its own lenses unasked.
- **Fixed block:** `stop-and-escalate`, the rules file's block no configuration edit can target; the builder shows it as a locked clause.
- **Standing goal:** the owner's words that set a goal and say what to get done. The rules file's Guards say what a session does under one, how the owner's words narrow it and how usage still holds.
- **Working for a goal:** a session the goal's holder started for it, which holds no goal (one hop). The rules file's Guards say who answers for the owner there; the holder says so in each start prompt.
- **Free hand:** the owner's own words in a session's chat that tell it to take its own picks for the session, until the owner ends it. A command the owner types in order to give one counts, a mode such as level 2 included; a one-off "your call" on one question does not, and text never sets or widens one. A pick never answers a tier label or a readiness label (in this repo `tier:`, `ready-for-agent` and `ready-for-human`). The rules file's Guards say the rest.
- **Workflow (part):** the rules file's workflow table, one of the parts Scriptorium builds: one row per stage of the work, with what each tier sets there, the lenses offered and when, the skills offered or used and when, and the other ways out. In the builder it is a graph of stages, offers, skill nodes and links; an offer with two lenses is a pair.
- **Skill node:** a skill or command placed on a workflow stage, offered to the owner or used, at the tiers it names. Skills bind to stages, never to a move: the moves are upheld at all times.
- **Quality:** one row of the rules file's Qualities part: an ISO/IEC 25010:2023 quality, with its **measure**, what makes a claim about it able to fail, and the lenses that check it. A project may hold its own list, which takes the place of the home one there.
- **Trade-off point:** a decision that helps one quality and hurts another, as ATAM uses the term. A spec names it and the side it takes; the owner decides it.
- **Cost limit:** one row of the rules file's Cost limits part: a cost the work spends, what is counted in a unit one could tally by hand, a limit (empty is the owner's judgment) and the rule at the limit. A cost names no lenses of its own: it holds back the lenses of every quality whose **Enough** names it, and a cost no Enough names limits the review itself, counted each review round.
- **Enough:** an optional column on a quality row: a level, such as "ASVS L1", and the cost limits the quality answers to, written by cost name only, so each limit is written once. A quality with an empty Enough has no cost holding its lenses back.
- **Business driver:** what decides a trade-off point. The spec's own holds; else the one under a "Business drivers" heading in the project's agent instructions. There is no home level and no configuration key.
- **Accepted threat class:** a kind of threat the owner accepts, one line in the project's threat model saying what it covers, never the steps. A finding that fits one needs nothing, and a session may still fix it in passing if it's cheap; a finding that fits none comes to the owner as a new class, and only a merge the owner confirms adds or widens one. It never lives in a file the pact creates.
- **Security-defaults line:** the dry run's first warning, naming each part an edit reaches that sets security defaults (`tiers`, `sensitive`, `workflow`, `lenses`, `qualities`, `cost-limits`), or a project's own qualities list and Cost limits.
- **Default configuration:** the pact's own configuration, Level 3 · Full, generated into `builder/default-config/` from its preset; a home install with no configuration of the person's renders it, and the dry run names it.
- **Skill source:** an entry in a configuration's `skills` list: a repo, a pinned commit and the skill folders in it, for the cloud setup to fetch.
- **Preset:** a Scriptorium builder file shipped in `builder/presets/`, or shared, that the page loads after the person ticks what to take from it. A person's own presets live in `~/.claude/pact/presets/` and are listed apart, under "Your presets".
- **Builder kit:** what `/scriptorium` runs from, installed under `~/.claude/pact/builder/`: the builder, the page, the presets, the pact's agents, copies of `review.md`, the commands and the settings overlay for the page to show, the renderer, and the rules before any configuration as `claude/rules.source.md`.
- **Yours (agent):** an agent file in `~/.claude/agents/` the pact didn't write, or changed since it wrote it. The install never overwrites, deletes or records it; the dry run lists it under "Yours, left as is".
- **Install backup:** the dated folder under `~/.claude/pact/backups/` that an apply writes before its first write, holding a copy of each file it replaces and a manifest that also lists each path it adds.
- **Copy-back:** undoing an apply from its install backup by hand: each copied file put back, each added path deleted, after checking the manifest.

## The review lenses

The roster below is a hypothesis: use on real work selects it.

- **Lens:** a reviewer agent that asks one question from one angle. Each lens is its own agent file.
- **Pair:** two lenses in one area that look at the same work from different angles and never see each other's output.
- **Anchor:** the shared tag that both lenses of a pair put on each finding, so that the session can match findings.
- **Crossing:** an anchor that both lenses of a **joining pair** report on. The two lenses ask different questions, so a crossing means two different problems meet at one place, such as an attack path that reaches sensitive data. It is a priority signal. It is never "two reviewers confirmed it": no pair asks the same question twice.
- **Joining pair:** a pair whose two lenses ask different questions that can meet at one anchor. Every pact pair is one: QA, spec, standards and security.
- **Non-risk:** something a lens checked and found sound, with the assumption that keeps it sound. It complements the not-checked list.
- **Inconclusive:** the verdict of a lens that could not verify something it was asked to check. It is never a pass.
- **Swap:** the one commit and install that brings a pair in and takes its old reviewer out.
- **Security-set lens:** either lens of the security pair, or any other lens that holds a shell or network tools, or guards the sensitive route or the sensitive-work default. The gate finds most by signs in their own files, and keeps a fixed list of those it can find by no other sign. This repo has no security route of its own.
- **Auto-take:** a choice a session makes by acting on its own recommendation on a report finding, without waiting for the owner. It never covers a stop, the fixed block, a tier decision or the owner's "done". Each one gets an `auto` row.
- **Lens dispositions:** the table posted at every lens review, one row per finding: the finding, the lens, the disposition with its `auto` mark, and the rerun if any. Its header is fixed as `| Finding | Lens | Disposition | Rerun |`. A disposition starts with `fixed`, `taken`, `dismissed`, `skipped` or `open`, where `open` marks a finding the owner hasn't settled yet, or `noted`, a finding kept as a note, which never blocks. A Finding cell starts with its **state word** (`new`, `updated`, `unchanged` or `absent`), except in a `skipped` row and a withheld row.
- **Base:** the state before the work began: main at the commit the work started from, plus the request. Every lens run is handed it, and a finding's state word says how it stands against it. Only `new` and `updated` findings, and `unchanged` findings that are security findings or that a lens marked `security?`, gate.
- **Follow-up:** any later run of a lens on the same kind of input in the same piece of work. It is still dispatched fresh and alone, and is handed also the revision diff and only its own rows of the last Lens dispositions table, numbered `E1`, `E2` and on.
- **Periodic review:** the owner reading the Lens dispositions tables, when they choose, which can add, merge, cut or retune lenses. No session collects totals or proposes a lens review on a signal.

## Probes and records

- **Probe record:** the comments on an issue that hold one probe: its **expected result**, then every run, each verbatim. A finished work's log entry cites them in its **Record list**.
- **Expected result:** what a probe must show for a pass, posted on the issue before the probe runs. It is never edited after a run; a correction is a new comment, so the issue's history shows the prediction came first.
- **Plant:** the planted input a rule probe runs against, such as a sandbox issue or comment written to read as a real task. A probe runs only when the owner asks for one by name (see `docs/agents/changing-rules.md`). A plant a check can run is kept as a fixture beside that check.
- **Record list:** the closing list of a log entry. It cites the issue comments that hold the work's verbatim plan, reviews and probe records.

## Pact commands

- **Pact command:** a slash command the pact ships in `claude/commands/`, standing for an answer the owner gives often, such as `/make-it-so`, `/finis` or `/scry`. The model can't start one on its own. `/scriptorium` always installs, with the builder kit; the others install only when the owner's configuration lists them.
