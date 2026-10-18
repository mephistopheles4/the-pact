# Tracker authors through REST

**2026-10-18.** #183, ticket T2. A cloud thread's proxy refuses GraphQL, so every author read in `docs/agents/issue-tracker.md` failed there and nothing on the tracker counted. Author reads now go through a checker in code that uses REST, and with a token set the login is announced rather than confirmed. Tier: thorough, sensitive route; built on Opus at high, test-first.

## What was built

- **The checker,** `gate/tracker-authors-core.mjs` and its command line `gate/tracker-authors.mjs`, after the gate's core and command-line split. `issue <n>` or `pr <n>` on the fixed repo; anything else exits 2 before any call. It reads `user` first and keeps only its login, then the issue or PR through REST, 100 a page with explicit page numbers. A failed, empty, misshapen, repeated, capped or miscounted read stops with one fixed `FAIL stop/<id>` line and no content. On success it prints one record per item, then the SUMMARY line, the only place a verdict is taken from. Its gh runner pins the host, drops the debug variables, and runs from a new empty folder with no shell. Every line it prints escapes C1 controls, the line and paragraph separators and every format character.
- **The decisions:** a comment counts only when the owner's account wrote it and it shows no edit; an issue, PR or review body never counts, since REST shows no editor; a label counts only when the owner's account applied it last and the issue still carries it; a PR is insiders' code only when the owner's account opened it from this repo and every commit, the head last, is the owner's.
- **The doc:** "Whose text counts" has the announce-and-proceed steps, and a new "When GraphQL is refused" section says how to tell, how to run the checker from `main`, and how to read it. The GraphQL reads say they need GraphQL.
- **Tests: +43.** `gate/tests/tracker-authors.test.mjs`, in `fast`: five tables (comments, bodies, labels, insiders, stops) and thirteen tests (the hidden flag, three child runs on bad input, six on the runner and the output, one on a record decide() can't read). The Test review added eight: the PR body, a commit with no linked author, a commit committed by another account, a head commit that isn't one, a comment without its times, that last test, the head commit in an insiders' PR's SUMMARY, and a pending review left out. Run before the checker existed, the file could not load; with the core but no command line, the three child runs failed. Each check was then seen to catch a broken copy of the code, one at a time. Three guard lists in the gate's tests name the two new files: the core import guard, the helper import guard and the install smoke test's gate list.

## Decided at Build

- **A review comment's hidden flag is `null`.** REST carries no `minimized` field for review comments; the owner chose to mark it unknown, and the doc says to summarise any record whose `hidden` isn't `false`.
- **After the Test review, reviews' hidden flag is `null` too.** REST carries no `minimized` field on a review either, and GitHub can hide one, so the owner's "unknown" applies to reviews as well.
- **A comment without both its times stops the read** (`stop/shape`), as S13 asks for a missing field, rather than counting as unedited.
- **Stops fire in the table's order within each call;** the cap and the counts are checked after the last read, and the shape checks on a record's fields (a comment's times, a record decide() can't read) after those, except the head commit's, which fires right after the PR read. Every stop exits 1 with no verdict, so which one names a bad read changes nothing a session does.
- **From the Test review, on the owner's word** (decision cards in the build thread): an insiders' PR is named `pull:<n>@<head commit>` in the SUMMARY, the commit to check out; the doc's run step checks that `origin` is this repo, and spells out PowerShell 7; the owner's unsubmitted review is left out; the 100-review cap stays, listed in the threat model as a way to block a read. The owner accepted R39: an unsigned commit is credited to an account by its email. The owner also accepted R40: the run step's origin check reads the path, not the host; and declined test rows for a login match in the reverse direction and for a loosened head-commit pattern.
- **The install stages the checker** with the rest of `gate/` and hashes it into the manifest, so the install smoke test's gate list names both files (ADR 0089). The next dry run shows the gate changed.
- **The threat model,** on the owner's word at hand-off. R38 accepts that a session takes whatever account its token belongs to as the owner. R1's control names the checker, "Strangers on the tracker" says the login is announced and an edited item doesn't count through REST, the #188 line says cloud sessions now read authors, and a new section lists the checker's own checks and what it can't see.

## Decisions

- [ADR 0089](../adr/0089-tracker-authors-are-read-through-rest-where-graphql-is-refused.md) — Tracker authors are read through REST where GraphQL is refused, and the login is announced.

## Record

- [Spec, revision 5, signed off](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251845896)
- [Design review, round 1](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251846347)
- [Design review, round 2](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251846789)
- [C10 live run](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6252050011)
