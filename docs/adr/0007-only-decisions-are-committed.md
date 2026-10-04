# Plans and reviews are process; only decisions are committed

A plan, its review rounds, its check reports and its probe records are process, not a record to keep in the tree. They live on the GitHub issue, as its body and comments. When the work finishes, each lasting decision becomes one ADR in `docs/adr/`, and the work itself becomes one dated narrative in `docs/log/`. Each log entry ends with a **Record** list naming the issue comment that holds each verbatim plan, review and probe record. Log entries for work that finished before #52 name commits instead, because those records were committed and then deleted from the tree; git history keeps them.

## Why

- **Two readers, two records.** Someone asking "what did we decide, and why?" wants one short file per decision. Someone asking "how did this go, and what did we learn?" wants the story in order. ADRs serve the first, logs the second, and neither has to wade through the other.
- **One place for live records.** Plans, reviews and probe records live on the issue, so the owner never looks in two places. A folder of plans in the tree only grows into an archive nobody reads.
- **Nothing verbatim is lost.** The owner chose to take verbatim artefacts out of the tree, not out of history. A log entry cites the issue comments (or, for older work, the commits), so the exact review text is one click or one `git show` away.
- **It matches stacks,** so the same skills and habits work in both repos.
- **Consistent with the owner's private research,** which keeps records for learning apart from records for judgment. Logs and ADRs are that split.

## How this was decided

- **2026-09-27** — Planned in `d692989`, with the owner's calls recorded in `b773cf8` and `c115eee`. `plan-reviewer` round 1 (`af2c056`) asked for an end-state check before `main` moves and for private material to stay with the main session; fixed in `8e899b7`. Round 2 returned `READY` (`b11335c`).
- **2026-09-27** — The full story, and the commits that built it, are in [the ADR and log entry](../log/2026-09-27-adr-and-log.md).
- **2026-10-04** — Amended by #52: live records moved from a plans folder in the tree to the issue, and the folder was retired. The main decision, that only decisions are committed, is unchanged. The owner approved the spec on #52 and chose to edit this ADR in place, not add a new one.
- **Foreshadowed:** the root `AGENTS.md` already said, from `804e25a`, that once the GitHub repo exists only the lasting decision is committed, as one ADR.
