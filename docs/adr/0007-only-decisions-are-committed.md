# Plans and reviews are process; only decisions are committed

A plan, its review rounds, its check reports and its probe records are process, not a record to keep in the tree. While the work is live they sit in `docs/plans/`, or on the GitHub issue once the repo exists. When the work finishes, each lasting decision becomes one ADR in `docs/adr/`, the work itself becomes one dated narrative in `docs/log/`, and the process files are deleted from the tree, not archived. They stay in git history: each log entry ends with a **Record** list naming the commit that holds each verbatim plan, review and probe record.

## Why

- **Two readers, two records.** Someone asking "what did we decide, and why?" wants one short file per decision. Someone asking "how did this go, and what did we learn?" wants the story in order. ADRs serve the first, logs the second, and neither has to wade through the other.
- **A plans folder that only grows becomes an archive nobody reads.** Keeping plans only while live keeps `docs/plans/` small enough to mean "work in progress".
- **Nothing verbatim is lost.** The owner chose to take verbatim artefacts out of the tree, not out of history. A log entry cites the commits, so the exact review text is one `git show` away.
- **It matches stacks,** so the same skills and habits work in both repos.
- **Consistent with the owner's private research,** which keeps records for learning apart from records for judgment. Logs and ADRs are that split.

## How this was decided

- **2026-09-27** — Planned in `d692989`, with the owner's calls recorded in `b773cf8` and `c115eee`. `plan-reviewer` round 1 (`af2c056`) asked for an end-state check before `main` moves and for private material to stay with the main session; fixed in `8e899b7`. Round 2 returned `READY` (`b11335c`).
- **2026-09-27** — The full story, and the commits that built it, go in this work's own log entry, `docs/log/2026-09-27-adr-and-log.md`.
- **Foreshadowed:** the root `AGENTS.md` already said, from `804e25a`, that once the GitHub repo exists only the lasting decision is committed, as one ADR.
