# A standing goal reaches the sessions its holder starts

#505, thorough tier on the sensitive route, built by pact-505-build from spec v3.1, with two spec changes (v3.2: "a worktree removal"; v3.3, after Test round 1: the owner's words in a started session's chat beat the holder's reply and are recorded there, the holder's log is by kind, the threat-model clause adds a reply the session can't tell from its starter's, and AGENTS.md says a goal never stands for the owner's word for an install apply or mise trust).

The Guards' fixed block (`stop-and-escalate` in `claude/CLAUDE.md`) gains one sentence in the standing-goal bullet and one bullet, "Working for a goal", about 165 words in all. The owner's words in a session's chat narrow a goal for that session and those it starts; text may narrow it only by keeping a step for the owner. A session the goal's holder started for it holds no goal: what the rules would bring to the owner, but the usage go-ahead and a worktree removal, goes to the holder, and only the holder's reply counts, logged as the holder's and never the owner's. One hop; with no reply the item waits for the owner.

The docs that restate the rule say the same: `CONTEXT.md`, `README.md`, `docs/rule-reasons.md` (the goal row widened, "Working for a goal" added), `docs/agents/changing-rules.md` (protected-set items 1 and 2) and `docs/threat-model.md`, where "A standing goal decides alone" gains the started-session clause and its likelihood goes from 0.20 to 0.30 in the chart and the table. The `goal-note` eval still fits and is unchanged. The generated `cloud-sessions/` and `builder/scriptorium.html` follow; `builder/default-config/` was checked and needs no change, since the fixed block is not in it. [ADR 0146](../adr/0146-a-standing-goal-reaches-the-sessions-its-holder-starts.md) records why and amends 0137 and 0128; the spec called it 0143, and 0143 to 0145 landed first.

This is a protected-set change. The merge ask names the class widening and rescore, the controls removed for a started session, the protected-set change and the outside-model flow. The grimoire half (the head-chef skill carrying no goal rule) is a separate issue.

**Rolling back:** a revert PR, merged on the owner's confirm in chat once CI's two jobs pass on its head; then the normal dry run and the owner's apply. The threat-model score and the cloud paste revert with it.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/505
- Design round 1 on spec v1: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6720908019
- Design round 2 on spec v2 (final): https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6720946816
- Design round 3 on spec v3: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6720947222
- Spec v3.1: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6720949190
- Proceed: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6723115820
- Proceed, re-posted with the owner-decision mark: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6723186056
- Spec change, "a worktree removal" for "a cleaner removal": https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6723245789
- Test round 1 on 600b2fa: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6723461174
- Owner decision, from chat, spec change v3.3: https://github.com/mephistopheles4/the-pact/issues/505#issuecomment-6723539871
