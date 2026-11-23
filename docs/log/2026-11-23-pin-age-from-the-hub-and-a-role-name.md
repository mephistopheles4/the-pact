# The model's pin age comes from the Hub, and the pact text names a role

PACT-61, on the stack of PRs 644 to 646 (spec 0002). Two changes, both on T3's branch.

**The model's age.** It no longer counts from the day this repo first recorded the file's sha256. It counts from the Hugging Face Hub's own record of the pinned file's last change: the `lastCommit` date the tree API returns for that file at the pinned commit. For a file uploaded through `huggingface_hub` that is a server time; a commit pushed with git carries a date its pusher chose, so the pin record names the route when the Hub shows it. The 14-day rule is unchanged for every pin, and no code checks it: review holds it. The first model pin's file (`Clef-Flash-Q4_K_M.gguf`, sha256 `eef2968c…`) last changed on 2026-10-25, so the "not before 2026-12-06" line is gone from the spec, [ADR 0166](../adr/0166-a-pinned-download-is-at-least-14-days-old.md) and the doc. This loosens one control, a date a pusher can pick against a date the pact recorded itself, so the security pair reads it as a control change.

**The role name.** `review.md` and the threat model say "a decision model", not the product. Clef is named only in the tools list, `claude/tools/clef.mjs`, `docs/clef.md`, the spec and the pin facts, so another System 1 model can replace it by a setting and a runner, with no change to the rules.

**Rolling back:** revert the merge; the spec, the ADR and the doc return to counting from the first recorded date.
