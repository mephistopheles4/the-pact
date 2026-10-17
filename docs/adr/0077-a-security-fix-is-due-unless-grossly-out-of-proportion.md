# A security fix is due unless its cost is grossly out of proportion

The security lenses hold an ALARP bar: a security fix is due unless its cost is grossly out of proportion to the risk it closes, and the owner sees both. The rules file defines a security finding, and accepted risks live only in a project's threat model (#278, #289; the owner approved the spec on 2026-10-15).

## What changed

- **The bar.** No cost row, Enough level or limit text lowers it. A cost can route a finding, never remove it.
- **What counts as security.** A finding is security when it names an attacker in scope in the threat model as it stood before the change, touches an item on the sensitive-work list, or exposes a secret or personal data to anyone but the owner. The sorting session, which holds the threat model, decides; a lens outside the security pair marks an unsure one `security?`, and that row is never `auto`.
- **Accepted risks.** Only the owner's word records one, in chat or relayed by a lead session the owner set up, in the project's threat model, with its date, its finding and how the word arrived. A finding that matches an entry is still reported, as one line marked accepted by the threat model and naming the entry (#300); it never blocks. An undated entry counts and is named as undated. A change that weakens an entry is raised in full. A change's own edit to the threat model, or to the line that names it, is a finding for the owner, whichever lenses ran. With no threat model the risk is flagged and nothing is written.
- **The detail level.** An entry, or a candidate, names the class of path and why it is accepted, never the steps, because a threat model is committed text that may be public.

## Why

- **Limits must not quietly trade security away.** A lens that never sees a limit pushes without bound; a limit with no floor lets a cost row hide a real defect.
- **A threat model a change can edit must not accept its own risk.** Reading it at the base, and bringing every edit to the owner, closes that.
- **A lens that goes silent on a listed risk hides it.** The owner's direction was to align what the human and the AI say, not to hinder the AI: the lens reports the risk and labels it (#300).

## What was weighed

- **Dropping a matched finding from the report.** Not taken: a planted or undated entry would then hide a finding.
- **A store for accepted risks outside the threat model.** Not taken: the pact forces no file on a project.

Builds on [ADR 0068](0068-qualities-a-ranked-list-each-lens-checks-against.md).
