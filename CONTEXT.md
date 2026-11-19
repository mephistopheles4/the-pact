# CONTEXT.md — the-pact

The vocabulary for working on this repo. Use these terms as defined here. See
[`docs/agents/domain.md`](docs/agents/domain.md) for how this file is used. The
rules file is [`claude/CLAUDE.md`](claude/CLAUDE.md); a term below that only
names one of its parts points there for the rule.

## The moves and how much checking

- **Move:** one of the owner's four practices, as the rules file's moves list them.
- **Seam:** a point where work is handed on, published or decided. In a design, a seam is also a boundary between the parts a spec names, where a build is tested first.
- **Checkpoint:** a call at a seam the rules keep for the owner that is not a hard stop: the session takes its own pick, logs it and goes on. The rules file's Checkpoints say how.
- **Hard stop:** a step that waits for the owner's words in chat; under a standing goal or at autonomy level 3, a logged, flagged checkpoint instead. The rules file lists them.
- **Tier:** how much checking the work needs, from the rules file's tiers: by default quick, standard or thorough. It is not the model's effort setting.
- **Sensitive work:** the work on the rules file's sensitive-work list, which gets the **sensitive route** when the owner takes it.
- **Lens offer:** how a lens comes to run, set by the offers paragraph in the rules file's Lenses section, and a checkpoint.
- **Fixed block:** `stop-and-escalate`, the rules file's block no configuration edit can target; the builder shows it as a locked clause.
- **Standing goal:** the owner's words, or a command the owner ran, that set a goal and say what to get done. Under it, and in each session its holder starts for it, each hard stop is a logged, flagged checkpoint.
- **Workflow (part):** the rules file's workflow table, one of the parts Scriptorium builds; in the builder it is a graph of stages, offers, skill nodes and links.
- **Skill node:** a skill or command placed on a workflow stage, offered to the owner or used.
- **Quality**, **Cost limit** and **Enough:** a row of the rules file's Qualities or Cost limits part, and the column that ties a quality to the costs it answers to.
- **Trade-off point:** a decision that helps one quality and hurts another, as ATAM uses the term. A spec names it and the side it takes; the owner decides it.
- **Boundary:** where something comes in from outside or where an act goes out. A threat model lists them first; review.md's Threat model section says how to place a finding on one.
- **The machine:** the owner's own computer, or a sandbox run on it, with everything made there. The threat model says what is the machine's.
- **Control:** a check that holds a boundary without the session's cooperation, named with when it doesn't hold. A pact rule a boundary rests on, named under its Residual, is one.
- **Accepted threat class:** a kind of threat the owner accepts, one line in the project's threat model. The threat model and review.md's Threat model section say what one covers and who adds one.
- **Security-defaults line:** the dry run's first warning, naming each part an edit reaches that sets security defaults (`tiers`, `sensitive`, `workflow`, `lenses`, `qualities`, `cost-limits`), or a project's own qualities list and Cost limits.
- **Default configuration:** the pact's own configuration, Level 3 · Full, generated into `builder/default-config/` from its preset; a home install with no configuration of the person's renders it, and the dry run names it.
- **Skill source:** an entry in a configuration's `skills` list: a repo, a pinned commit and the skill folders in it, for the cloud setup to fetch.
- **Preset** and **builder kit:** a builder file the Scriptorium page loads, and what `/scriptorium` runs from; [`docs/reference.md`](docs/reference.md) lists both.
- **Yours (agent):** an agent file in `~/.claude/agents/` the pact didn't write, or changed since it wrote it. The install never overwrites, deletes or records it; the dry run lists it under "Yours, left as is".
- **Install backup:** the dated folder under `~/.claude/pact/backups/` that an apply writes before its first write, holding a copy of each file it replaces and a manifest that also lists each path it adds.
- **Copy-back:** undoing an apply from its install backup by hand: each copied file put back, each added path deleted, after checking the manifest.

## The review lenses

- **Lens:** a reviewer agent that asks one question from one angle. Each lens is its own agent file.
- **Pair:** two lenses in one area that look at the same work from different angles and never see each other's output.
- **Anchor:** the shared tag that both lenses of a pair put on each finding, so that the session can match findings.
- **Swap:** the one commit and install that brings a pair in and takes its old reviewer out.
- **Security-set lens:** either lens of the security pair, or any other lens that holds a shell or network tools, or guards the sensitive route or the sensitive-work default.
- **Inconclusive**, **auto-take**, **Lens dispositions**, **base** and **follow-up:** terms of the review procedure, defined where they are used in `claude/review.md`.

## Probes and records

- **Probe record:** the comments on an issue that hold one probe: its **expected result**, then every run, each verbatim. A finished work's log entry cites them in its **Record list**. [`evals/README.md`](evals/README.md) says how a probe runs.
- **Record list:** the closing list of a log entry. It cites the issue comments that hold the work's verbatim plan, reviews and probe records.

## Pact commands

- **Pact command:** a slash command the pact ships in `claude/commands/`; [`docs/reference.md`](docs/reference.md) lists them.
