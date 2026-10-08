# Fast test runs, no tests cut

**2026-10-08** — "The full suite" is one fail-closed command, `node gate/tests/run.mjs full`, and `fast` runs everything but the install tier (mephistopheles4/the-pact#140). The work is four tickets, #144 to #147, landing on one shared branch, `fast-tests-140`, and one PR, by the owner's word: "can you take care off getting all the tickets of 140 in one PR?"

## T1 (#144): the runner, with full and fast tiers

- **The tiers.** `full` is every top-level test file in `gate/tests/`. The install tier is every test file whose imports reach the install harness, or whose own text names the install script, written out or in pieces. The runner computes it from the sources on every run. `fast` is full minus the install tier. Today that is 36 files: 9 in the install tier and 27 in fast.
- **How it starts node.** It starts the Node running it with `--test`, `--test-concurrency=4` and an explicit file list, with `NODE_OPTIONS` and `NODE_TEST_CONTEXT` cleared. It needs no glob, so the Node 20 caveat and its PowerShell form are gone from AGENTS.md.
- **It fails closed.** An empty pick, an odd test-file name or a usage error exits 2 without starting node. A failed, killed or unstarted node exits 1. Its last line on stderr names the tier, the file count and the result.
- **Record mode.** `--record <file>` writes a scrubbed copy of the run outside the repo. The repo, home and temp folders and the user name become placeholders. If a local path survives, it writes nothing and exits 3.
- **The copy list** moved out of the install harness into `gate/tests/copy-list.mjs`, which the harness and the runner both import.
- **The smoke file.** The install's two happy-path cases moved, unchanged, from `install.test.mjs` into `install-smoke.test.mjs`.
- **Guards over the real tree.** Guard 1 checks the full tier against a listing the guard builds itself. Guard 3 checks that the smoke file exists and is in the install tier. Each has a planted bad case in the tests that it catches.
- **AGENTS.md** gains "Running the gate's tests": the two tiers and their commands, when the full suite runs, and that a changed-files run is never move-4 evidence. The probe floor names the runner and the copy list.
- **The Linux container** runs `run.mjs full --reporter tap`. See [ADR 0030](../adr/0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md), linked from [ADR 0029](../adr/0029-the-gate-suite-runs-capped-on-the-current-node-lts.md).
- **No gate code changed.** No file in `gate/` outside its tests changed, and neither did the install script.

## T2 (#145): the everyday changed tier

- **The shape.** Re-timed quiet on the shared branch, `fast` took 50.1 s, under the spec's 60-second line. So `changed` is `fast` plus the tests the change can reach. It isn't the picks alone.
- **The changed set.** It's what differs from the merge-base of HEAD and `--base` (default `main`), staged or not, plus untracked files git doesn't ignore. A deletion or a rename counts by both paths.
  - **The base:** it's resolved to a commit before any other git call. A dash-led base exits 2.
  - **git's environment:** it runs without inherited `GIT_` variables, so a stray `GIT_DIR` can't point it at another repo.
- **The picks,** by the spec's rules:
  - **Tests and helpers:** a changed test runs itself, and a changed helper runs every test that reaches it through imports.
  - **Gate code** runs `full`.
  - **A payload path** runs the smoke file and every test that names the path.
  - **Any other path** runs the tests that name it.
  - **A path no rule maps** runs `fast` and is printed as unmapped.
  - **What "names" means:** a test names a path when its source, or a helper it imports, holds the path's file name or any run of two or more of its segments, written out or as string literals in a row.
- **The reasons print plainly.** T1's runner passed whole reasons through the odd-character filter, which turned `:` into `?`. Now only the names inside a reason are filtered.
- **AGENTS.md** says "while building, run `changed`", with the command in both shell forms. It replaces the interim rule's hand-picked file list.
- **Move 4's lenses found 17 things. 13 were fixed, 2 were documented, 1 was dismissed, and 1 went to the owner.** The fixes:
  - **The base and the repo:**
    - **The default base** is the branch `refs/heads/main`, so a tag named `main` can't stand in for it.
    - **The runner refuses with exit 2** unless it sits at the top of its own repo.
    - **A staged change counts** even when the working copy undoes it.
  - **The picks:**
    - **A tests-folder module** counts as named by a form holding its file name, so a test that starts it by path is picked.
    - **More than 2,000 changed paths** select every test.
  - **The tests:**
    - **The changed-set test** now moves `main` after branching, so it tells the merge-base from the base.
    - **The `unmapped:` filter** has a case that runs on Windows.
    - **A guard** checks AGENTS.md's while-building rule.
  - **The docs:** AGENTS.md and ADR 0030 say which changes still cost about a full suite, and point at #151. AGENTS.md says to read a `changed` record before posting it, since it names untracked files.
  - **Plants:** seven new plants each broke one fix and failed its test, and no other.

## What was measured

- **The baseline.** Main at 76c46c1, quiet, junit reporter: 1,651 cases (1,643 pass, 8 skip, 0 fail) in 33 files, in 714 s at cap 4 on Node 24.14.1.
- **Move 4's full suite.** On commit 2a62ce0, quiet: exit 0 in 646 s, against the baseline's 714 s. 1,680 cases: the baseline's 1,651 with 0 gone and 0 status changes, the 2 smoke cases moved, and 29 new runner cases. The speed-up here is small and comes from no change to the install tests; #146 and #147 are where the full suite gets cheaper.
- **The final full suite,** after move 4's fixes, on a65b10b, quiet: exit 0 in 393 s, 1,693 cases. That is the baseline with 0 gone, 0 changed, 2 moved and 42 new. The swing from 646 s to 393 s is machine load, not the change.
- **The plants.** Thirteen plants each broke one rule in the runner, in four batches. Each made the test that guards the rule fail, and no other test, except one side effect the plant explains. See the Record.

- **The everyday timings (T2),** quiet, on 969e788, with `--base HEAD` so the sample was the only change:
  - **A test-only change:** 27 files in 48.1 s (49.5 s on the first run). That's under a minute.
  - **A one-agent-file change:** 36 files in 412.4 s, far over it.
- **The T2 plants.** Seventeen plants each broke one of the changed tier's rules, in five batches and a sixth for a corrected plant. Each made the test that guards the rule fail. The few extra failures each have a stated cause in the record.

- **The Linux container.** The rebuilt image ran `full` on Node 20.20.2 with no network. The runner's own cases all passed there, including the control-character file-name case that Windows can't plant. Four practice payload cases failed, because the practice scorer's payload rule needs `node:sqlite`, which Node 20 lacks. Main fails the same four in the same image, so they predate this work.

## What was found

- **Node 20 refuses a test-name filter in `NODE_OPTIONS`.** The first container run failed the inherited-filter case with exit 9 before the runner started. That case now skips on such a Node. A preload planted in `NODE_OPTIONS` covers inherited options on every Node, and it fails with the clearing removed.
- **Move 4's lenses found 14 things, and 12 changed the runner or its docs.** The fixes:
  - **Paths and names:** printed helper names are replaced, a record path is checked as a real path, and the host name is scrubbed. Git Bash, WSL and network-share paths count as leaks.
  - **A pass the runner didn't earn:** the entry check compares real paths, so a start through a link no longer exits 0 having run nothing.
  - **The runner's own process:** AGENTS.md gives its command in two forms that clear `NODE_OPTIONS`, since clearing it only for the child left the runner open to a preload.
  - **The floor and the docs:** the floor names the runner's two test files, and AGENTS.md says a pass needs the result line.
  - **New tests and plants:** each fix has a bad case, and eight plants were each seen to fail.
  - **The other two:** the re-time and the everyday timings already sit in #145, and the one-PR rollback note went on #140.
- **A lens report quoted local paths.** `behaviour-lens` named its scratch and working folders. The first post of the QA pair's section carried them. It was deleted within minutes and reposted with placeholders, following #140's rule that posted records carry repo-relative paths only.
- **A payload change through a shared helper picks nearly everything.** `helpers.mjs` reads every agent file to build its stages, and almost every test imports it. So a one-agent-file change names itself in 35 of the 36 test files, and costs about a full suite. Move 4 found the same for a `cross/` file. It also found that a fixture edit, or a deleted or renamed test, picks every install test, because `copy-list.mjs` names the tests folder. The rule is right about those tests: they do read the file. The spec expected "the smoke set and a few", and the planted cases do show that. The owner chose to design the test architecture first, in a revision on #140, so the finer split waits for that. #151 tracks it.
- **A test file can put itself in the install tier.** The runner's own tests plant files that name the install script, so those plants live in fixture text files, and the runner applies its literal rule to a test file's own source only. A guard checks that the runner's test files stay in `fast`.

## Record

Issue comments on mephistopheles4/the-pact#140:

- `6064072969` — the spec, revision 4.
- `6064376515` — the tickets.
- `6064677579` — the one-PR plan.
- `6064685906`, `6064686449`, `6064686799` — the T1 baseline case list.
- `6065051673` — the T1 Linux container run.
- `6066623650` — rollback and close-out with one PR.

Issue comments on mephistopheles4/the-pact#144:

- `6064783590` — the plants' method and expected results, posted before any run.
- `6064874466` — the plant results.
- `6064976269`, `6064998338` — plant batch E, for the preload case: expected result and result.
- `6065301262` — move 4's full suite against the baseline.
- `6066456063`, `6066440658`, `6066441035` — move 4's lens reports, through the cross script: the QA pair, `unstated-lens` and the security pair.
- `6066560954`, `6066611913` — the plants for move 4's fixes: expected results and results.
- `6066636782` — move 4's Lens dispositions.
- `6066872845` — the final full suite against the baseline.
- `6067327558` — the owner's pick, the walk-through and the owner's done.

Issue comments on mephistopheles4/the-pact#145:

- `6067466126` — the S6 re-time of `fast`.
- `6067514386` — the finding on a one-agent-file change's picks.
- `6067597237`, `6067693012` — the plants' method and expected results, and their results.
- `6067865517` — the everyday timings.
- `6068002568` — move 4's full suite against the baseline.
- `6068158139`, `6068158459`, `6068362424` — move 4's lens reports, through the cross script: the security pair, `unstated-lens` and the QA pair.
- `6068432584`, `6068477630` — the plants for move 4's fixes: expected results and results.
- `6068490816` — move 4's Lens dispositions.
