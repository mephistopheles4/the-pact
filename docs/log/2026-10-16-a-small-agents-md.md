# A small AGENTS.md

**2026-10-16.** `AGENTS.md`, the file every session in this repo loads, had grown to 578 lines, most of it detail only some changes need and much of it a description of what the install script, the test runner and the gate's tests already enforce. The owner asked for it to be rewritten extremely small, with the rules in linked docs. On 2026-10-16 the owner folded in the "move 4" wording sweep: ADR 0060 had made the moves unnumbered practices, yet live text still called the Test stage "move 4". The owner set the tier: standard, not on the sensitive route.

## What was built (#270)

- **`AGENTS.md` is 97 lines,** with the heading and the four runner forms the run-guards test reads, the `## Agent skills` block, and one pointer line to the tracker rule.
- **Five docs under `docs/agents/`** took the rest, moved with their meaning unchanged: install, gate tests, changing rules (the probe rule and the protected set, word for word), parallel sessions and work records.
- **The tracker rule moved whole** to `docs/agents/issue-tracker.md` (ADR 0075, amending ADR 0062), with the threat model repointed and its note that the control is now one link from the loaded file.
- **The sweep:** "move 4" became "Test" in the nine lens contracts' live lines (each with a patch version and a changelog row), the threat model, the README figure's kickers and the gate's comments. Dated history, the old pact's planted mark names and Scriptorium's list positions stayed.

## What was weighed

- Whether the five tracker parts stay in the loaded file: the owner chose one home and a pointer line, accepting a weaker control.
- Whether the moved docs should drop what the code enforces: no, the docs keep their sections whole and the PR's table names each check.
- Whether the security pair reads the spec: the owner declined; one offer at Test stayed open.

## Record

The verbatim spec, its lens reviews and the owner's decisions are comments on #270:

- [The spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/270#issuecomment-6215593363)
- [The spec pair's crossing](https://github.com/mephistopheles4/the-pact/issues/270#issuecomment-6215593699)
- [The unstated-lens crossing](https://github.com/mephistopheles4/the-pact/issues/270#issuecomment-6215594022)
- [Owner decision, from chat](https://github.com/mephistopheles4/the-pact/issues/270#issuecomment-6215623297)
- [The move-4 sweep added to the scope](https://github.com/mephistopheles4/the-pact/issues/270#issuecomment-6215156659)
