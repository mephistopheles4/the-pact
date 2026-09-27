# Builders open with a status line; blocked is relayed verbatim

`builder`, `spec-builder` and `security-builder` open their final message with one exact line: `STATUS: DONE | BLOCKED | PARTIAL — <one-line reason>`. DONE means every done-criterion is met and verified; BLOCKED means the agent stopped before finishing, and every existing "stop and report" instruction now means BLOCKED; PARTIAL means some criteria are met and others not. When a builder returns `BLOCKED`, `PARTIAL` or no status line at all, the main session shows the owner the report verbatim before doing anything else, and waits. A missing line is a protocol miss, never assumed DONE. Read-only agents carry no status line and are not relayed this way.

## Why

- **A blocked result must not hide in prose.** A fixed first line can't be buried in a long report, and a later hook can check it with one regex.
- **The relay is the other half of the gate.** The gate in [ADR 0004](0004-gate-on-after-dispatch-needs.md) catches what can be foreseen; the relay catches surprises. Neither is enough alone.
- **Verbatim, because a summary decides for the owner.** No silent retry and no summary in place of the report: the owner reads what the agent said.
- **It is a stop that no skill overrides.** A builder's `BLOCKED` or `PARTIAL` joins the "When to stop or escalate" list in CLAUDE.md.
- **Only builders.** Read-only agents already return a verdict or an answer. Treating their returns as missing status lines would have halted every review.
- **Consistent with the owner's private research,** which settled verbatim relay for reviewer findings. The pact extends it to builders.

## How this was decided

- **2026-09-27** — Planned alongside the gate; `plan-reviewer`'s first round scoped the missing-line rule to the three builders. Told in [the human-in-the-loop gate log](../log/2026-09-27-human-in-the-loop-gate.md). The plan and its five reviews are in `f2cee57`; the build is `c0c8179`.
- **2026-09-27** — The probe's expected results were committed before the run (`4ef48c8`). Run 1, in the session that installed the change, failed: `spec-builder` stopped correctly but opened with no status line (`71053bd`). The likely cause, not confirmed, is that the session had loaded agent definitions before the install. Run 2, in a fresh session, passed (`507a6ab`).
