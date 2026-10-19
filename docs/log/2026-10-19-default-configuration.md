# The pact's default configuration and skill sources

**2026-10-19.** #183, ticket T4a. A home install with no `pact/config.json` rendered the pact's plain text, and only the cloud setup's script knew which skills a session gets. A config-less home install now renders the pact's default configuration, Level 3 · Full, generated from its preset, and a configuration may name skill sources by pinned commit (ADR 0093). Tier: thorough, sensitive route; built in a cloud thread, test-first.

## What was built

- **`builder/default-config.mjs`** writes `builder/default-config/` from `builder/presets/level-3-full.json`, as the page saves that preset taken whole; `--check` exits 1 on a stale copy, and the kit refuses to regenerate.
- **The renderer** takes the default folder as an optional fourth argument, reads it only when the person has no file, prints `CONFIG default`, takes the digest over `default`, and names the default in its notice. It checks `skills` (`config-skills`) and prints a `SKILL` line per path after `TOOLS`.
- **The installer** passes the staged default on a home install only; parses `CONFIG default` and `SKILL` lines (`render-skill-twice`, `render-skill-count`, a skill with no configuration is `render-none-extras`); names the default and its digest in the Configuration block, says when the person's own configuration is gone (C35), prints a security-defaults line and a `skills:` block; records the default's digest and no configuration file. The builder kit lists the default folder and its generator.
- **The builder and its page** accept `skills` with the same checks in the same words (`builder/parts.mjs`'s `skillsProblems`), keep it on load and save, write it to `config.json`, show it as a preset row, and name each source in Export before Save.
- **AGENTS.md** gains the generator line and D12's sensitive-route line. `docs/install.md`, `docs/reference.md` and the README say what the default is; ADR 0091's bump procedure names the new pin homes and the owner's approval of sends.

## Tests

- **New:** `default-config.test.mjs` (the committed copy is current and a stale one fails `--check`; the page's save equals the generator's files, with and without skills; the default's workflow names the six skills; a person's render is the same with or without the default folder; 18 D4 rows refused alike, in the same words, by the page's checker, the renderer and the builder; the page keeps `skills`; AGENTS.md's D12 line). In `install-core.test.mjs`, 7 renderer-line rows and one with no configuration, and a parse of the default with skills. In `config-install.test.mjs`, the dry run of the default (C1), a configuration with skills (C6) and the gone configuration (C35).
- **Changed by D3, each because a config-less install now renders the default:** every config-less `--apply` in the install tests first takes the dry run's rendered hash (`applyBound`); the tests that expected `CONFIG none`, "no configuration" or the plain render on a home install now expect the default; the planted no-configuration rows plant a renderer with no default folder, so they still reach `CONFIG none`; the usage rows count the optional fourth argument.
- **Ready for C9:** the page's reset and Save tests read what they expect from `builder/default-config/config.json`, and the default's dry-run test expects a `skills:` line exactly when the default names skills, so the preset's `skills` entry lands with no test change. Each still pins the content through the C3 and C4 tests.
- **Since the lens review:** rows for the tightened skill-source shapes, the default folder's refusals and the 100-path boundary; the security-defaults line's changed-since check; Export's skill-sources line. Full tier at the head: 2249 tests, one failure, #333; with the C9 pin applied, the same.
- **Not run green here:** "a project holding the real home folder refuses" (#333) fails only in a cloud container, where home is `/root`.

## The first pin of `addyosmani/agent-skills`

Read in a cloud thread at commit `aeac41d4d005999432bb7312f7ff06383a91d59d`, an ancestor of the repo's `main`. Each of the six folders holds only `SKILL.md`, read in full: frontmatter `name` and `description` only, no link, no script, no URL. Sends of session data to an outside host: none that a skill makes itself. One flow for the owner to rule on with C9: `code-review-and-quality` and `shipping-and-launch` suggest `npm audit`, `pip-audit` or `cargo audit`, which send a project's dependency list (names and versions, no code) to the package registry when a session runs them. Noted for the owner: the skills point to sibling skills and to `../../references/*.md` that the six paths don't carry; `incremental-implementation` commits after every slice; `spec-driven-development` writes plans into the repo; `code-review-and-quality` sets a softer approval bar than the review procedure. **C9:** the owner approved the pin and its sends in chat on 2026-10-19, the audit flow included, and the preset's `skills` entry landed with no test change.

## Record

- Spec revision 7 and its sign-off: #183, comment 6259891767.
- The Test lens review, first round for all seven lenses at 969542d, with its Lens dispositions: #183, comments [6260628618](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6260628618), [6260629093](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6260629093) and [6260629617](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6260629617).
- PR #346.
