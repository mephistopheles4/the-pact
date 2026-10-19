# A gate test names what it backs and earns its place

Amended in part by [ADR 0093](0093-installs-back-up-what-they-replace.md) (2026-10-19): for #272 only, D2 is set aside, and a one-off sweep of the existing suite ran under the never-cut lists. D2 stands for all other work.

"Writing a gate test" in `AGENTS.md` now asks of each test a change adds or edits: what does it back, and is it worth having? `integrity-lens` asks whether a test can fail; nothing asked whether it was worth keeping, so the only pressure on the suite was upward. The rule is forward-only: it does not touch the 1,085 tests already in the suite (#215).

## The rule

- **A test names what it backs:** a claim of its issue (`#<issue> C<n>`), or a written invariant: a gate rule id, an ADR number, a threat-model risk, or a rule of this repo by its section heading. The name sits in a comment above the `test(...)` call, or once in the file header. A test that names nothing gets a stated reason or is cut. A backing comment never writes a file path or a script name, because the test runner reads comments when it picks and tiers a file.
- **Test what fails silently.** A path outside the gate's checks that already fails loudly, with a recoverable error the owner sees, needs no test of its own. A gate check's bad case is outside this: a vanished check passes everything in silence, and the existing bad-case rule stands.
- **Minus-one, by reading.** A test whose assertions another test already makes, on the same function and class of input, is a cut candidate, in a file the change is already editing. Each cut and its covering test go in an issue comment and the PR body, and to `integrity-lens` at move 4.
- **Size to review cost.** The PR body's second line is `Tests: +<added> −<cut>`.
- **Never a cut candidate:** the last bad case for a gate check, an install case (ADR 0047 governs), a test guarding the protected set, and any test in the cloud-sessions test file. When unclear, it is on the list.

## Decisions

- **D1. No guard test enforces naming.** A guard would parse every test and force a retrofit of the existing suite, which is the growth this pushes against. Move 4's review checks the rule.
- **D2. No sweep of the existing suite, and no prune issue.** The owner cut about 20,000 lines on 2026-10-10 and was asked at sign-off and took the recommendation: no prune issue is filed. D3's measure shows whether forward-only is enough.
- **D3. The measure is dogfood.** Read the `Tests:` line on the next five merged build PRs, then decide whether the rule does anything. The five lines are recorded on the follow-up issue, #240.

## Why it stays off the security route

The edit touches only "Writing a gate test" in `AGENTS.md`. It changes no gated clause, nothing in `claude/`, no gate code and no protected-set item. The never-a-cut list stops a cut rule from weakening a protected test, which the doubt clause would otherwise send to the security route. R21 (careless test edits) is defended by move 4's review, which now receives every cut and its covering test.

## Deferred

Held in one follow-up issue, #240, with their triggers: the spec naming which seams get tests, a "worth having" question in `integrity-lens`, and the pact-wide forms of these bullets in `claude/CLAUDE.md` (trigger: #238 merged); and mutation-backed minus-one (trigger: a mutation tool pinned by a lock file lands in this repo).
