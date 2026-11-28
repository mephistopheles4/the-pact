# The coverage hint

PACT-34. The owner asked for an advisory hint, because sessions keep proposing fixes for findings an accepted class already covers. [Spec 0010](../spec/0010-coverage-hint.md) says what is built, and [ADR 0178](../adr/0178-the-coverage-hint-is-advisory-and-local-by-default.md) records the decision. It went in as three tickets: full Clef in `clef`; the `coverage` tool, its install and Scriptorium's decision-model menu; and the pact's side.

The pact text changes in `review.md`: a session with `coverage` on, outside a cloud session, puts the tool's one hint line under each security finding in a round comment, at most ten a round. The line changes nothing else.

The threat model takes the Jev path (what leaves the machine, its controls, TypeSafe as out of scope, and what stays accepted), the tool's answer as text into a session, one accepted line for any backend's hint, which is open for the owner, and the pin table's second model. `docs/threat-entries.json` is this repo's entries file, and a gate test holds it to the threat model.

While the tool was built, TypeSafe's terms were read and found to state no retention limit, which stops the work under the spec. The build went on with Jev off unless the user lists a repo and sets a key, and [coverage.md](../coverage.md#typesafes-terms) records the terms.

**Deploy:** install from one dry run with `coverage` on, then paste the cloud wrapper into the cloud environment again.

**Rolling back:** take `decision-model` out of `~/.pact/config.json` first, since an older installer refuses the key; run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), then the dry run and apply of the previous release; revert the merge commit on a branch if the repo must follow. Findings already sent to TypeSafe can't be taken back.

## Record

- PACT-34 "Spec: the coverage hint, advisory V1 (spec ready)", with the spec rounds' dispositions (Linear comment)
- PACT-128 "stopped before the build, on TypeSafe's terms (S12)" and "spec delta, the decision-model choice" (Linear comments)
- PACT-129 the build comment signed build-pact-129 (Linear comment)
