# Text steering is accepted, and no further detector for injected wording is built

The threat model's accepted class **Text steers a session** now covers prompt injection in full (#526). Any text a session or a lens reads while it works can move it: issues, comments, files, notes, hand-offs, tool output, a fetched page. The pact builds no further check to spot injected wording in that text. The steps kept for the owner (approval by the owner's words in chat, installs, mise trust, merges, anything published, worktree removals) are rules a steered session may break. A finding of the form "this text could steer a session" fits the class and needs nothing. Widening a class merges only on the owner's confirm in chat, as in [ADR 0132](0132-the-threat-model-holds-accepted-threat-classes.md). This adds no class and removes no control.

## Why

The owner's words, in chat with the session leading the work: "i think all of the the prompt injection class should be ruled out cuz we cant build much guardrails for it, what do you think?" and, to the proposal to accept the class, build no detectors for injected wording and keep the boundaries that hold for a steered session, "i agree".

## Considered options

- **A detector for injected wording** (refused-word lists, look-alike folds, hidden-text scans aimed at injection). Rejected: wording filters can't keep up with rewording, and they block honest text.
- **A new separate class.** Rejected: it duplicates "Text steers a session", which already names the source.

## Consequences

- **The owner-only steps are rules, not walls, and less stands behind them than the names suggest.** What stands without the session's cooperation, and what it does not do:
  - Permission prompts exist only outside auto mode. The settings overlay pins auto mode, so on a default install they do not appear.
  - In auto mode the classifier is the brake, unless an installed mod approves the call. A mod can also approve a call a deny rule refuses (`docs/cleaner.md`). A start prompt a session writes can clear a soft block ([ADR 0063](0063-the-pact-sets-no-ask-rules-and-defers-to-the-harness.md)).
  - Deny rules exist only for the cleaner's removals and for the stop commands while `session-stop-deny` is on. None covers merges, publishing, installs or mise trust, so the classifier is the only Claude Code brake on those.
  - The poster's refusals, of hidden characters and of a live environment secret's value, hold only for a body already sent through the poster. A steered session that posts with raw `gh` breaks a rule and is in this class. The refusals screen content, not approval.
  - Merges are gated by CI status, not by who merges, and a session whose token can manage the repo could edit or disable the ruleset ([ADR 0041](0041-a-required-ci-check-guards-main.md), Limits).
- **Under a goal the steps pass to the session that holds it,** as "A standing goal decides alone" says ([ADR 0146](0146-a-standing-goal-reaches-the-sessions-its-holder-starts.md)). The exceptions are steps a rule keeps from a goal: this repo's install applies and mise trust (`AGENTS.md`, #505), and worktree removals, which a rule keeps from any goal, and the usage go-ahead, which a session started for a goal never takes.
- **"Holds for a steered session" means "enforced without the session's cooperation".** A finding that such a control fails is not in this class and comes to the owner. A change that weakens one of the owner-only rules or one of these controls also comes to the owner.
- **A change that adds a route for outside text into a session, or carries it into one with more reach, is not in this class.** More reach means a lead, or a session that can merge, post or install. Such a change is reviewed as the change it is.
- **Five checks stay, and none is a detector of injected wording.** This decision is no ground for removing them, and a gap in one, or its removal, stays under review:
  - the poster's refusal of hidden characters and of a live environment secret's value;
  - the poster's edit checks, the decision-mark fold included;
  - the install's text scanner;
  - the builder page's refusal of escaped invisible and direction-changing characters;
  - the tracker's whose-text-counts rule, with its author checker ([ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md)).

  Checks on authorship, on edits, on installed files and on what leaves the machine are outside "no further detector". Provenance work for hand-offs, when it is built, is not a detector either.
- **Reviews spend no rounds on whether text a session reads while it works could steer it.** Text a change adds to files sessions load (rules, agents, skills, commands, a project's instructions) is shipped text, not read-while-working text, and is still reviewed as part of the change. The rules the security lenses carry stay as they are.
- **What a steered session posts falls under the class "Posts are public",** which this decision does not change.
- **A review row dropped on the strength of this class is noted in its issue's record, citing this ADR.** A review row is a check that a spec or a review would have run.
- **No pact-wide rule pins every merge to the reviewed head.** `/scry` pins a merge to the head its ask described, so "merges pin the reviewed head" holds only through `/scry`. The class line makes no pinning claim.
- **Rollback:** revert the change, and reopen the rows found through the drop notes.
