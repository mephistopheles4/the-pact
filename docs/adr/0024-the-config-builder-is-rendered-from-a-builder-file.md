# The config builder is rendered from a builder file

The config builder is one self-contained page, rendered from two halves that never mix:

- **The pact's half,** always from the clone: the moves, the locked clauses, the setting's range and the pact's agents.
- **The person's half,** from one builder file: their presets, their workflows, and their own skills, commands and agents.

`node builder/build.mjs --builder <file> --check` checks a builder file:

- It refuses whatever the page or the installer would break. Every preset goes through the installer's own renderer.
- It reports findings that never refuse.

`--out <page>` renders a page outside the clone. The `pact-builder` skill writes and revises a person's builder file from their own workflow. The shipped page is rendered from `examples/pact-config/builder.json`.

## Why

- **The owner's ask.** The builder should be "regeneratable just like how Eagle Eye and Ground Track work", so people "could generate this config builder using their own existing workflow and continuously improve on it".
- **Skills-native, not a fixed library.** The owner dropped third-party preset sets, both a library of borrowed presets and a choice between libraries. A person's presets come from their own skills, commands and agents.
- **The pact's half can't be forged.** The spine and the locked clauses come only from the clone. So a builder file cannot misstate what is locked, and the check refuses a file that tries.
- **It replaced a page-side folder picker.** An earlier version had the page read a folder the person picked. The owner found that confusing ("I am not sure what you mean by a specific folder"), and the regeneratable shape replaced it.
- **The page carries personal lists.** The command refuses to write a page inside the clone, where a commit would publish it.

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#97, in the build session. The owner's directions are recorded in the scope comments on the issue. The skill's home, a project skill in this repo rather than grimoire or the installed payload, was the owner's choice.
