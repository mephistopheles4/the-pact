# The Scriptorium page has a fixed path in the Claude home

Amends [ADR 0070](0070-the-builder-is-part-of-the-pact.md)'s write rule (PACT-96, the owner's choice). With no `--out`, the kit's `build.mjs --builder <file>` writes the page to `pact/scriptorium.html` in the Claude home (`CLAUDE_CONFIG_DIR` when set, else `~/.claude`), making `pact/` if it is missing and replacing the page already there. Before, it wrote a new file in a new temporary folder on every run.

## What changed

- **One path is let into the home.** The default path is let past the Claude-home, `.claude`-folder and new-file refusals, and no other. It must be a plain file when it exists: `lstat` sees a link, a folder or anything else there and refuses. The clone, builder-file and git-work-tree refusals hold for it.
- **`--out` keeps every refusal.** Given `--out`, a page still goes only to a new file outside this clone, the kit, the Claude home, any `.claude` folder and any git work tree, written with `wx`. Naming the fixed path in `--out` is refused like any other path in the home.
- **A replace is a rename.** The page is written to a temporary file in `pact/`, then renamed over the old one. A failed write leaves the old page whole, and a link planted after the check is replaced by the rename, never followed. The previous page is not kept.
- **The `NOTE` changes.** It says the page sits in the Claude folder beside the builder file, holds the same lists in plain text, and may be deleted when done. No text says "delete its folder" any more, since that folder is now `pact/`.

## Why

- **A page in a new temporary folder was easy to lose and left a folder behind each run.** The owner wants one place to open it from.
- **A commit can't publish it there.** The Claude home is checked to be outside any git work tree, so the reason for the old rule, that a page carries the person's lists and a commit would publish them, does not apply to this path.

## What it costs

Safety against interaction: "never write in the Claude home" now has one exception, a single file the builder owns. The home is the owner's own folder and outside any repo.

The page holds what `pact/builder.json` already holds, in the same folder: the person's lists, every preset listed from `pact/presets/` and any agent files, in plain text. It fits the threat model's accepted residual that a builder file keeps what was typed into it, and adds no class.
The install neither writes nor deletes `pact/scriptorium.html`. It is not in the install's copy set, which puts the page in the kit as `pact/builder/builder/scriptorium.html`, and no record or rollback manifest lists it.
