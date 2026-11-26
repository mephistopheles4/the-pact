# Scriptorium sets each harness's agent models and tier efforts

**2026-11-26.** PACT-111, ticket T2 of [spec 0008](../spec/0008-per-harness-models-and-efforts.md).

## What changed

- **The page.** Harnesses gains three sections: a model per agent for each harness, a plan and build effort per tier for each harness, and a read-only table across harnesses.
- **Writing a change.** It writes one key of the harness's own entry. A renamed tier moves its key and a dropped tier removes it, in the folder's entries too.
- **The overview page.** `node builder/build.mjs --overview <file>` writes the table alone from the home configuration, to a new file outside any repo, and installs nothing.
- **A role picked for one agent** is written as the model that role names in that harness, since `agentModels` renders as written.

**What the gate bounds:** no check changes. For the page, the renderer exports `tierKey` and gains `tierRows`, which reads the tiers table, and the harness descriptions export `TIER_KEY_RE`.

**Rolling back:** revert the change. A configuration the page saved stays readable by the installer of ticket T1.

## Record

- PACT-111 on Linear: ticket T2's checkpoints and Test round comments
- Ticket T2's pull request into `pact-105-codex-sol`
