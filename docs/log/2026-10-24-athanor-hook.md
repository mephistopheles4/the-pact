# A hook holds local gate runs to athanor

**2026-10-24.** Two sessions skipped the written rule that local runs of the gate's tests go through athanor, and the owner wants a hook to enforce it, as grimoire's issue 377 did. Tier: standard, planned and built on Opus at medium.

## What was built (#383)

- **The hook:** `.claude/hooks/athanor-guard.mjs`, run by `.claude/settings.json` before every Bash and PowerShell call. It refuses a host `fast` or `full` run while `athanor --version` works, and is silent otherwise. Ported from grimoire's guard, with the-pact's own command forms (`env -u NODE_OPTIONS`, `$env:NODE_OPTIONS = $null;`).
- **The runner's fallback:** `gate/tests/run.mjs` learns `--host-fallback='<reason>'` on `fast` and `full`, takes a short reason in plain words only, and prints it before the run.
- **The push hold** in `AGENTS.md` and `docs/agents/gate-tests.md` adds `.claude/settings.json` and `.claude/hooks/`, and the checkout rule in `docs/agents/issue-tracker.md` names the hook script.
- **The settings file:** `.gitignore` lets out `/.claude/settings.json` alone, and a gate test holds it to the `hooks` key.
- **Docs:** `AGENTS.md`, `docs/agents/gate-tests.md` (The hook), `docs/reference.md`, and a line in `docs/threat-model.md` that the hook is a nudge, not a defence.

## Decisions

- [ADR 0104](../adr/0104-a-hook-holds-local-gate-runs-to-athanor.md): a hook holds local gate runs to athanor. Enforces ADR 0099.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/383), with [the spec pair's review](https://github.com/mephistopheles4/the-pact/issues/383#issuecomment-6387453987) and [spec revision 2](https://github.com/mephistopheles4/the-pact/issues/383#issuecomment-6387456657).
