# Add a quiet option to the greeting

Tier: standard. Suggested sessions: Plan: Opus, medium. Build: Sonnet, medium.

## What to build

`greet(name, { quiet: true })` in `src/greet.mjs` returns an empty string, so
a script can check a name without printing a greeting. Say so in the README.

## Acceptance criteria

- [ ] `greet(name, { quiet: true })` returns `''`.
- [ ] Without `quiet`, `greet` behaves as before.
- [ ] The README says how to use the quiet option.
- [ ] `node --test` passes.
