# Reading agents write for two readers, and the session helps the owner decide

`plan-reviewer`, `result-checker`, `test-reviewer` and `security-reviewer` return a report in two sections. **For the owner** comes first: the verdict word, then what is wrong, why it matters and what it suggests, in plain sentences with no line numbers, codes or paths. **For the session** follows, with the evidence and locations the session needs to act. `plan-reviewer`'s bare `READY` form is replaced, and its advisories get a place in the second section. The pact says how these agents get their input: local files for the spec or the diff, with the report posted on the issue word for word and never retold.

After a report, the main session helps the owner decide. It fixes mechanical findings itself, groups findings that are really one question, and brings each real choice with a recommendation and its reason. It asks only for what only the owner knows or must approve. This replaces "show me a table of its findings … I decide" in moves 2 and 4.

## Why

- **The intent is the human above the loop.** The owner owns the work and is satisfied with their understanding of it, and may choose not to go deep. Reports and decisions are sized to that.
- **The reports were written for machines.** They were full of line numbers, severity codes and file paths. The owner got a verbatim record they could not read.
- **Verbatim is kept, and is why there are two sections.** The reasoning of [ADR 0005](0005-status-line-and-verbatim-relay.md) stands for reading agents: a summary decides for the owner, so the owner reads what the agent said. Retelling changes a report, like a game of telephone. The fix is to make the verbatim text readable at the source, not to have the session retell it.
- **The pile of "your call" items left the owner with decisions and no understanding.** A session that sorts, fixes the mechanical findings and recommends leaves the owner only the real choices. They can take a recommendation without reading the detail.
- **Advisories needed a home.** `plan-reviewer`'s human-in-the-loop check calls anything about "Needs a human" that is not a blocking signal "advisory, not REVISE", but the old output form held blockers only.
- **Local files in, issue comment out.** Reading agents have no way to ask for more, so they get their input written to files. The posted comment, not a separate kept file, is the verbatim record.

## Status

Accepted. Keeps the verbatim-relay reasoning of [ADR 0005](0005-status-line-and-verbatim-relay.md), which [ADR 0010](0010-build-in-the-main-session-with-process-tiers.md) superseded for builders. Builds on ADR 0010's reading agents.

## How this was decided

- **2026-09-29** — Raised by the owner while probing the hand-over-the-trigger work (#11). Specified in mephistopheles4/the-pact#12 ("Reading agents write for two readers", "Helping the owner decide").
- **2026-09-30** — Built in mephistopheles4/the-pact#16 in a Sonnet session, with `plan-reviewer`'s advisory gap (A3, from #14's `result-checker` report) closed in the same change.
