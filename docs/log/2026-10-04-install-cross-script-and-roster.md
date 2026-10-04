# Installing the cross script and teaching the gate the lens roster

**2026-10-04** — The install now copies the lens cross script to one fixed path, `~/.claude/pact/cross.mjs`, fingerprints it and flags a changed copy as drift. The gate learned a fixed list of thirteen reviewer names and refuses any pact or agent file that names one that is not installed. A pair of lenses with either lens missing now counts as unavailable as a whole. It was built on the security route over three rounds of move 4 (mephistopheles4/the-pact#45, PR #64, merged as `eed71ea`) and installed from main at `5aa3385` on the owner's go-ahead. The probe that the repo's rules asked for was dropped by the owner.

## What it set out to do

This was part 2 of ticket 1 of the review-lenses work (#35). Part 1 (#44) wrote the cross script, which takes the two reports of a lens pair and posts them safely. This part makes the script part of the pact like any other file: installed, hashed and guarded. The pact calls only that installed copy. The gate refuses a name that points at a reviewer which is not installed, so a pact text cannot ask for a lens that does not exist. Today's four reviewers stayed installed and unchanged in behaviour.

## What was built

- **A new file kind.** The gate classifies the cross script by an exact path. The install adds it to its expected set and records its hash. A tampered installed copy shows as drift in the dry run. An "ask" rule on edits to the script's installed path joined the settings overlay and the gate's settings allow-list.
- **The pact's call.** The pact names the full installed path through `$HOME`, clears `NODE_OPTIONS`, and names both failure exit codes and what each means. Output with no closing `RESULT:` line means the script is unavailable: stop and report.
- **The roster and the name checks.** One list of thirteen names: today's four reviewers and nine lenses. The gate refuses a roster name that is not installed, whether in a code span or plain text, in each place the pact names reviewers and in the body of an installed agent file. It also catches a name wrapped at its hyphen or written with a minus sign. A lens file may name no reviewer but itself.
- **The half-pair stop.** The gated "never substitute" clause now says a pair with a missing lens is unavailable. A weakened copy fails seam A.
- **The import rule.** The install refuses the cross script if it imports anything but `crypto`, `fs` and `path`. The rule's comment says plainly that it catches an accidental import, not a deliberate one.

## What the checks showed

- **Tests:** 512 gate tests pass at `1dcdd2f`, up from 492 in round 1.
- **`result-checker`: CONFIRMED** in all three rounds. Round 1's advisory (a name written across two lines or with a maths minus could slip past the name check) was fixed in round 2.
- **`test-reviewer`: no weakening** in all three rounds. Round 1 found two test gaps (a POSIX control skipped without PowerShell; a deleted-copy test that never ran `-Apply`). Round 2 found that "always ends with a RESULT line" was tested on one path only. All were closed.
- **`security-reviewer`: FINDINGS** each round. Round 1: the pact's wording for a failed cross run dropped "never raw report text", and the required probe had not run. Round 2: fixed the wording; added an import rule. Round 3: the import rule matches what the script needs; two wording slips were fixed in `1dcdd2f`. The probe was the one item left open.
- **CodeRabbit** reviewed PR #64 once and had no actionable comments.

## The probe the owner dropped

The repo's rules require a planted probe, seen to fail, for a change to a gated clause or the settings guard. `security-reviewer` raised this in rounds 1 to 3. The probe was split out to #63, as #46 had split out #54. The owner dropped #63 and changed the rule instead (#67). So this change went in without a probe of the half-pair stop or the new "ask" rule. The gate tests carry the evidence: each new check has a planted bad case.

## What is still open

- **Unguarded wording.** The pact's call paragraph is held by tests, not by seam A.
- **Exit 2.** The exit-2 wording still pulls slightly toward posting raw text.
- **Error stream.** Text written to the error stream after `RESULT:` is not checked.
- **Deliberate evasion.** The import rule does not stop it; anyone who can edit the script can edit the gate.
- **Carried items for a periodic review.** A card that moves whole can lose its group heading (`cards()` and `pack()` in the script); two small `cross-mutation` test nitpicks; the render-check outputs as fixtures. The cloud copy of the pact is out of scope (#41).

## Record

Issue comments on mephistopheles4/the-pact#45:

- `5981955798`, `5982552750` — items carried from #44.
- `5983841796`, `5983937374`, `5984074471` — verbatim: `test-reviewer` rounds 1 to 3.
- `5983868865`, `5983970419`, `5984097050` — verbatim: `result-checker` rounds 1 to 3.
- `5983882799`, `5983958141`, `5984088521` — verbatim: `security-reviewer` rounds 1 to 3.
- `5984077946` — the probe split out to #63. `5984139739` — the state at the end of the build. `5984300855` — the merge. `5984811200` — the install, and the probe dropped.

Commits:

- `1dcdd2f` — the last build commit (two wording slips). `eed71ea` — the merge of PR #64.
- `5aa3385` — the merge of PR #66; the install was run from it.
