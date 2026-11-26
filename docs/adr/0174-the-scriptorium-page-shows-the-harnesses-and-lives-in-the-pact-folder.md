# The Scriptorium page shows the harnesses, from the pact folder

Amends [ADR 0171](0171-the-scriptorium-page-has-a-fixed-path-in-the-claude-home.md) (spec 0007 S11). The fixed page path is `~/.pact/scriptorium.html`; no environment variable moves it. 0171's refusals stand, read for the pact folder: only that path is let in, as a plain file, replaced by a rename; `--out` keeps every refusal; the clone, builder-file and git-work-tree refusals hold.

## What changed

- **The bootstrap writes it before any install.** Its builder choice runs the clone's `build.mjs`, on `~/.pact/builder.json` when there is one, else the example file, and installs nothing.
- **The page has a Harnesses dialog.** Each harness's place in the install list and three models, a form for a harness of the person's own, and, read only, the rules, agents, commands and skills each would receive.
- **The page runs the installer's harness code.** `build.mjs` copies `gate/harnesses.mjs` and `gate/harness-render.mjs` into the page's script, so the page chooses, checks and renders as the install does. A test holds what the page shows to what the renderer writes.
- **The builder kit grows.** It gains `gate/install-core.mjs`, `gate/harnesses.mjs`, `gate/harness-render.mjs` and `harnesses/known.json`.
- **The builder reads the machine only when it writes the fixed-path page.** It reads `config.json`'s `harnesses`, `commands` and `tools`, the harness ids in `install.json`, and which detect folders exist. Own-harness paths go in as `~/` paths. What the install would refuse is a finding naming its rule, never the file's text. For the committed page and an `--out` page it reads none of it.
- **A save keeps `harnesses`.** It applies each change made on the page, a harness taken in or out, one model, one harness added or removed, over what the folder's `config.json` holds. A downloaded file reads no folder. Before, a save dropped the key.

## Why

- **The page must not drift from the install.** A second renderer written for the page would show text the install does not write.
- **The rows need the machine.** "The harnesses the dry run would see" depends on folders and a record the page, opened from disk, cannot read.

## What it costs

- **The install core is now installed, into the kit.** It runs nothing on import, but it is a file under the home folder that the kit's builder imports. The copy-set check still lets a gate file install only into the kit.
- **The page holds more of the pact folder.** Harness descriptions and model names, which may name a provider account or project, sit in the page in plain text beside `config.json`, which already holds them. The accepted residual for a builder file's text covers it.
- **The view is not the install.** The line naming the configuration is a placeholder, since only the install computes its fingerprint; settings keys, hooks, tools and the review procedure are not shown. The install stays the authority on what a save installs.
