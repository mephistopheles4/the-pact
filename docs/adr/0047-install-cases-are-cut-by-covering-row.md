# Install cases are cut by covering row, with no permanent compare

An end-to-end install case is cut only when an in-process row already checks the decision it makes. The cut is proved once, in the build that makes it, by a table on the issue; no compare runs afterwards. This supersedes [ADR 0031](0031-gate-bad-cases-are-table-rows-and-no-case-is-lost.md) in part: the T1 baseline, its lists and the no-loss compare are deleted. Tables of bad cases stay as 0031 describes them.

- **A case may be cut** when a row in `install-core.test.mjs`, or another file that never installs, checks the same decision by its rule id, or by the same pure function's output. The table on the issue names, for each property, the row and the cases it covers.
- **A row may be added** where the decision is already a pure function in `gate/install-core.mjs`: one line in its table, or one assertion. Where it is not, the case stays.
- **A case stays** when:
  - it checks that a refused install wrote nothing: the home folder, a project, a folder outside it or a review folder unchanged. The in-process rows check only which rule refused, never what reached the disk;
  - only a whole run can decide it: argument handling as the shell hands it over, staging, the bootstrap, the runner's process, apply-time hashing, links, and git or Node kept out of a folder;
  - it is a happy path;
  - it is the last case that drives one of the runner's checks to refuse. A row proves the decision, not that `install-run.mjs` still calls it, so each call site keeps one case that shows the call is there.
- **No compare.** `baseline-compare.mjs`, its test and `gate/tests/fixtures/baseline-140/` are deleted, and AGENTS.md's "Moving or renaming a case" with them. A case may now be renamed or moved with no line in a list. The table guard's reader of `table(...)` calls, which lived in the compare, moved into `tables.mjs`.
- **The first cut, #210:** 43 of 262 install cases went, against #153's aim of 20 to 30 cases left. 128 cases are containment, and most of the rest are only the script's to decide, so 219 stay. Move 4's review put back two of the 45 first cut: the bootstrap's own case check, which no row reaches, and the one case that shows the dry run's "Gate: CHANGED" line. The aim was the owner's, set as an aim and not a done-criterion; the count is reported, not forced.

## Why

- **The compare's job ended with #140.** It proved that hundreds of moved cases each kept a home. Since then each move cost a line of bookkeeping and a run of the compare. Its one recorded catch was during #140's move (#189, S2).
- **A covering row gives the same assurance once.** Naming the row for each cut case, at the time of the cut, shows nothing was lost without a list that must be kept for good.
- **Containment is what only a whole run shows.** A row that says "refused, rule X" says nothing about whether the install wrote half a file first. Those cases are the install's last line of defence for the owner's home folder, so the cut never touches them.
- **A row cannot see wiring.** Cutting every end-to-end case behind one check would let a deleted call to that check pass every test. One kept case per call site closes that.

## How this was decided

- **2026-10-10** in mephistopheles4/the-pact#189, spec revision 3, S7, signed off by the owner, and built in #210. The owner set the 20-to-30 target as an aim, not a done-criterion, in chat.
- **Still holds:** [ADR 0030](0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md), on the runner and its tiers, with [ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md)'s change to its floor sentence; and [ADR 0033](0033-one-layer-per-test-file.md), on the purity guard.
