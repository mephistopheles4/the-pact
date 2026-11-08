# Record mode keeps paths and names

**2026-11-08.** The owner asked to drop the rules about local paths, and then the user and host names too, from record mode. `--record` in the gate's test runner had replaced this machine's folders and names with placeholders and refused to write a record that still held one, which also failed passing runs with exit 3. Tier: standard; not on the sensitive-work list (decision 169).

## What was built (#507)

- **`gate/tests/run.mjs`:** `--record` writes everything printed, plus the result line, as printed. The scrub, the leak check and the imports only they used are gone. A record path inside the repo still exits 2, and a record that can't be written still exits 3 with `record refused`.
- **`gate/tests/run.test.mjs`:** five scrub and leak tests cut; two shell tests rewritten (a failing run and a passing run, each recorded as printed); one new (a record that can't be written). The PR reads `Tests: +1 −5`.
- **Texts:** `docs/agents/gate-tests.md`, the `run.mjs` header, the test file's headers, `fixtures/linux/run.sh` and the Dockerfile comment say the output is written as printed.
- **Not changed:** `claude/review.md`, the `--host-fallback` reason check (`PLAIN_REASON`, a separate check, left as it is), and the rule that test output is posted only from record mode.

## Decisions

- [ADR 0145](../adr/0145-record-mode-writes-the-output-as-printed.md): record mode writes the output as printed. Amends ADR 0030, ADR 0098 and ADR 0143, strikes 0030's security-route sentence, and gives the reason the record-only posting rule stays.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/507).
- [The approved spec, revision 4](https://github.com/mephistopheles4/the-pact/issues/507#issuecomment-6722389800).
- [Spec round 1](https://github.com/mephistopheles4/the-pact/issues/507#issuecomment-6722392021) and [spec round 2](https://github.com/mephistopheles4/the-pact/issues/507#issuecomment-6722394463).
- [Test round 1](https://github.com/mephistopheles4/the-pact/issues/507#issuecomment-6722882504).
