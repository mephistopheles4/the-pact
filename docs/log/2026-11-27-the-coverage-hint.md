# The coverage hint

PACT-34. The owner asked for an advisory hint, because sessions keep proposing fixes for findings an accepted class already covers. [Spec 0011](../spec/0011-coverage-hint.md) says what is built, and [ADR 0178](../adr/0178-the-coverage-hint-is-advisory-and-local-by-default.md) records the decision. It went in as three tickets: full Clef in `clef`; the `coverage` tool, its install and Scriptorium's decision-model menu; and the pact's side.

The pact text changes in `review.md`: a session with `coverage` on, outside a cloud session, puts the tool's one hint line under each security finding in a round comment, at most ten a round, or the `REFUSED` line of a refused run. The line changes nothing else. A round that sends findings to Jev logs one checkpoint line naming the repo and the count sent, which counts every run with Jev chosen except one refused with a word other than `coverage/internal`.

The threat model takes the Jev path (what leaves the machine, its controls, TypeSafe as out of scope while zero data retention is confirmed in writing, and until then a Jev send as one that comes to the owner, and what stays accepted), the tool's answer as text into a session, one accepted line for any backend's hint, which is open for the owner, and the pin table's second model. `docs/threat-entries.json` is this repo's entries file, and a gate test holds it to the threat model.

While the tool was built, TypeSafe's terms were read and found to state no retention limit, which stops the work under the spec. The build went on past that stop on the owner's decision 43, as relayed through the lead session, with Jev off unless the user lists a repo and sets a key. The terms stay open for the owner, and [coverage.md](../coverage.md#typesafes-terms) records them.

**Deploy:** install from one dry run with `coverage` on, then paste the cloud wrapper into the cloud environment again.

**Rolling back:** an older installer refuses both the tool and the key, so take `coverage` off the tools list and apply, then remove `decision-model` from `~/.pact/config.json`; run the four checks in [Roll back to an older version](../install.md#roll-back-to-an-older-version), then the dry run and apply of the previous release; revert the merge commit on a branch if the repo must follow. Findings already sent to TypeSafe can't be taken back.

## Record

- PACT-34 "Spec: the coverage hint, advisory V1 (spec ready)", with the spec rounds' dispositions (Linear comment)
- PACT-128 "stopped before the build, on TypeSafe's terms (S12)" and "spec delta, the decision-model choice" (Linear comments)
- PACT-34 "Test round 1 on 613bea96", "Test round 2 on 88efe67c" and "Test further read on 21effe07", with their lens replies (Linear comments)
- PACT-129 the build comments signed build-pact-129 (Linear comments)
