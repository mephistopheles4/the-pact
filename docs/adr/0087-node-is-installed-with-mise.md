# Node is installed with mise

The repo's instructions install Node with [mise](https://mise.jdx.dev/), not Volta: `mise use -g node@24` gets the current LTS that the gate suite and the install need. This replaces the Volta part of [ADR 0029](0029-the-gate-suite-runs-capped-on-the-current-node-lts.md); its cap and its LTS floor are unchanged.

## Why

- **Volta is unmaintained.** Its README says so, and recommends migrating to mise.
- **The owner's choice:** "I just realized that Volta is unmaintained, so I'm considering moving from Volta to mise en place", then a go-ahead for this change in chat on 2026-10-18.
- **Nothing else here depended on Volta.** CI gets Node through `actions/setup-node`, and the cloud-session setup never used Volta, so only the documented local command changes.

## What stays

The Node floor is still the current LTS, and Python tools still come through uv. Older records that name Volta are history and stay as written.

## How this was decided

- **2026-10-18** in chat with the owner, at the Quick tier; the record is the PR that carries this ADR.
