# The default configuration takes the owner's parts

PACT-96, standard tier. The Level 3 · Full preset, and so the default configuration a home install with no configuration of its own renders, now carries the owner's tiers, sensitive work, workflow graph and cost limits as the owner's builder file held them on 2026-11-23, with an empty layout so the page arranges the graph.

**Input validation leaves the default sensitive list.** The preset's sensitive items are `auth`, `crypto` and `data migrations`, and its route is thorough, planned on Opus at high and built on Sonnet at high. This loosens a security default for every install with no configuration of its own. The owner decided it (decision 133, "remove it"). The pact text's own list in `claude/CLAUDE.md`, and the rule `AGENTS.md` probe 2 reads, still hold input validation: only the preset and `builder/default-config/` drop it. A one-line mention of the loosening in the dry run was not added, an accepted-risk candidate under Hardening.

**No skill sources.** The preset no longer carries a `skills` key, so the default config lists none and the dry run shows no `skills:` block (decision 133: users install the skills they want). Skills and commands are named on the stages only.

**Commands on skills.** A workflow skill takes an optional `command` of 1 to 40 characters, lowercase letters, digits and `-`, starting with a letter. It compiles as `` `skill`'s `command` command: mode, when ``; a bad one is a workflow error in the page and in `build.mjs --check`. The preset uses it for impeccable's `shape`, `audit`, `critique` and `document`.

**The page.** The Scriptorium page arranges cards by their rendered height, clamps a card's words to three lines with the full text on hover, and takes "In your words" in a three-row text box. [ADR 0171](../adr/0171-the-scriptorium-page-has-a-fixed-path-in-the-claude-home.md) gives the page a fixed path, `pact/scriptorium.html` in the Claude home, written through a temporary file renamed over the last page.

The rules file rendered from the new default stays within its 2450-word budget (2096 words).

**Rolling back:** revert the PR, run `node builder/default-config.mjs` and `node builder/build.mjs`, and reinstall through the dry run and the owner's apply. A configuration of your own is never affected.

## Record

- PACT-96 spec (Linear), decisions 132, 133 and 135
