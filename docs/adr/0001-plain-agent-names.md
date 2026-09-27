# Agents carry plain job-title names

Each agent is named for the job it does, so a person reading `CLAUDE.md`, a routing decision or a transcript can tell what it does without a glossary: `builder`, `spec-builder`, `security-builder`, `plan-reviewer`, `result-checker`, `test-reviewer`, with `scout`, `Explore` and `security-reviewer` kept as they were. The file name matches the agent's `name:` field. `Explore` keeps its exact name because that is what overrides the built-in agent of the same name.

## Why

- **The old names needed decoding.** "Mech" in `mech-executor` was jargon, and `verifier` and `plan-verifier` sounded like one agent at two stages when they are different jobs.
- **A name should say the job.** `spec-builder` builds exactly to a spec; `builder` builds with local design calls; `result-checker` checks the built result; `plan-reviewer` reviews a plan.
- **One family, one word.** The three agents that write code all end in "builder", so the security one reads as a sibling of the other two, not as a different kind of thing.
- **Consistent with the owner's private research,** which is silent on agent names but prefers plain names over internal codes.

## How this was decided

- **2026-09-26** — The owner chose "plain job titles" from the options in the plan. The work, its plan reviews and its security review are told in [the agent names and allowlists log](../log/2026-09-26-agent-names-and-allowlists.md). Built in `3828f29`, which also holds the plan and its reviews verbatim.
- **2026-09-26** — A fresh session confirmed that all nine new names load and no old name does (the check report is in `d0ae7f1`).
- **Not renamed:** the cloud-session scripts still carry the old names until the cloud setup is rewritten to clone this repo. History written before the rename keeps the names used at the time.
