# Ready to publish

**2026-10-09** — the-pact is ready to be made public with its history as it is: the tree is clean, every published surface was scanned, and the README says who it's for, what it depends on and how to install it (mephistopheles4/the-pact#10, folding in #9; tickets #161 and #162). See [ADR 0035](../adr/0035-publish-with-the-history-as-it-is.md).

- **Personal paths out of the tree (#161).** Two logs and three rule-probe fixtures held the owner's home path, on 7 lines. Prose now uses `~`, and the two `docker run` lines use `$HOME`.
- **A guard test.** `gate/tests/home-paths.test.mjs` fails when a tracked file holds a home path with a real username. It reads either slash, doubled backslashes, any case, a drive written as a folder (Git Bash and WSL), a path just after a string escape, Claude Code's dash-joined project folder (the home folder's own included, and dotted names), names outside ASCII, and UTF-16 files. A hit prints with the name masked.
- **Scans over every published surface (#161).** Gitleaks 8.30.1, a private-term check and a third-party check ran over 455 commits on 84 refs, plus the tracker: 1,174 items and 316 edit-history diffs.
- **README:** a "Who it's for" section, a "Depends on" list, and a Status line that no longer claims a clean privacy pass. It describes what the history holds.
- **An install how-to,** [`docs/install.md`](../install.md): prerequisites, clone, the dry run and what to read in it, `-Apply`, and `/agents` in a fresh session.
- **Visibility wording.** No doc says the repo is private or will be public.

## What it set out to do

#10 asked for the audience to be decided, an install how-to and one dependency list. #9 asked for the personal paths in history to be dealt with before publishing. The triage found more: 43 commits with personal paths, an author email, two commits naming a private research folder, and a tracker that would publish with the repo. So one thorough spec on #10 covered both, on the security route.

## What was found

- **Secrets: none.** Gitleaks's first run, with no allow list, reported only the 15 fake keys planted on purpose in the practice fixtures. Each was then allowed by its exact fingerprint, and the second run found nothing in git or on the tracker.
- **Gitleaks misses some planted keys.** At #161's move 4, `behaviour-lens` found six planted sites gitleaks never reported. Five match no default rule, because the generic rule needs a keyword such as "secret" or "token" near the value. The sixth is matched, then waved through by the rule's own built-in allow pattern. Gitleaks's rules for real provider key formats need no keyword, so the gap bears on secrets in a custom format.
- **Private terms: only the two commits the history decision accepts,** and one tracker hit, which the owner accepted as a false positive.
- **Third-party mentions: none needs a fix.** Each cites public documentation, names a plugin or skill, or records the code-review bot's review of this repo's own PRs.
- **Unfixed security findings on the tracker: 44 rows.** The owner accepted all 44 for publication: 3 aren't findings, about 20 are planned fixes not yet built, 7 are known limits already in the tree, 6 are risks the owner accepted, and 5 were dismissed by a session. #122's build decides its `adversarial-lens` F8 again, because its dismissal leaned on the repo being private. There are no open security escapes.
- **The guard missed forms at first.** All four lenses on #161's diff traced the same gaps: Git Bash and WSL paths, the home folder's own project folder, dotted names, and names outside ASCII. Its failure output also printed the username it caught. The fix widened the forms and masked the name.
- **The guard runs only with the tests.** The repo has no CI yet (#166), and the install runs the pact's check, not the test suite. So a new home path is caught when a session runs the suite, not on every commit.
- **A first install replaces the user's own `CLAUDE.md`, with no backup.** The how-to's dry run lists it under `Overwrite`, and the how-to says to copy it and `settings.json` first, and how to undo the install by hand.
- **`-Apply` loosens `settings.json`'s permissions on Linux.** At #162's move 4, `data-lens` suspected it, and the container confirmed it: a `600` file came out `644`. The how-to tells Linux and macOS readers to reset it; #177 tracks the fix in the installer.
- **The how-to's security wording was tightened at move 4.** `adversarial-lens` found it called the dry run harmless and the ask rules a boundary. The how-to now says the dry run runs the clone's code, the ask rules don't stop a script, and an update is read as one net diff before it runs. It also warns, before the install, that the rules read the tracker as the record, post review reports there, and send periodic totals to this repo's tracker until the reader edits that paragraph.
- **A new AGENTS.md line first landed inside a gated clause,** and the install's check refused. Rerunning the how-to's steps as written caught it before the review finished. A new test, `gate/tests/install-howto.test.mjs`, now fails when the how-to leaves out a setting the overlay sets or an agent the install puts in place.
- **The how-to was tried in two places.** Linux: a first install into an empty Claude home in the repo's container (dry run, `-Apply`, all ten agents, then a second dry run with nothing to do). Windows: the dry run only. macOS: not tried.

## What comes next

- **The tracker rule (#160)** blocks the flip: only the owner's account's text counts, and a session checks its own posts for private terms before posting.
- **The installer's permissions fix (#177),** after which the how-to's `chmod` line goes.
- **The final rescan** reruns the scans after the last merge, against the ref list and scripts in #161's record comment. The repo is frozen until the flip.
- **The flip is the owner's,** with GitHub's interaction limit set first. The close-out comment on #10 records it.

## Record

Issue comments on mephistopheles4/the-pact#10:

- `6071578011` — the triage and the three history routes.
- `6072162399` — the owner's history decision, route (a).
- `6072197555` — the owner's answers on audience, tracker and the fold.
- `6072431800` — spec draft 2, signed off.
- `6072431511` — the lens dispositions on spec draft 1.
- `6072522862` — the plan's phase end and the sign-off decisions.
- The flip's close-out comment, posted after the flip.

Issue comments on mephistopheles4/the-pact#161:

- `6080012649` — the build report: every check and its result.
- `6080261949`, `6080262247`, `6080262494` — move 4: the QA pair, `unstated-lens` and the security pair.
- `6080262820` — the record for the final rescan: the 84 refs and the scan scripts.
- `6080269060` — the lens dispositions.
- `6080639941` — the owner's decisions on the term hit and the 44 rows.
