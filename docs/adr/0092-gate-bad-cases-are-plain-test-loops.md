# Gate bad cases are plain test() loops

A gate module's bad cases are still rows: one plant on a base input that passes, and the exact rule ids it must fail with. Since #272 (T1) they run as a plain loop over node's `test()` in their own test file, with one test of the base before the rows and one after, and `gate/tests/tables.mjs` and its self-test `tables.test.mjs` are gone.

## What changed

- **Each table is a block of plain consts.** `base`, `run`, an optional `everyRow` and `rows` keep the bodies they had in the `table(...)` call, row for row, and the block registers the tests itself:
  `test('<name>: base passes', ...)`, then ``for (const r of rows) test(`<name>: ${r.id}`, ...)``, then `test('<name>: base passes after the rows', ...)`. The test names are the ones `table()` made, so every former row is found by the same name. 54 tables in twelve test files, and the shared-state check in `gate-run.test.mjs`, were converted.
- **The same assertions,** from two helpers in `gate/tests/text.mjs`, which touches nothing (ADR 0034): `assertPasses` (exit 0, `RESULT: pass` last, no `FAIL` line) and `assertFails` (exit 1, `RESULT: fail` last, the set of `FAIL` rule ids equal to the row's, and `says` when it is given). `moduleResult` and `tokens` moved there unchanged.
- **The checks the helper made at load time are dropped,** each with its cover:
  - a rule id no literal in the module holds: a row naming an id the module never prints fails its exact-id assertion;
  - a plant that leaves the bytes unchanged: the row then runs the base, which passes, so its exit-1 assertion fails;
  - a duplicate or odd row id, or a malformed table: dropped, since neither can make a test unable to fail;
  - a missing `why`: "A test names what it backs", which review enforces;
  - the registration guard, which caught a loop inside a branch or a function, a row whose body was emptied, and a loop registered through another function: for this change, the before-and-after comparison of test names; after it, the QA pair's read of every change to the gate's tests (`AGENTS.md`), as R21 now records.
- **No copy of the base per row.** `table()` copied the base before each plant. Every converted base returns a fresh object of strings, so each row's plant gets its own.

## Why

- **The owner's request** on #272: tests the owner can read and trust without learning a framework. `tables.mjs` was a 333-line framework with a 225-line self-test, and every reader of a bad case had to know what `table()` asserted.
- **Nothing a row checked is lost.** The full run's test names before and after differ by exactly `tables.test.mjs`'s 29 tests and the helper import guard's test for `tables.mjs`, by the owner's reading of the spec's count claim (q1, relayed by the head chef, 2026-10-18).

## How this was decided

- **2026-10-18** on #272: spec revision 5, its threat-model texts and the ticket cut, approved by the owner on the sensitive route and relayed by the head chef; this ADR for T1 on its own, by the owner's q2. It supersedes in part [ADR 0031](0031-gate-bad-cases-are-table-rows-and-no-case-is-lost.md), [ADR 0045](0045-agent-and-rule-changes-are-proved-by-review-not-by-probe.md) and [ADR 0047](0047-install-cases-are-cut-by-covering-row.md), where they describe the table module.
