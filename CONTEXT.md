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
- **Cross script:** the installed script that checks the findings blocks, joins a pair's findings on their anchors, writes the comment section and the page. Its second mode, which compared the owner's pick with the result, went with the pick (#189).
- **Inconclusive:** the verdict of a lens that could not verify something it was asked to check. It is never a pass.
- **Pick:** retired by #189 (#164). It was the anchors the owner expected the problem on, or "none", said before the verdict was revealed; a **mismatch** was a pick that differed from the result.
- **Swap:** the one commit and install that brings a pair in and takes its old reviewer out.
- **Security-set lens:** either lens of the security pair, the reviewers the security route names, or any other lens that holds a shell or network tools, or guards the security route or the risk floor. A change to one takes the security route. The name outlived the security set, the practice cases that #189 retired with the bad reports.
- **Escape:** a defect found after a lens review passed the work on, that falls within the question of a lens that ran at that review.
- **Roster gap:** a defect found later that no lens's question covers.
- **Auto-take:** a choice a session makes by acting on its own recommendation on a report finding, without waiting for the owner. It never covers a stop, a gated clause, a tier decision or the owner's "done". Each one gets an `auto` row.
- **Lens dispositions:** the table posted at every lens review, one row per finding: the finding, the lens, the disposition with its `auto` mark, the cross result, and the override mark when a lens ran off its default. #189 cut its other columns.
- **Periodic review:** the owner reading the Lens dispositions tables, when they choose, which can add, merge, cut or retune lenses. Since #189 no session collects totals or proposes a lens review on a signal.

## Probes and records

- **Probe record:** the comments on an issue that hold one probe: its **expected result**, then every run, each verbatim. A finished work's log entry cites them in its **Record list**.
- **Expected result:** what a probe must show for a pass, posted on the issue before the probe runs. It is never edited after a run; a correction is a new comment, so the issue's history shows the prediction came first.
- **Plant:** the planted input a rule probe runs against, such as a sandbox issue or comment written to read as a real task. A probe runs only when the owner asks for one by name (see `AGENTS.md`). A plant a check can run is kept as a fixture beside that check.
- **Record list:** the closing list of a log entry. It cites the issue comments that hold the work's verbatim plan, reviews and probe records. Entries for work finished before #52 cite commits instead.
