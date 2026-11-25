# The threat model takes Codex and Antigravity

PACT-105 T8, thorough tier on the sensitive route. `docs/threat-model.md` takes in [spec 0007](../spec/0007-harness-agnostic-pact.md)'s design as S15 writes it, and [ADR 0173](../adr/0173-the-threat-model-takes-codex-and-antigravity.md) records it with the calls still open for the owner.

The file held 3,049 words of a cap of 3,050 and the new text added about 550, so the build stopped, as S20 says. The lead session picked a cap of 3,600 over cutting security text or waiting for PACT-39 (S2 item 47).
The owner then asked, through the lead session, for the threat model's two charts back in the same effort. The count now leaves mermaid blocks out (S2 item 48), with tests that prose past the cap still fails. Both changes to the gate are in `gate/tests/threat-model-cap.test.mjs`.

## Record

- PACT-105, the comments titled "Test round" for ticket T8, and its status comment.
