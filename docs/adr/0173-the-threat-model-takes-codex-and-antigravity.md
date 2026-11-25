# The threat model takes Codex and Antigravity, and is capped at 3,600 words

PACT-105 T8 ([spec 0007](../spec/0007-harness-agnostic-pact.md), S15, C27). The pact installs from `~/.pact` into Claude Code, Codex, Antigravity and any harness the owner describes, and an `npx` bootstrap fetches it from a release tag. [`docs/threat-model.md`](../threat-model.md) takes that design in, as spec 0007 writes it:

- **Boundaries.** The bootstrap, its clone, the guard hook and the release job's tag token under "Code that runs"; `~/.pact` and the harness folders under "Merges and installs"; what Codex and Antigravity sessions send to OpenAI and Google under "What leaves the machine".
- **Controls,** each with when it doesn't hold: both harnesses' sandbox and permission settings, the guard hook, the tag ruleset, the release job's conditions and the bootstrap's checks.
- **Scope.** Codex with OpenAI's models and servers, and Antigravity with Google's, are out of scope, as Claude Code with Anthropic's are.
- **Classes.** "What you install and CI run" takes the bootstrap and the tag token. "Review rests on rules" takes a Codex lens that is read-only by instruction alone. "A session takes checkpoints alone" takes an Antigravity session that starts an owner-typed command itself.
- **A narrower control.** The poster may see fewer secrets under Codex.
- **The word cap** rises from 3,050 to 3,600 (`gate/tests/threat-model-cap.test.mjs`), for this repo's threat model. This amends the 3,000 of [ADR 0154](0154-threat-models-are-boundaries-first-and-capped.md), which [spec 0003](../spec/0003-clef-macos.md) had raised to 3,050.

## What waits for the owner

This record is no answer from the owner. Under [ADR 0132](0132-the-threat-model-holds-accepted-threat-classes.md), only a merge the owner confirms in chat widens a class, and a scope change and a weakened control come to the owner. Open: the three class widenings, the scope change and the poster's narrower coverage. The cap is the lead session's flagged pick, for the owner to review.

On a no to the Codex widening, each Codex lens runs in a separate session. On a no to the Antigravity widening, Antigravity leaves the default install list. Either way the threat model's text follows the answer.

## Why

The new harnesses add code that runs before any dry run or before each shell call, a token that writes tags, folders the install writes and two model providers that receive session context. A security read places a finding only on what the threat model names.

The file held 3,049 words of a cap of 3,050, and the new text didn't fit. Raising the cap cuts no control and no accepted risk.

## Considered options

- **Cut about 500 words of existing text.** Rejected: it rewrites controls and accepted risks to make room for others.
- **Drop the word budgets first** (PACT-39). Rejected for this ticket: it would hold the threat model behind work not yet planned.
- **A second page for the harnesses.** Rejected: the security lenses are handed the threat model, and a second page would hide accepted risks from them ([ADR 0130](0130-the-threat-model-keeps-its-accepted-risks-by-class.md)'s reason).

## Consequences

- A session reads about 530 more words of threat model.
- The text describes controls that spec 0007's other tickets build. A ticket that ships one differently changes the text with it.
- Spec 0007 names no class for two residuals. Project installs that tighten Claude Code alone, and a hand-made or old copy that loads beside the pact, sit under "The pact gets loosened".
- **Rollback:** revert the change; the cap goes back with the text.
