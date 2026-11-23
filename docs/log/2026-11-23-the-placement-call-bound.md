# The decision model's placement call is bounded by the session's own

PACT-66, T4 of spec 0002. `review.md` step 2 of "The threat model" has a session ask the decision model for the placement call (is a finding on an inbound or outbound boundary, or only on the owner's machine). The threat model said that call was "unbounded until T4". The bound the owner kept for it (spec 0002 S2 decision 5) was in no file a session loads, and T4 is the ticket that turns the decision model on, so the bound goes in now.

The owner's words, relayed by the lead (decision 31): "Yes, add it first".

- **`claude/review.md`, step 2:** after "without it, your own model makes the call", a session places the finding itself too. Where the two differ, or the model's answer is unsure, it comes to the owner, and a finding is never dropped on the model's answer alone. The model never settles a security sort, a severity or a checkpoint pick.
- **`docs/threat-model.md`:** the "Also accepted" line says the placement call is "bounded by the session's own" in place of "unbounded until T4". The file is at its 3,000-word cap, so two words are cut elsewhere in the decision-model bullet, with no change of meaning: "by the Hub's date" becomes "the Hub's date", and "belong to the machine" becomes "are the machine's". The security pair reads the edit as a control change.
- **`docs/rule-reasons.md`:** a row names the gap this covers: outside text can steer the model to a confident wrong placement, and nothing else compares its answer with the session's own or stops a finding being dropped on it.
- **Regenerated:** `builder/default-config/` and the cloud copy (`cloud-sessions/`), which carry `review.md`.

The same text is in the clef-pilot `decide` description (the owner's mod, outside this repo): Clef never settles a security sort, a `security?` mark, a severity or a checkpoint pick.

**Rolling back:** revert the commit and run the same two regenerations.

## Record

- The ticket: PACT-66 on Linear, and its parent PACT-61.
- The pull request: see the ticket.
