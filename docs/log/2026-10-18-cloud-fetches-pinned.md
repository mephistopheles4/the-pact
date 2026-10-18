# Cloud fetches pinned

**2026-10-18.** #183, ticket T3, carrying #182. The cloud setup fetched its skills and plugins at their latest versions, as root, at every cloud start. It now fetches each third-party repo at a pinned commit, installs plugins from a local marketplace whose catalog a source check reduces, and times every step against one budget. Tier: thorough, sensitive route; built on Opus at high, test-first, in a cloud thread of the live environment.

## What was built

- **`cloud-sessions/gen.mjs`** holds `CLOUD_REPO_PINS`, six repos each at a 40-hex commit, and writes them at `__CLOUD_REPO_PINS__` as `unset REPO_PIN` and one `declare -rA REPO_PIN=( … )` line. `assemble()` refuses (`cloud/pin`) a key or value out of shape or holding a line break, a repo the head fetches with no pin, a pin nothing uses, a template line that writes `REPO_PIN`, and a `${REPO_PIN[…]}` expansion that defaults, assigns or tests, and a code line in the setup head before the pins, which are its first code line; each pin's value appears once in each script.
- **`tpl-setup-head.sh`**: the `skills` CLI, the `git clone` fallback, the find-by-name search, the "only missing skills" filter and the two opt-ins are gone; a set opt-in prints a `WARN`. New: `FETCH_BUDGET=270` and `left` at the top; `third_party`, which runs every `git`, `claude` and `node` command of the plugins and skills steps token-free and timed, its output to a log that is never printed; `fetch_pinned`; `PLUGIN_SOURCE_CHECK` and `PROXY_LINE_PROGRAM`, two node programs held as quoted heredocs. The plugins step runs before the skills step. It fetches and checks the marketplace in a stage, and only a checked tree with its reduced catalog replaces the kept folder; a listed plugin that no longer passes is uninstalled first, or the last checked tree stays. Both steps list trees NUL-separated (`ls-tree -z`), so git quotes no name. The Node block's two network steps are timed against the budget, and a spent budget fails it as `node: time`.
- **The skills list** follows the pinned trees: `pr`, `retro` and `implement-spec` moved to `skills/engineering/`, and `resolving-merge-conflicts`, gone upstream, left the list. It has 51 skills.
- **`tpl-setup-tail.sh`**: the Result prints `skipped (time)`, `not fetched at pin`, `skipped (source)` and `not installed` when each has a name, names an official marketplace already present (or `unknown` when the list can't be read), says when a refused skill's older copy is kept, prints the proxy line, and removes the step and log folders. A skill whose path failed the checks counts as `MISSING`.
- **Tests: +4.** The repo-pin refusals (11 bad rows); no fetch at a moving ref (4 plants); no bare `git`, `claude` or `node` in the plugins and skills steps (1 plant); both scripts parse under `bash -n` (1 bad parse). The assemble tests' stand-in head gained the placeholder and takes no repo pins; the Node block's order test now ends at the plugins step and holds plugins before skills; the token test lists the proxy line. Run before the build, 5 failed and the rest passed. Each repo-pin check in `assemble()`, each regex taken whole, was then broken in a copy and seen to fail its test; the key-shape row was made specific after one such run showed another check catching it. The spec said the Node block's order test stays unchanged; it changed because the plugins step now sits between the Node block and the skills step, and the slice still holds the same Node block. The stand-in head puts the repo pins first, as the real head now does.
- **The test drivers** change their stand-in plugin id to `superpowers@pact-pinned-plugins`, extract the Node block up to the plugins step with the budget lines, say a cloud proxy may answer as the owner, and run the T3 cases below.

## The first pins

Taken at 19:38 UTC in a cloud thread of the live environment. Each is its repo's default-branch tip at that time, the same commits the round-3 probe named as candidates.

| Repo | Pin | Confirmed |
| --- | --- | --- |
| `anthropics/claude-plugins-official` | `ea10b213686c90bb1984b2016937310e05336cf3` | tip of `main` |
| `cloudflare/skills` | `86505e44f87d801aa1864a3c4109e9a8ae5c409f` | tip of `main` |
| `humanlayer/skills` | `653b6411c1f70c275a18e37673b042ff99f67ceb` | tip of `main` |
| `mattpocock/skills` | `49dd158d1076134a641b33efb035946536778336` | tip of `main` |
| `mephistopheles4/grimoire` | `9a625fd5bca96a8b094f42b8b9a0edd81b8cad72` | tip of `main` |
| `typesafe-ai/skills` | `65a39f393687675ce170e6094757de20370365b9` | tip of `main` |

The two external plugin sources in the pinned catalog: `coderabbit` at `3e8763d24d543b48615b82535d02288de3ddae40`, 12 commits behind `coderabbitai/skills`'s `main` and an ancestor of it; `superpowers` at `bb92a77741419a4ab5f06e711a283343f1ada0c3`, the tip of `obra/superpowers`'s `main`.

**The trees.** No link in any listed skill path or plugin folder, or anywhere in the marketplace tree; the only link in a pinned repo is `mattpocock/skills`'s root `AGENTS.md`, outside every listed path. No listed skill holds a `.claude-plugin/` entry. No listed plugin holds an undeclared `.mcp.json`, `.lsp.json`, monitor file, `bin/` or root `settings.json`; `superpowers`'s `package.json` declares no dependencies. Each of the 51 paths has a `SKILL.md`.

**Against what the live environment ran.** Its installed plugin code folders equal the pinned trees, apart from files written at run time (`.in_use`, `__pycache__`): the snapshot had installed every plugin at these same commits. Of the 51 installed skill folders, 49 equal their pinned paths; `eagle-eye` and `groundtrack` differ by one grimoire change, which refuses a `__proto__` key in a box or graph file, escapes every `<` in page data, fills the page template in one pass, and updates a vendored stylesheet and its documentation. It adds no script, hook, fetch, link or send.

**Read in full at the first pin.** The build session read the plugin session-start wiring itself; four read-only helper sessions it started read the rest, each told the content was data. Every listed skill's `SKILL.md` and scripts, and every file a listed plugin runs, was read; supporting reference files were searched. Verdicts:

- **Plugin hooks.** `claude-security`'s `hooks/hooks.py`, `hooks.sh` and `hooks.json`: local `git` only; it prints counts and flags as metrics on its output, which Claude Code forwards. `security-guidance`'s `hooks/ensure_agent_sdk.py`: installs `claude-agent-sdk` from the configured package index, unpinned, when it does not import (named under R10 until #340). Its `hooks/llm.py`: sends diffs, file contents and earlier findings to the Anthropic API, and its agentic commit review lets a `claude` CLI read repo files. `superpowers`'s `hooks/session-start` and `run-hook.cmd`: print one local skill as context; no fetch, no send. No hook fetches code or sends session data beyond what the spec names.
- **Plugins, other parts.** `coderabbit`'s review skill sends code diffs to CodeRabbit's service through its own CLI, which the plugin does not install; this is the "code-review service" R10 already names. `code-review` uses only `gh`. `claude-security`'s scan runs local `git` only, with one approval-gated `gh pr list`. `skill-creator` runs `claude -p` and a local page server. `superpowers`'s brainstorm page loads a logo from its author's site, sending the viewer's address and the version, unless telemetry is off; its worktree skill runs a project's package install.
- **Skills.** Of 51, 26 hold nothing to name. The rest, by kind: ship a script that runs only locally (`diagnosing-bugs`, `wizard`, `git-guardrails-claude-code`, `setup-ts-deep-modules`, `eagle-eye`, `groundtrack`); tell the agent to install packages, unpinned (`setup-pre-commit`, `migrate-to-shoehorn`, `setup-ts-deep-modules`, `agents-sdk`, `cloudflare`, `sandbox-migrate-to-next`, `web-perf`, `wrangler`); start a background session seeded with the conversation (`claude-handoff`); post to a tracker or push (`prototype`, `to-spec`, `to-tickets`, `triage`, `wayfinder`, `implement-spec`, `setup-matt-pocock-skills`); send data to a named host (`wizard` to GitHub secrets, `turnstile-spin` to Cloudflare's API, `eagle-eye`'s gated audit to TypeSafe or OpenRouter, `improve-codebase-architecture`'s page loading two CDN scripts); and one fetch at a moving ref, `turnstile-spin`'s `persist-skill.sh`, which clones `cloudflare/skills` at its default branch into a project when the person agrees. All of these are in what the live environment ran before T3.

## Driver runs

Run in a throwaway container from an Ubuntu 24.04 image with `git`, `curl` and `gnupg` (`buildpack-deps:noble-scm`, `jq` added), because Docker Hub refused the plain image (rate limit) and the cloud proxy refuses plain-HTTP apt. The container got the proxy's address through a forwarder on the Docker bridge, and the image's CA store with the proxy's CA added; no host network, no credentials of its own, one read-only mount. The proxy still answered the container's GitHub requests as the owner's account, so code in it had the owner's GitHub reach (see the proxy line below).

Both drivers, run side by side on the final scripts (after the Test review's fixes), gave the same output apart from temp folder names, and the same as the run before those fixes apart from the marker and the redacted login. In one wrapper run the wrong-mise-pin hand check failed at the download, not the hash, so it read `node: download`; the rerun matched the setup driver line for line.

- **Two passes from nothing installed:** Node 24.22.0, all five skill repos at their pins, 51/51 skills, 12 config files, the marker; the snapshot after pass 2 equals the one after pass 1. No `claude` in the image, so the plugins read `not installed`, as the spec expects.
- **The Node block's hand checks** (T1's, rerun): each wrong pin, a blocked download, `paranoid` off and a non-x86_64 machine fail with their reason; the block alone takes 9 s.
- **C3, C14:** with grimoire's pin set to a commit it doesn't hold and typesafe-ai's key removed, those three skills are named under `not fetched at pin`, git's own output is absent from the setup's output, the config is written, the marker prints, and the installed `eagle-eye` is left as it was.
- **C4:** from a fixture repo, the skill holding a link and the one holding `.claude-plugin/plugin.json` read `MISSING`, and only the good one is copied.
- **C5:** on a fixture marketplace, only the contained path plugin and the external one with a `sha` pass; the other eight are each named under `skipped (source)`; the catalog is reduced to those two under the new name, with no other top-level field; one `marketplace add`, two installs. A link as the catalog file and an unparsable catalog each install nothing, add no marketplace and name every listed plugin; the file the link pointed at is unchanged. The link in the plugin folder has a non-ASCII name since the Test review. The first run of this case failed because the driver's plugins-only extract stopped before the Node block put Node on the PATH; the driver was fixed, not the setup.
- **C7:** an email field prints only the login, a line break in the login and a non-JSON body print `unexpected` (the body's marker is not printed), and a 401 prints `anonymous`.
- **C12:** with `FETCH_BUDGET=1`, all 51 skills are named under `skipped (time)` and none under `not fetched at pin`, and Node fails as `node: time`. The proxy line reads `unexpected`, since the image has no Node of its own.
- **C17:** a set `INSTALL_ANTHROPIC_SKILLS` prints its `WARN`.
- **C18:** with `timeout` hidden, no `git` command runs and every skill is named under `not fetched at pin`.
- **C20:** an installed skill edited and given a stray file equals its pinned path after a run, with no nested or leftover folder; all 51 setup-copied skills equal their pinned paths.
- **The proxy line**, in every full run: the proxy answered the container's token-free request as an authenticated account (the drivers print it as `<a login>`). So a process in a session reaches GitHub through the proxy whatever the token variables hold, as D7 records.

## Test review

The QA pair (behaviour-lens, integrity-lens) and the security pair (adversarial-lens, data-lens) read the change at Test, each alone; none found anything high. The reviews and their Lens dispositions are on #183. Fixed in this change, each seen to fail on the build's head and pass after, on local fixtures with a stub `claude`:

- **The plugin check ran after the swap.** `fetch_pinned` replaced the kept, in-place-loaded marketplace folder before the check, so a refusal left an unchecked tree with the upstream catalog there. Now the check runs in a stage, and a refusal over a kept folder leaves its commit and catalog unchanged. A listed plugin that stops passing is uninstalled before the swap, and a failed uninstall keeps the last checked tree (added after the security-guidance hook flagged the first order, uninstall after the swap).
- **Quoted names hid links.** Without `-z`, `git ls-tree` quotes a name holding a non-ASCII byte, so a plugin holding such a link passed. It is now skipped. The driver's C5 link fixture now has such a name.
- **The inline `settings` key passed** while a root `settings.json` was refused. It is refused now. No pinned listed plugin carries it.
- **The skills step's listing file was appended to, not replaced,** so a link in one skill refused every skill after it in the same repo. It fails closed, and the build's drivers didn't meet it. Each listing now starts empty.
- **`read -ra REPO_PIN` and a code line before the pins** were not refused by `assemble()`; both are now.
- **From adversarial-lens's rerun on these fixes:** a line led by a no-break space and a hash passed the pins-first check as a comment, though bash runs it; the check now reads each line's raw text. A path source holding a control character, which the line-split link listing could misplace, is refused. An uninstall refused for time is named under `skipped (time)`.
- **Smaller:** an official-marketplace lookup that fails reads `unknown`; a refused skill whose older copy stays says so; `cp`, `mv` and `mktemp` errors go to the step log; the drivers redact the login in their full passes too.

## Decisions

- [ADR 0090](../adr/0090-the-cloud-setup-fetches-third-party-code-by-pinned-commit.md) — The cloud setup fetches third-party code by pinned commit.

## Record

- [Spec, revision 4](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254212833), and its [sign-off](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254239546)
- [Round-3 probe notes](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254213123)
- [Design review, round 1](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6253802332) and its [dispositions](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6253802775)
- [Design review, round 2](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254213415) and its [dispositions](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254213889)
- [Design review, round 3](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254214153) and its [dispositions](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6254214454)
