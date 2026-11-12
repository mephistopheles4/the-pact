# Text steering is accepted, and no detector for injected wording is built

The threat model's accepted class **Text steers a session** now covers prompt injection in full (#526). Any text a session or a lens reads at run time can move it: issues, comments, files, notes, hand-offs, tool output, a fetched page. The pact builds no check to spot injected wording in that text. The steps kept for the owner (approval by the owner's words in chat, installs, mise trust, merges, anything published, worktree removals) are rules a steered session may break. Claude Code's permission prompts outside auto mode, its classifier in auto mode unless an installed mod approves the call, and any deny and ask rules, the pact's switches' included, stand behind them. A finding of the form "this text could steer a session" fits the class and needs nothing. Widening a class is a scope change, so it merges only on the owner's confirm in chat, as in [ADR 0132](0132-the-threat-model-holds-accepted-threat-classes.md). This adds no class and removes no control.

## Why

The owner's words, from the lead's chat: "i think all of the the prompt injection class should be ruled out cuz we cant build much guardrails for it, what do you think?" and, to the lead's proposal to accept the class, build no detectors for injected wording and keep the boundaries that hold for a steered session, "i agree".

## Considered options

- **A detector for injected wording** (refused-word lists, look-alike folds, hidden-text scans aimed at injection). Rejected: wording filters can't keep up with rewording, and they block honest text.
- **A new separate class.** Rejected: it duplicates "Text steers a session", which already names the source.

## Consequences

- **The owner-only steps are rules, not walls.** Two things stand without the session's cooperation:
  - Claude Code's permission prompts outside auto mode, and its classifier in auto mode unless an installed mod approves the call, with any deny and ask rules, the pact's switches' included;
  - for a body sent through the poster, the poster's two refusals, of hidden characters and of a live environment secret's value.

  Merges are gated by CI status, not by who merges ([ADR 0041](0041-a-required-ci-check-guards-main.md)), and the poster's refusals screen content, not approval.
- **Under a goal the steps pass to the session,** as "A standing goal decides alone" says ([ADR 0146](0146-a-standing-goal-reaches-the-sessions-its-holder-starts.md)). The exceptions are steps a rule keeps from a goal: this repo's install applies and mise trust (`AGENTS.md`, #505), and the worktree removals and usage go-ahead a session started for a goal never takes.
- **"Holds for a steered session" means "enforced without the session's cooperation".** A finding that such a control fails is not in this class and comes to the owner. So does a change that weakens one of the owner-only rules or one of these controls.
- **Five checks stay, and none is a detector of injected wording.** This decision is no ground for removing them:
  - the poster's refusal of hidden characters and of a live environment secret's value;
  - the poster's edit checks, the decision-mark fold included;
  - the install's text scanner;
  - the builder page's refusal of escaped invisible and direction-changing characters;
  - the tracker's whose-text-counts rule, with its author checker ([ADR 0062](0062-this-repo-keeps-its-own-tracker-rule.md)).

  The provenance work in #524 is not built yet, and when it is built it is not a detector either. Checks on authorship, on edits, on installed files and on what leaves the machine are outside "no detector".
- **Reviews spend no rounds on whether text a session reads at run time could steer it.** Text a change adds to files sessions load (rules, agents, skills, commands, a project's instructions) is still reviewed as part of the change.
- **A row dropped on the strength of this class is noted in its issue's record, citing this ADR.** The lead passes this ask to the sessions on #523, #524 and #525 before they drop rows.
- **No pact-wide rule pins every merge to the reviewed head.** `/scry` pins a merge to the head its ask described, and the class line makes no pinning claim. A rule that pins every merge is filed as its own issue after this merge.
- **Grimoire** carries a twin class in its own issue, kept in step there.
- **Rollback:** revert the change, and reopen the rows found through the drop notes.
