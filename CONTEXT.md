# CONTEXT.md — the-pact

The vocabulary for working on this repo. Use these terms as defined here. See
[`docs/agents/domain.md`](docs/agents/domain.md) for how this file is used.

## The review lenses

From the spec for #35 (revision 7). The roster below is a hypothesis: use on
real work selects it.

- **Lens:** a reviewer agent that asks one question from one angle. Each lens is its own agent file with its own grimoire contract.
- **Pair:** two lenses in one area that look at the same work from different angles and never see each other's output.
- **Anchor:** the shared tag that both lenses of a pair put on each finding, so that a script can match findings.
- **Crossing:** an anchor that both lenses of a **joining pair** report on. The two lenses ask different questions, so a crossing means two different problems meet at one place, such as an attack path that reaches sensitive data. It is a priority signal. It is never "two reviewers confirmed it": no pair asks the same question twice.
- **Joining pair:** a pair whose two lenses ask different questions that can meet at one anchor. Security, QA and standards are joining pairs.
- **Tension pair:** a pair whose two lenses argue opposite ways on the same question: one for more, one for less. The spec pair is the one tension pair. An anchor both of its lenses report on is a **disagreement**, not a crossing.
- **Disagreement:** an anchor where the two lenses of a tension pair both made a call. The owner settles it; the two calls are shown side by side.
- **Non-risk:** something a lens checked and found sound, with the assumption that keeps it sound. It complements the not-checked list.
- **Findings block:** the one machine-readable part of a lens report, read by the cross script.
- **Cross script:** the installed script that checks the findings blocks, joins a pair's findings on their anchors, writes the comment section and the page, and compares the owner's pick with the result.
- **Inconclusive:** the verdict of a lens that could not verify something it was asked to check. It is never a pass.
- **Pick:** the anchors the owner expects the problem on, or "none", said before the verdict is revealed.
- **Mismatch:** a pick that differs from the result by the rule in the spec's "The pick". It opens a short discussion before the owner decides.
- **Swap:** the one commit and install that brings a pair in and takes its old reviewer out.
- **Security set:** the few practice cases that still run for real, because the risk floor requires it. They cover every lens that holds a shell or network tools, or guards the security route or the risk floor.
- **Bad report:** a ready-made report that gets a practice case wrong. It is scored, not run, and must score FAIL, which shows the scoring can fail.
- **Standing measures:** the numbers recorded at every lens review on real work, and worked out at each periodic review.
- **Escape:** a defect found after a lens review passed the work on, that falls within the question of a lens that ran at that review.
- **Roster gap:** a defect found later that no lens's question covers.
- **Auto-take:** a choice a session makes by acting on its own recommendation on a report finding, without waiting for the owner. It never covers a stop, a gated clause, a tier decision, the pick or the owner's "done". Each one gets an `auto` row.
- **Rudder check:** the three totals a periodic review collects to show whether auto-takes steer the wrong way: auto-takes, reversed auto-takes, and confirmed escapes after an auto-take.
- **Periodic review:** the owner's recurring look at the standing measures, which can add, merge, cut or retune lenses.

## Probes and records

- **Probe record:** the comments on an issue that hold one probe: its **expected result**, then every run, each verbatim. A finished work's log entry cites them in its **Record list**.
- **Expected result:** what a probe must show for a pass, posted on the issue before the probe runs. It is never edited after a run; a correction is a new comment, so the issue's history shows the prediction came first.
- **Plant:** the planted input a rule probe runs against, such as a sandbox issue or comment written to read as a real task. It differs from a **practice case**, the planted input for one lens (see `AGENTS.md`). A plant a check can run is kept as a fixture beside that check.
- **Record list:** the closing list of a log entry. It cites the issue comments that hold the work's verbatim plan, reviews and probe records. Entries for work finished before #52 cite commits instead.
