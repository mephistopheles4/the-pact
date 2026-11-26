# The gate's tests keep what the pact does

**2026-11-26.** A host run of the gate's fast tier deleted the owner's live `~/.claude/pact`. The cause was a test, `builder-page.test.mjs`'s `C1`. Since PACT-96 the builder's default page path is `<Claude home>/pact/scriptorium.html`, but the test helper `kitHome()` still unset `CLAUDE_CONFIG_DIR`. On the host the kit's page therefore went to the real Claude home, and `ownPage()`'s cleanup, written for the old temporary folder, removed that whole folder recursively. The test passed while it did this. The diagnosis ran in athanor only, with canary folders planted in the container's home.

The owner then asked for an audit, saying that 3,000 tests is not very fast (decision 193), and took all three parts of the proposal (decision 197).

## What changed (PACT-114)

- **The fix.** `kitHome()` points `CLAUDE_CONFIG_DIR`, `HOME` and `USERPROFILE` at its temporary home. `ownPage()` asserts that the page is inside that home, then removes only that file. Before the fix, the assertion failed in four of the six kit tests, naming `/home/runner/.claude/pact/scriptorium.html`; after it, all six pass and the canary survives.
- **Cut: guards against the owner's own agents and the test machinery.** 11 files and 303 tests went: the runner's tiers and picks, the athanor hook's matcher, the cores' split, the bootstrap's source rules, the import and fault-fixture guards, and parity. The two import-trap fixtures had no other user, so they went too. The harness's purity guard went as well, because it fails a test that reads a shared install.
- **Cut: wording and word counts.** 13 files and 239 tests went: the word budgets, tables of contents, the wait label, the spec index, and the poster's text checks. `poster-doc` and `poster-edit` stay, because they also hold the poster's refusal of a live secret's value and its author and tracker-author checks.
- **Cut: the real-home cases.** Four `install-project` dry runs at the real home or Claude folder went, along with `project-home.test.mjs`, 5 tests in all.
- **Cut: `workflow.test.mjs`'s 489 planted rows.** Its nine checks on the real files stay.
- **Shared installs.** The harness gains `sharedRepo()` and `sharedInstall()`, one per test file, made on first use. A test that only reads one of them, or dry-runs on it, takes it; a test that changes either keeps its own. A home can't be copied, because the installed `settings.json` holds the home's own path. `install-backup` C17's planted time limit is now 5 s instead of 20 s.
- **The rules.** In AGENTS.md, each check *family* a change adds or tightens needs one bad case, not each check. The word-budget and table-of-contents tests are no longer named, and the agent-facing docs are listed where the budget test used to list them. `docs/agents/gate-tests.md` follows. The owner deleted two of its rules that the cuts break: "never cut a case that checks a refused install wrote nothing" and "the last bad case for a gate check" on the never-cut list. No new rule text replaces them. No rule in the rules file changed, so `docs/rule-reasons.md` gains no row.

## For the owner to confirm

- **What was in `~/.pact`.** Nothing on `main` names that folder, and the fast tier left its canary in place, so its loss is unexplained.
- **Five check families now have no bad case:** the workflow lockdown, the folder check, the CodeQL and Claude allow-lists, and the premise test. The project check's "the real home comes from the OS" rule has none either. The new rule asks for one when a family is next tightened.
- **`docs/toc.mjs`'s header still cites the cut test.** It was left alone, since a change there makes every vendoring repo behind.

**Rolling back:** revert the merge. The fix stands on its own, so keep its commit if only the cuts go back.

## Record

- The ticket: PACT-114 on Linear. The diagnosis, the audit table and the Test record are its comments.
