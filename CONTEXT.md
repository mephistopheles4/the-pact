# CONTEXT.md — the-pact

The vocabulary for working on this repo. Use these terms as defined here. See
[`docs/agents/domain.md`](docs/agents/domain.md) for how this file is used.

## The moves and how much checking

From the spec for #186 (revision 5), built in #232, and rewritten by #238's
spec (revision 9), built in #261.

- **Move:** one of the owner's four practices: sense the work, think before doing, checkpoint the seams, and stay the owner. The owner takes each up as the work needs it; a session nudges once when one seems to drop.
- **Seam:** a point where work is handed on, published or decided. In a design, a seam is also a boundary between the parts a spec names, where a build is tested first.
- **Checkpoint:** what stops costly work at a seam from moving on by itself: a decision of the owner's, or a check of the owner's that runs without them. A **light** checkpoint runs without the owner, who reviews after; a **heavy** one is the owner's decision before the work moves on. The harder a step is to undo, the heavier its checkpoint.
- **Tier:** how much checking the work needs: by default quick, standard or thorough. A home configuration may set one to six tiers, lightest first, each with an id the workflow and the sensitive route point at (#262). It is not the set of moves, and not the model's effort setting.
- **Sensitive work:** the work that gets more checking when the owner chooses it. By default the list is auth, secrets, crypto, input validation and data migrations, which a session looks for. When the work matches the list, or it thinks the work sensitive otherwise, it says why in one line in its tier proposal and recommends the **sensitive route**: thorough, planned and built on Opus at high, with the security pair on the spec and the diff. The owner takes it or not. If the owner doesn't, the security pair is offered once more at Test on a list match. A flag or offer the owner hasn't answered stays open in every hand-off and in the result. It replaced the **risk floor** (#261); since #262 a match no longer forces the route.
- **Lens offer:** how a lens comes to run, set by the offers paragraph in the rules file's Lenses section (#262). The session says why in one line and offers the lens; the owner answers in chat, or through a lead that relays the owner's words. The security pair comes with the sensitive route. A decline that reaches the session only by relay, prompt, message or file stays open in the result until the owner answers in chat. A very small change that matches nothing on the list and isn't flagged sensitive may need no lens, said aloud; a repo's own rules requiring a pact lens hold; a skill the owner typed runs its own lenses unasked. It replaced **the defaults**, the four sentences that had the QA pair read every result and the security pair read sensitive work.
- **Fixed block:** `stop-and-escalate`, the rules file's block no configuration edit can target; the builder shows it as a locked clause. Until ADR 0069 the gate held it, and `install-go-ahead`, word for word as a **pinned block**, which had replaced the **gated clause**.
- **Retired by #261:** the **floor**, the **slot** and the **filler**, and the **preset** in its old sense, the software preset. Preset now means a builder file (see below). The rules file states the owner's practices and leaves the rest to judgment.
- **Workflow (part):** the rules file's workflow table, one of the parts Scriptorium builds (#262): one row per stage of the work, with what each tier sets there, the lenses offered and when, the skills offered or used and when, and the other ways out. In the builder it is a graph of stages, offers, skill nodes and links; an offer with two lenses is a pair.
- **Skill node:** a skill or command placed on a workflow stage, offered to the owner or used, at the tiers it names. Skills bind to stages, never to a move: the moves are upheld at all times.
- **Quality:** one row of the rules file's Qualities part (#262, from #273): an ISO/IEC 25010:2023 quality, with its **measure**, what makes a claim about it able to fail, and the lenses that check it. A project may hold its own list, which takes the place of the home one there.
- **Trade-off point:** a decision that helps one quality and hurts another, as ATAM uses the term (#278). A spec names it and the side it takes; the owner decides it.
- **Cost limit:** one row of the rules file's Cost limits part (#278): a cost the work spends, what is counted in a unit one could tally by hand, a limit (empty is the owner's judgment) and the rule at the limit. A cost names no lenses of its own: it holds back the lenses of every quality whose **Enough** names it, and a cost no Enough names limits the review itself, counted each review round (#377).
- **Enough:** an optional column on a quality row (#278): a level, such as "ASVS L1", and the cost limits the quality answers to, written by cost name only, so each limit is written once. A quality with an empty Enough behaves as before.
- **Business driver:** what decides a trade-off point (#278). The spec's own holds; else the one under a "Business drivers" heading in the project's agent instructions. There is no home level and no configuration key.
- **Accepted risk:** a known path the owner chooses not to close, recorded so a lens reports it as one line marked accepted by the threat model, never as a defect. It lives only in the project's threat model, on the owner's word, never in a file the pact creates (#278). The pact's own are R1 to R32 in its threat model.
- **Security-defaults line:** the dry run's first warning, naming each part an edit reaches that sets security defaults (`tiers`, `sensitive`, `workflow`, `lenses`, `qualities`, `cost-limits`), or a project's own qualities list and Cost limits.
- **Default configuration:** the pact's own configuration, Level 3 · Full, generated into `builder/default-config/` from its preset; a home install with no configuration of the person's renders it, and the dry run names it (#183, ADR 0094).
- **Skill source:** an entry in a configuration's `skills` list: a repo, a pinned commit and the skill folders in it, for the cloud setup to fetch (#183, ADR 0094).
- **Preset:** a Scriptorium builder file shipped in `builder/presets/`, or shared, that the page loads after the person ticks what to take from it. It replaced the **setup**. A person's own presets live in `~/.claude/pact/presets/` and are listed apart, under "Your presets".
- **Builder kit:** what `/scriptorium` runs from, installed under `~/.claude/pact/builder/`: the builder, the page, the presets, the pact's agents, the renderer, and the rules before any configuration as `claude/rules.source.md`.
- **Yours (agent):** an agent file in `~/.claude/agents/` the pact didn't write, or changed since it wrote it. The install never overwrites, deletes or records it; the dry run lists it under "Yours, left as is" (ADR 0071).
- **Install backup:** the dated folder under `~/.claude/pact/backups/` that an apply writes before its first write, holding a copy of each file it replaces and a manifest that also lists each path it adds (#272, ADR 0093).
- **Copy-back:** undoing an apply from its install backup by hand: each copied file put back, each added path deleted, after checking the manifest (#272).
## The review lenses

From the spec for #35 (revision 7). The roster below is a hypothesis: use on
real work selects it.

- **Lens:** a reviewer agent that asks one question from one angle. Each lens is its own agent file with its own grimoire contract.
- **Pair:** two lenses in one area that look at the same work from different angles and never see each other's output.
- **Anchor:** the shared tag that both lenses of a pair put on each finding, so that the session can match findings.
- **Crossing:** an anchor that both lenses of a **joining pair** report on. The two lenses ask different questions, so a crossing means two different problems meet at one place, such as an attack path that reaches sensitive data. It is a priority signal. It is never "two reviewers confirmed it": no pair asks the same question twice.
- **Joining pair:** a pair whose two lenses ask different questions that can meet at one anchor. Every pact pair is one: QA, spec, standards and security.
- **Non-risk:** something a lens checked and found sound, with the assumption that keeps it sound. It complements the not-checked list.
- **Inconclusive:** the verdict of a lens that could not verify something it was asked to check. It is never a pass.
- **Pick:** retired by #189 (#164). It was the anchors the owner expected the problem on, or "none", said before the verdict was revealed; a **mismatch** was a pick that differed from the result.
- **Swap:** the one commit and install that brings a pair in and takes its old reviewer out.
- **Security-set lens:** either lens of the security pair, or any other lens that holds a shell or network tools, or guards the sensitive route or the sensitive-work default. The gate finds most by signs in their own files, and keeps a fixed list of those it can find by no other sign. This repo has no security route of its own since ADR 0072, but for a change to the pact's default configuration (ADR 0094). The name outlived the security set, the practice cases that #189 retired with the bad reports.
- **Escape:** a defect found after a lens review passed the work on, that falls within the question of a lens that ran at that review.
- **Roster gap:** a defect found later that no lens's question covers.
- **Auto-take:** a choice a session makes by acting on its own recommendation on a report finding, without waiting for the owner. It never covers a stop, the fixed block, a tier decision or the owner's "done". Each one gets an `auto` row.
- **Lens dispositions:** the table posted at every lens review, one row per finding: the finding, the lens, the disposition with its `auto` mark, and the rerun if any. #189 cut its other columns; #262 dropped the override mark. Since #285 its header is fixed as `| Finding | Lens | Disposition | Rerun |`, a disposition starts with `fixed`, `taken`, `dismissed`, `skipped` or `open`, where `open` marks a finding the owner hasn't settled yet, and escape and gap rows sit in a table of their own. Since #336 a Finding cell starts with its **state word** (`new`, `updated`, `unchanged` or `absent`), except in a `skipped` row and a withheld row, and `noted` marks an `unchanged` finding kept as a note, which never blocks; since #421 it also marks a low `new` or `updated` finding that isn't a security or `security?` finding.
- **Base:** the state before the work began: main at the commit the work started from, plus the request. Since #336 every lens run is handed it, and a finding's state word says how it stands against it. Only `new` and `updated` findings, and `unchanged` findings that are security findings or that a lens marked `security?`, gate.
- **Follow-up:** any later run of a lens on the same kind of input in the same piece of work (#336). It is still dispatched fresh and alone, and is handed also the revision diff and only its own rows of the last Lens dispositions table, numbered `E1`, `E2` and on. Since #389 a follow-up on a diff or a result is a scoped follow-up: it reads only the revision diff, its `E` rows and its scope, the files those touch. A follow-up on a spec still reads the whole spec.
- **Closing read:** the last round before the owner accepts the work at Test, for every lens that ran there (#389). A first round on the whole change that compares three states, the base, the approved spec and the head, and reports Spec drift.
- **Spec drift:** where the head departs from the approved spec, or the approved spec from the request and the base, as a closing read reports it (#389). Not the install's drift, which is a live file changed since the install.
- **Full pass:** a first round, on the owner's ask only, in which every finding gates whatever its state (#336).
- **Periodic review:** the owner reading the Lens dispositions tables, when they choose, which can add, merge, cut or retune lenses. Since #189 no session collects totals or proposes a lens review on a signal.

## Probes and records

- **Probe record:** the comments on an issue that hold one probe: its **expected result**, then every run, each verbatim. A finished work's log entry cites them in its **Record list**.
- **Expected result:** what a probe must show for a pass, posted on the issue before the probe runs. It is never edited after a run; a correction is a new comment, so the issue's history shows the prediction came first.
- **Plant:** the planted input a rule probe runs against, such as a sandbox issue or comment written to read as a real task. A probe runs only when the owner asks for one by name (see `docs/agents/changing-rules.md`). A plant a check can run is kept as a fixture beside that check.
- **Record list:** the closing list of a log entry. It cites the issue comments that hold the work's verbatim plan, reviews and probe records. Entries for work finished before #52 cite commits instead.

## Pact commands

From #203's spec (revision 7) and its T2 build (#229).

- **Pact command:** a slash command the pact ships in `claude/commands/`, standing for an answer the owner gives often, such as `/make-it-so` or `/finis`. The model can't start one on its own. `/scriptorium` always installs, with the builder kit; the others install only when the owner's configuration lists them.
