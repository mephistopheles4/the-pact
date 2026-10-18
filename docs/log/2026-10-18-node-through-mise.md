# Node through mise

**2026-10-18.** Volta, which the repo named for installing Node, is unmaintained; its README recommends mise. The owner asked to move to mise. Tier: quick.

## What was built

- **`docs/agents/gate-tests.md`** now says `mise use -g node@24` gets the current LTS.
- **ADR 0029** gains a "Since" line pointing to the new ADR; its cap and LTS floor stand.
- **No gate code changed.** CI uses `actions/setup-node`, and the cloud-session setup never used Volta.

## Decisions

- [ADR 0087](../adr/0087-node-is-installed-with-mise.md) — Node is installed with mise.

## Record

- The owner's request and go-ahead were in chat on 2026-10-18; no issue was filed. The PR that carries this entry is the record.
