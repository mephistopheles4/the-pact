# The threat model takes Codex and Antigravity, and is capped at 3,700 words of prose

PACT-105 T8 ([spec 0007](../spec/0007-harness-agnostic-pact.md), S15, C27). The pact installs from `~/.pact` into Claude Code, Codex, Antigravity and any harness the owner describes, and an `npx` bootstrap fetches it from a release tag. [`docs/threat-model.md`](../threat-model.md) takes that design in, as spec 0007 writes it:

- **Boundaries.** The bootstrap, its clone, the guard hook and the release app's key under "Code that runs"; `~/.pact` and the harness folders under "Merges and installs"; what Codex and Antigravity sessions send to OpenAI and Google under "What leaves the machine".
- **Controls,** each with when it doesn't hold: both harnesses' sandbox and permission settings, the guard hook, the tag ruleset, the `release` environment, the release job's conditions and the bootstrap's checks.
- **Scope.** Codex with OpenAI's models and servers, and Antigravity with Google's, are out of scope, as Claude Code with Anthropic's are.
- **Classes.** "What you install and CI run" takes the bootstrap and the release app's key, named in its class line. A Codex lens that is read-only by instruction alone sits in the "Also accepted" line of "Review rests on rules", and an Antigravity session that starts an owner-typed command itself in that of "A session takes checkpoints alone". Those lines are part of their classes, whose class lines don't change.
- **A narrower control.** The poster may see fewer secrets under Codex.
- **The word cap** rises from 3,050 to 3,700 (`gate/tests/threat-model-cap.test.mjs`), for this repo's threat model. This amends the 3,000 of [ADR 0154](0154-threat-models-are-boundaries-first-and-capped.md), which [spec 0003](../spec/0003-clef-macos.md) had raised to 3,050.
- **The charts come back,** as the owner asked: the boundaries flowchart, with the harnesses, the new code that runs and the open crossing to the providers, and the quadrant of residual risk by class. The quadrant keeps its last judged places but two, for classes this change widens: "Review rests on rules" moves toward likely and severe, and "The pact gets loosened" a little toward severe. The other six were not judged again for this change.
- **The count leaves mermaid blocks out.** The test reads fences as Markdown does; only a closed block goes, and prose in or after anything else still counts.

## What waits for the owner

This record is no answer from the owner. Under [ADR 0132](0132-the-threat-model-holds-accepted-threat-classes.md), only a merge the owner confirms in chat widens a class, and a scope change and a weakened control come to the owner. The threat model's "Open gaps" says these are open; the change that carries the owner's answers drops that sentence. Open:

- **The three class widenings.** With the Codex one comes spec 0007's option to run Codex lenses only with the parent's network off and no MCP server in its profile; the threat model doesn't take it. On a no, each Codex lens runs in a separate session. On a no to the Antigravity one, Antigravity leaves the default install list. The spec doesn't say whether a command an Antigravity session starts itself can pass for the word an install apply or mise trust waits for; that is part of the same call.
- **The scope change,** due before this ticket merges (spec 0007 S20). It covers the crossing to OpenAI and Google, which no class and no control covers; the spec gives no fallback for a no. What each provider keeps of that context is set by the owner's account there.
- **The poster's narrower coverage** under Codex.
- **Two placements.** Spec 0007 names no class for a project install that tightens Claude Code alone, or for a hand-made or old copy that loads beside the pact. The lead session placed both under "The pact gets loosened".
- **The release app and its key.** A ruleset bypass can name no actor narrower than every workflow while the release job tags with the workflow's own token, so the packaging ticket tags with a GitHub App used for releases alone, the tag ruleset's one bypass, its key a secret of an environment only `main` deploys to (the lead session's flagged pick, taken against spec 0007's "no secrets"). The key does all `contents: write` does, so a stolen one can tag, push a branch no ruleset covers and merge what `main`'s ruleset lets through.

Whatever is answered, the threat model's text and charts follow. The cap, the count that leaves charts out and the two moved places are the lead and build sessions' flagged picks, for the owner to review.

## Why

The new harnesses add code that runs before any dry run or before each shell call, a key that writes tags, folders the install writes and two model providers that receive session context. A security read places a finding only on what the threat model names.

The file held 3,049 words of a cap of 3,050, and the new text didn't fit. Raising the cap cuts no control and no accepted risk.

The charts were removed twice to fit the count (PACT-65, PACT-101). A chart is for the reader's eye and repeats what the text holds, so counting it trades a picture for security text.

## Considered options

- **Cut about 550 words of existing text.** Rejected: it rewrites controls and accepted risks to make room for others.
- **Drop the word budgets first** (PACT-39). Rejected for this ticket: it would hold the threat model behind work not yet planned.
- **A second page for the harnesses.** Rejected: the security lenses are handed the threat model, and a second page would hide accepted risks from them ([ADR 0130](0130-the-threat-model-keeps-its-accepted-risks-by-class.md)'s reason).

## Consequences

- A session reads about 610 more words of threat model, and the two charts.
- Text inside a closed mermaid block is bounded by no cap, and a `%%` comment there doesn't show on the rendered page; a change to the threat model is read like any change.
- The text describes controls that spec 0007's other tickets build. A ticket that ships one differently changes the text with it.
- **Rollback:** revert the change; the cap and the count go back with the text.
