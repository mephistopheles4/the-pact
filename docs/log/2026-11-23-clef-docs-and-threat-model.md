# Clef's owner doc, the threat-model class and the rollback check

PACT-65, T3 of spec 0002. It adds `docs/clef.md` (what `clef` fetches and from where, about 7 GB of disk, the commands, the CPU speed note, how a caller uses it, Linux built and unit-tested only, the licenses, the pin-bump and `CLAUDE_CONFIG_DIR` notes, and `clef stop` then `clef remove --yes` before turning it off); a paragraph in `docs/install.md`'s "Roll back to an older version" (take `clef` off the tools list and apply first); [ADR 0166](../adr/0166-a-pinned-download-is-at-least-14-days-old.md) for the 14-day pin age; and the threat-model edit below.

**The threat model.** Under Code that runs it adds the llama.cpp build and the model (crosses), a Clef control bullet (the pin table, the age rule and the security pair's read of each pin PR, fixed redirect hosts, the tool's own archive readers, the fixed working folder and named environment, the supervisor's answer check, files at rest the machine's), and a residual sentence (a bad pinned build or model, a crafted model, outside text in `state`). Under Text into a session it adds a Clef answer, held to numbers and the option keys the caller sent. The accepted class "What you install and CI run" now names the pinned llama.cpp build and Clef model. **Widening a class merges only on the owner's own confirmation** (PACT-65's status says so).

**The cuts that make room** (the file was 2,984 words against a cap of 3,000; it is 2,991 now). Each is listed because the security pair reads each cut as a control change; none removes a control's statement.

1. The "Residual risk" section: its quadrant chart (class rank by likelihood and impact), its heading and its caption (101 words). It is a figure over the classes below it, which are unchanged; the chart can come back from git when the budget allows.
2. The four `style` lines of the first flowchart (dashed subgraph borders; cosmetic).
3. The public-copy URL of `review.md` in the opening paragraph.
4. The Text-into-session crosses parenthetical about the owner's private tracker, reworded shorter with the same rule.
5. Out of scope: reworded shorter, no item removed.
6. "Open issues" became "Open gaps": the same four gaps in prose, without the GitHub issue numbers, since all four issues are closed on GitHub. Whether any of them lives on Linear is for the owner to say.

The text edited sits on `main` after PACT-68's wording of checkpoints; PACT-45's threat-model text may land after this and need a merge.

**Rolling back:** revert the merge. Take `clef` off the tools list and apply first if it is on ([install.md](../install.md#roll-back-to-an-older-version)).

## Record

- The ticket: PACT-65 on Linear, and its parent PACT-61.
- The pull request: see the ticket.
