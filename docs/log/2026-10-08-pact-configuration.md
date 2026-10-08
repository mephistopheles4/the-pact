# The pact gets a configuration file

**2026-10-08** — A person can now configure the pact, and it keeps an opinionated default. This finishes mephistopheles4/the-pact#53, built in seven slices, #91 to #97.

- **A user file,** `~/.claude/pact/config.json`. It sets values (today the usage pause line), edits the four open parts of moves 1 to 4 from block files, and sets any pact lens's model and effort.
- **A project file,** `.claude/pact-config.json`. It can only make the pact stricter in that project.
- **The install renders the rules file** from the clone and the configuration. It shows every change in the dry run, and needs the full rendered hash handed back with `-Apply`.
- **The builder page,** `builder/scriptorium.html`. It builds a configuration without writing JSON, one step at a time. A person's own page comes from the `scriptorium` skill.
- **What stays locked:**
  - the gated clauses;
  - the risk floor and the security route;
  - move 4's reviewers;
  - never-substitute and stop-and-escalate;
  - the owner's decisions.

  No setting adds a tool or turns a check off.

## What it set out to do

The owner raised #53 on 2026-10-04. The ask was a file where a person brings their own agents, steps and skills, over a default that is solid with no file at all. oh-my-claudecode was the inspiration. The tension was control: a file must never configure away the rules that protect the owner. The work was thorough and on the security route from triage.

## How it was built

- **A throwaway first.** A prototype on `prototype/53-config` answered six questions across 58 scenarios. The owner then decided three things: refuse a bad file, let project files only tighten, and skip QA for the prototype.
- **The spec took four revisions.** The plan reviewer and the security reviewer read each one. Revision 4 was signed off with "Proceed to tickets" and cut into seven tickets. It planned no rule probe: no gated clause, security-set lens, allow-list or settings guard changed. Each slice proved its checks seen to fail instead.
- **The slices:**
  1. #91, the shared gate module (PR #103).
  2. #92, the renderer's no-file path, with a word check showing the marking commit changed no word (PR #109).
  3. #93, the user file and its values. Mutation passes caught 48 of 49 checks, then 10 of 10, and a third security read found one more (PR #116).
  4. #94, edits to open parts from block files, with a knockout record of every check caught (PR #119).
  5. #95, the project file and the project install, under the new security pair (PR #124).
  6. #96, a pinned Linux run of the whole gate suite (PR #132).
  7. #97, the builder page (PR #120).
- **#97 grew in session, at the owner's word:** "Keep it all in #97, kinda wanna close this".
  - The page moved to a builder file plus a skill, in place of a folder picker ([ADR 0026](../adr/0026-the-config-builder-is-rendered-from-a-builder-file.md)). Workflows apply with undo. At the owner's ask the page became a wizard: Start, then one move per step with that move's presets and the person's own skills beside it, then Agents, then Review and save.
  - Agent settings came first for `integrity-lens` alone ([ADR 0025](../adr/0025-a-configuration-sets-only-non-security-lenses.md)).
  - The owner then asked to "unlock all ... with opinionated defaults". A spec change went to the spec pair, `unstated-lens` and the security pair. Every pact lens is now configurable. The renderer classifies security-set lenses from their signs on every run, and an override of one is marked "override, not security-tested" ([ADR 0027](../adr/0027-every-pact-lens-is-configurable-with-opinionated-defaults.md)).
  - A "Reset all to defaults" button arrived, the skill was renamed `scriptorium`, and the page took the same name.
- **The ADR numbers moved.** #100 merged first with its own 0023 and 0024, so #97's ADRs became 0025 and 0026. Two #97 comments still cite the old numbers: 6046716507 says 0024 for the builder-file decision (now 0026), and 6046716213 says 0023 for the agent-settings decision (now 0025).

## What the checks showed

- **Each slice ended with move 4.** The QA pair read every slice. The security reviewer read the first four, and the security pair read the last three. Every finding was fixed or taken before the owner decided.
- **Picks.** Where the owner gave a pick, it was "none". It mismatched on #94 (C13), on #95 (C6, walked through in chat), and on #97 three times: C12, the spec change's S2 to S4, and C4 and C7. Each mismatch on #97 was resolved before owner review.
- **The cross script** refused two security-pair reports on rule `symbol`, a symbol holding a hyphen: on #95 and on #97's first move 4. Both reports were posted folded, and no lens was rerun.
- **The suite grew** from 636 tests at #91 to 1,609 at #97's last move 4, with 0 failing.
- **The live install's dry run** on #97, before merge: Drift 0, Delete 0. Installing is the owner's call after merge.

## What is still open

- **#135:** the cross script should add the override mark to a marked lens's section itself, so the mark no longer depends on a session following the notice.
- **#121:** move 4's "Worth a look" line and the thinking mirror, blocked on grimoire#151.
- **#123:** rewriting the moves without named skills, from the owner's research.
- **#90:** the soft reviewer, parked during #53's spec review.

## Record

- **#53 comments:**
  - 6021347029: the triage.
  - 6022483185: the design direction.
  - 6025090365, 6025174398, 6025464667 and 6025526085: the prototype's plan, its two security reads and its state.
  - 6025678736: the owner's decisions after the prototype.
  - Spec revisions 1 to 4 (6026029758, 6026206441, 6026338792, 6026462672), with their reviews (6026135185, 6026150967, 6026294590, 6026306314, 6026399700, 6026443816).
  - 6026478006 and 6026553132: the sign-off and the ticket cut.
  - 6027422162: #92's word check.
  - 6052217009 and 6052371762: #96's Linux run and its correction.
  - 6052418692: the hand-off of the log to #97.
- **#91:** 6026892132, 6026892417, 6026896719, 6026940160.
- **#92:** 6034754979, 6034755300, 6034853440, 6035234252.
- **#93:**
  - seen-to-fail: 6036104062, 6036175387, 6036678761;
  - mutation passes: 6036748121, 6037290401;
  - reviews: 6037072706, 6037072999, 6037324270, 6037416946, 6039456809, 6039560714;
  - dispositions and decision: 6037513597, 6039664118.
- **#94:**
  - the build's open calls: 6040052967;
  - reviews: 6041370158, 6041370686, 6041371040, 6041666922, 6041971879;
  - knockouts: 6041690272, 6041972178;
  - dispositions and decision: 6041667437, 6043730493.
- **#95:** reviews 6046822228, 6046822668 and 6046823063; dispositions and decision 6051795796.
- **#96:** reviews 6052371942 and 6052372107; dispositions and decision 6052418444.
- **#97:**
  - the scope: 6045426101, 6045661474, 6045838537;
  - the integrity-lens settings: spec 6045600302, its security read 6045743897, the decision 6045903218;
  - the oh-my-claudecode research: 6046716213;
  - the builder file and skill: 6046716507;
  - move 4 on 6981a02: 6046760266, 6046760739, 6046761069, with dispositions 6046917721;
  - the unlock spec: 6051819812, its reviews 6051880927, 6051881177 and 6051881381, dispositions 6051960683, and revision 1, 6051960947;
  - move 4 on 7564a9c..0ba7b6f: 6059432857, 6059433252, 6059433636, the state 6059434105, and dispositions 6059455022.
