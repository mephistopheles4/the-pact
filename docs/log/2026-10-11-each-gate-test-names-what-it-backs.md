# Each gate test names what it backs and earns its place

**2026-10-11.** "Writing a gate test" in `AGENTS.md` now asks of every test a change adds or edits: what does it back, and is it worth having (mephistopheles4/the-pact#215). `integrity-lens` asks whether a test can fail; nothing asked whether it was worth keeping, so the only pressure on the suite was upward. The rule is forward-only and for this repo only. ADR 0057 records it.

## What it set out to do

The owner's observation, from chat: builds keep adding tests to close every gap they can see, and the suites balloon. The owner deleted about 20,000 lines from this repo on 2026-10-10. The issue proposed five things: each test names its claim, test what fails silently, minus-one, the spec names which seams get tests, and size the suite to review cost.

## What was built

- **Five bullets in "Writing a gate test".** A test names a claim of its issue or a written invariant, and never a file path or script name in the comment. A path that fails loudly needs no test of its own, but a gate check's bad case is outside that. Minus-one is judged by reading, in a file the change already edits, with each cut listed on the issue, in the PR body and to `integrity-lens`. The PR body's second line is `Tests: +<added> −<cut>`. A never-a-cut list keeps the last bad case for a check, install cases, protected-set tests and the cloud-sessions test file out of reach.
- **ADR 0057 and its index line.** The decisions D1 to D3: no guard test, no sweep of the existing suite and no prune issue, and a five-PR measure.
- **Follow-up issue #240.** It holds the deferred items and the measure.

## What was decided

- **Forward-only, no guard, no sweep.** A guard would parse every test and force a retrofit of the existing suite. The owner took the recommendation at sign-off: no prune issue.
- **The security route was not needed.** Only `AGENTS.md` and docs changed. The never-a-cut list closes the doubt over protected tests.
- **Reader and conventions findings were taken.** A pointer that said "the rule above" named the wrong direction; it now names the section. Four smaller wording fixes followed.

## Deferred

Issue point 4, a "worth having" question in `integrity-lens`, and the pact-wide forms wait for #238. Mutation-backed minus-one waits for a mutation tool pinned by a lock file. Both are in #240.

## Record

The verbatim spec, its review and the move-4 reports are comments on #215. The follow-up and the measure are on #240.
