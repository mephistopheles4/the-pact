# The pact has a default configuration, and a configuration names skill sources

Since #183 (T4a), a home install with no `~/.claude/pact/config.json` no longer renders the pact's plain text: it renders the pact's default configuration, Level 3 · Full, the configuration the Scriptorium page starts from. And a configuration, or a builder file, may carry a `skills` list naming skill folders in pinned repos, for the cloud setup to fetch once it reads a configuration (T4b); in T4a nothing fetches them.

## What changed

- **One source, one generated copy.** `builder/presets/level-3-full.json` is the one editable source. `node builder/default-config.mjs` writes `builder/default-config/` from it (`config.json`, and `blocks/<mark>.md` for each part whose text differs from the pact's), exactly as the page saves that preset taken whole: both compile with `builder/parts.mjs`, and a gate test holds their files equal. `--check` exits 1 on a stale copy. A preset that sets agent files can't be the default.
- **The installer's choice.** With no file of the person's, the renderer, given the staged default folder as a fourth argument, reads the default under the same read rules and prints `CONFIG default <sha256>`; its digest is taken over `default` where a person's is taken over `user`. The default counts as a configuration that applies, so the dry run names it ("the pact's default, Level 3 · Full", with its digest), prints the security-defaults line for the parts it edits, and `--apply` needs `--rendered-hash`. The install record holds the default's digest and no configuration file. A person's own configuration always wins whole; the default is never merged into it. A project install never takes the default, and a project configuration still needs a home one of the person's. When the last install had the person's own configuration and the file is gone, the dry run says so beside naming the default.
- **Where it ships.** The default folder and its generator are in the builder kit, so an installed kit carries them under `pact/builder/builder/`; the kit never regenerates the default.
- **Skill sources.** `skills` is a list of `{ "repo": "owner/name", "commit": "<40 hex>", "paths": [...] }`: each repo once (compared without case), a full lowercase commit, relative paths of letters, digits, `.`, `_` and `-` with no `.` or `..` segment, a last segment that starts with neither `.` nor `-` and names one path only, and 100 paths at most. The renderer (`config-skills`), the builder and its page refuse the same lists in the same words. The checks also refuse an owner or a path segment starting with `-`, and a repo name that is only dots or ends in `.git`, so the list can't pass an option to git or name one repo twice. The renderer prints one `SKILL <repo> <commit> <path>` line per path after `TOOLS`; the install parses them, prints a `skills:` block, and fetches nothing: the gate stays offline.
- **A change to the default is sensitive work.** AGENTS.md routes a change to the preset, the default folder, the generator, the installer's choice of the default, or `cloud-sessions/pin-floor` (the lowest pact commit the cloud wrapper accepts, added by T4b) through the sensitive route with the security pair. This amends in part [ADR 0072](0072-this-repo-has-no-security-route-of-its-own.md): it is the one change this repo routes to the security pair by its own list, because it sets the security defaults of every install with no configuration.
- **The security-defaults line for the default** says whether the default changed since the default was last installed, from the digest the record holds.

## Why

- **The owner's R2 on #183:** anyone can run the pact without building a configuration first, and home and cloud render the same thing from one source.
- **One default everywhere, at a cost:** every config-less install sees the `workflow` change and the security-defaults line at its next dry run, and its apply needs the rendered hash. The spec's trade-off point took this side.
- **Skills in the configuration, not the setup script:** the cloud setup's pinned skill list moves to where a person's configuration lives (T4b), so a person's cloud gets their skills and the default gets its own.

## What stays

- The cloud copy is unchanged by T4a: `cloud-sessions/gen.mjs` still renders with no configuration. ADR 0038's "no configuration in the cloud" is superseded when T4b moves the cloud to the fetched install.
- The default's `skills` entry names the six skills' folders in `addyosmani/agent-skills` at `aeac41d4d005999432bb7312f7ff06383a91d59d`. The owner approved the pin and its sends in chat on 2026-10-19 (the spec's D13), the registry audit commands two of the skills suggest included. In T4a nothing fetches them.

## How this was decided

- **2026-10-19** on #183: spec revision 7 signed off by the owner (comment 6259891767), D2 to D4, D12 and D13, with the default applying installer-wide (D3). Built on the sensitive route. Amends in part [ADR 0072](0072-this-repo-has-no-security-route-of-its-own.md). Supersedes in part [ADR 0038](0038-the-cloud-copy-is-generated-through-the-render-and-seam-a.md) once T4b ships; extends [ADR 0091](0091-the-cloud-setup-fetches-third-party-code-by-pinned-commit.md)'s bump procedure.
