# Tracker authors through REST

**2026-10-18.** #183, ticket T2. A cloud thread's proxy refuses GraphQL, so every author read in `docs/agents/issue-tracker.md` failed there and nothing on the tracker counted. Author reads now go through a checker in code that uses REST, and with a token set the login is announced rather than confirmed. Tier: thorough, sensitive route; built on Opus at high, test-first.

## What was built

- **The checker,** `gate/tracker-authors-core.mjs` and its command line `gate/tracker-authors.mjs`, after the gate's core and command-line split. `issue <n>` or `pr <n>` on the fixed repo; anything else exits 2 before any call. It reads `user` first and keeps only its login, then the issue or PR through REST, 100 a page with explicit page numbers. A failed, empty, misshapen, repeated, capped or miscounted read stops with one fixed `FAIL stop/<id>` line and no content. On success it prints one record per item, then the SUMMARY line, the only place a verdict is taken from. Its gh runner pins the host, drops the debug variables, and runs from a new empty folder with no shell. Every line it prints escapes C1 controls, the line and paragraph separators and every format character.
- **The decisions:** a comment counts only when the owner's account wrote it and it shows no edit; an issue, PR or review body never counts, since REST shows no editor; a label counts only when the owner's account applied it last and the issue still carries it; a PR is insiders' code only when the owner's account opened it from this repo and every commit, the head last, is the owner's.
- **The doc:** "Whose text counts" has the announce-and-proceed steps, and a new "When GraphQL is refused" section says how to tell, how to run the checker from `main`, and how to read it. The GraphQL reads say they need GraphQL.
- **Tests: +35.** `gate/tests/tracker-authors.test.mjs`, in `fast`: five tables (comments, bodies, labels, insiders, stops) and ten tests (the hidden flag, three child runs on bad input, four on the runner and the output). Run before the checker existed, the file could not load; with the core but no command line, the three child runs failed. Each check was then seen to catch a broken copy of the code, one at a time. Three guard lists in the gate's tests name the two new files: the core import guard, the helper import guard and the install smoke test's gate list.

## Decided at Build

- **A review comment's hidden flag is `null`.** REST carries no `minimized` field for review comments; the owner chose to mark it unknown, and the doc says to summarise any record whose `hidden` isn't `false`.
- **The threat model,** on the owner's word at hand-off. R38 accepts that a session takes whatever account its token belongs to as the owner. R1's control names the checker, "Strangers on the tracker" says the login is announced and an edited item doesn't count through REST, the #188 line says cloud sessions now read authors, and a new section lists the checker's own checks and what it can't see.

## Decisions

- [ADR 0089](../adr/0089-tracker-authors-are-read-through-rest-where-graphql-is-refused.md) — Tracker authors are read through REST where GraphQL is refused, and the login is announced.

## Record

- [Spec, revision 5, signed off](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251845896)
- [Design review, round 1](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251846347)
- [Design review, round 2](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6251846789)
- [C10 live run](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6252050011)
