# Record mode writes the output as printed

#507. `--record <file>` in `gate/tests/run.mjs` no longer replaces the repo, home and temp folders, the user name or the host name with placeholders, and no longer refuses a record that still holds a path or a name. The record is everything printed, plus the result line, as printed. This amends [0030](0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md) (its record-mode bullet, its "Posted records must not leak local paths" reason, and the probe-floor sentence on the security route), and amends [0143](0143-no-read-looks-for-this-machines-paths.md) and [0098](0098-the-read-before-posting-looks-for-no-path.md): a user or host name, inside a path or on its own, is no longer a personal detail for the read before posting.

## Why

- **The owner asked** (in chat, 2026-11-08): "delete the rules about local paths, it's inevitable and it just creates friction", and, on the user and host names: "we are overcomplicating this, id drop it too".
- **The scrub cost more than it caught.** A passing run that printed a drive path or the host name exited 3 with no record, so the friction landed on the runs that had nothing wrong. [0143](0143-no-read-looks-for-this-machines-paths.md) took the path look out of the reads and left this one, "a spec change of its own". This is that change.
- **A user or host name is no longer a personal detail,** inside a path or on its own, so the read before posting does not hold back every record of this machine. [0126](0126-the-pact-has-no-secret-or-personal-data-rules.md) left the runner's record scrub to #449, and 0143 left a name inside a path there too; with the scrub gone, nothing checks a posted record for a path or a name. `claude/review.md` says "a secret or a personal detail" and is not edited. #449 no longer covers record mode.

## What changes

- **Gone from `run.mjs`:** `makeScrub`, `pathForms`, `splitSegs`, `wordRe`, `escapeRe`, `localScrub` and `localNames`, the leak check (`LEAK_RES`, `leakedLines`) and the exit 3 with `record: not written, N lines still held a local path or name`, and the imports only they used.
- **Gone from `run.test.mjs`:** the five tests of the scrub forms, the POSIX scrub and leak check, the host-name scrub, the leak patterns and the host-name record. Two shell tests are rewritten to the new behaviour (a failing run and a passing run, each recorded as printed), and one is new (a record that can't be written).
- **0030:** the record-mode bullet and its reason now describe the output as printed. Its probe-floor sentence "A change to the tiers, the exit handling, how node is started or record mode takes the security route and needs a bad case seen to fail." is struck, with none of its words kept. [0072](0072-this-repo-has-no-security-route-of-its-own.md) (no security route of this repo's own) and [0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md) (the runner is ordinary test code, off the probe floor) had already overtaken it.
- **0031:** its compare and the leak patterns it imported are gone ([0047](0047-install-cases-are-cut-by-covering-row.md), this ADR).
- **0126:** its "gate runner's record scrub" is settled here, no longer left to #449.

## What stays

- **A record path inside the repo** exits 2, checked as a real path.
- **A record that can't be written** prints `record: not written (<code>)`, and its result line ends `; record refused`, exit 3.
- **Test output is posted only from record mode** (AGENTS.md, `docs/agents/gate-tests.md`). The reason is now this: a record is the whole output plus the result line, written outside the repo, so a post never carries a hand-picked excerpt. The scrub was never that rule's only reason, and it stays.
- **The `--host-fallback` reason** still refuses a path (`PLAIN_REASON` in `run.mjs`). It is a separate check, left as it is.

## The risk

A record of this machine now reaches the issue tracker with its home folder, user name and host name in it, and nothing looks for them. The threat model's accepted "Posts are public" class names a revealing path, so this removes a control and adds no class. It is the owner's choice, taken for fewer refused runs and records that read as typed.

## How this was decided

- **2026-11-08** on #507, spec revision 4, standard tier, no security route (decision 169). The ask on paths and the one on names were the owner's words in chat; a failed write keeping exit 3, and this ADR's amendment of 0143 and 0098, were settled by the lead (decisions 177 and 185), who relayed the owner's chat.
- **2026-11-08, at Test.** The behaviour-lens noted that a bare host or user name, outside a path, would still count as a personal detail. The owner widened the carve-out to cover it, and asked for #507 in `docs/rule-reasons.md` (decision 219, relayed by the lead).
