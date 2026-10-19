# A Windows job in CI

**2026-10-19.** #351, T1 of #348. Since #303, CI ran the gate on Linux only, so nothing ran the suite on Windows before a merge except a session on the owner's machine, and every Test waited on a local Windows `full` run. Now `gate.yml` has a second job, `gate-windows`, and both CI jobs passing on the reviewed head are the Test evidence. Tier: thorough, sensitive route; planned on Opus at high, built on Opus at high, test-first.

## What was built

- **The job:** `gate-windows` on pinned `windows-2025`, with a 45-minute limit, running the install dry run and `full` under Git Bash (`shell: bash`), with the same pinned actions as `gate`. No matrix, no `if:`, no `continue-on-error`.
- **The concurrency group** at the file's top level, keyed by the ref on a pull request and by the commit on a push, with `cancel-in-progress`: a newer push to a pull request cancels the older run of both jobs, and every push to `main` keeps its own run.
- **The lockdown test** reads each job on its own through the file's YAML reader: exactly the two jobs, each on its runner with a time limit, the dry run and `full` in each, no matrix, `shell: bash` on the Windows steps, every checkout keeping no token, the concurrency group as written, and no other workflow naming `gate-windows`. Fifteen bad cases, one per check, each seen to fail by name before the reader was written. The four existing first-job cases now expect the job's name in their message, and so does "runs an old Node".
- **The Test evidence moves to CI:** `AGENTS.md` and the gate-tests doc say both CI jobs on the reviewed head are the Test evidence, the PR comes before Test, and the Test record cites both run links and the head commit. On the sensitive route the security pair reads the local diff before the push.
- **Records:** ADR 0095, amending ADRs 0041 and 0081; the threat model's R21, R26 and crypto-section lines name both jobs, and none calls `gate-windows` required yet.
- **The skip list** (the owner's q2): the runner gains `--skips <file>`, for `full` only, which fails a passing run unless it skipped exactly the listed tests, by file and name, and prints each difference. `gate-windows` runs it with `gate/tests/windows-skips.txt`, taken from one local PowerShell `full` run at the PR's head and the job's first runs.
- **The security pair's fixes** (q3): the push rule (read every pushed commit; wait for the pair's read when it is due or offered, squashed to one commit; a `.github/` or lockdown diff waits for the pair or the owner; each cited run names its commit); `gate.yml` held to an exact allow-list; the concurrency wording, with a re-run of a cancelled run on `main`; and the folder check reading past trailing comments and quoted keys. The threat-model edits by q4: R21's added sentence withdrawn, R23 and R27 given dated lines for the push rule.

## Decided at Build

- **No local Git Bash run,** by the owner's word, relayed: the local `full` runs in Docker through the #96 fixture, as a building check; Windows evidence comes only from `gate-windows`. `gate-windows` keeps `shell: bash` (q1), recorded in ADR 0095 with its alternative and the trigger to revisit.

- **Messages name the job.** Problems a job's steps cause carry the job id, so a bad case shows which job it caught.
- **The every-checkout rule sits in the common lockdown,** so it holds every workflow file, not only `gate.yml`.

## Changed at Test

- **The first Windows CI run failed 238 install tests** that this change doesn't touch: GitHub's Windows image gives the temp folder a short 8.3 name with a `~`, which the install refuses in a Claude home by design, and the tests made their homes there. Reproduced here with a short-name temp folder. By the owner's q6 the test helpers now make their temp folders under the temp folder's long name.
- **The security pair's follow-up** found only lows. By q7 the push rule now ties the pair's read to the pushed commit and says what a declined offer and a later push need; a Windows skip that guards installer path or link handling goes to the owner; the `--skips` list refuses a line out of its shape by its line number; the triggers and the Windows job's action pins are held exactly. F1 (line-break characters in a workflow) and F3 (other workflows read with the YAML reader) are filed as follow-up issues. By q8, a killed run's leftover junit report in the temp folder is an accepted risk under R21.
## Owner steps after the merge

- After the first green run on `main`: add `gate-windows` to main's ruleset as a required check, with GitHub Actions as its expected source (D1).
- Then the follow-up docs PR records the ruleset read and names `gate-windows` as required in the threat model; T1 closes when it merges.
- For a rollback: remove `gate-windows` from the ruleset before the revert merges.

## Decisions
- [ADR 0095](../adr/0095-ci-runs-the-gate-on-windows-too.md) — CI runs the gate on Windows too.

## Record

- [Spec, revision 1](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6268017076)
- [Spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6268446235)
- [Spec, revision 3](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6268496508)
- [Design review: the spec pair](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269502824)
- [Design review: the security pair](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269503696)
- [Design review dispositions](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269504529)
- [Spec, revision 4](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269505459)
- [Spec, revision 5](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269823072)
- [Design follow-up: executability-lens](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269823912)
- [Follow-up dispositions](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6269824685)
- [Revision 6 dispositions](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6270045593)
- [Spec, revision 6](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6270046591)
- [The proceed record](https://github.com/mephistopheles4/the-pact/issues/348#issuecomment-6270102103)
- [T1 pointer to revision 6](https://github.com/mephistopheles4/the-pact/issues/351#issuecomment-6270099775)
- [T1 claimed](https://github.com/mephistopheles4/the-pact/issues/351#issuecomment-6270130519)
