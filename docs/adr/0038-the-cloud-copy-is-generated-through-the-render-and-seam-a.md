# The cloud copy is generated through the render and seam A, and test-checked

The pact's copy for Claude Code cloud sessions is no longer kept by hand. `cloud-sessions/gen.mjs` builds `CLAUDE.cloud.md`, `cloud-setup.sh` and `cloud-setup-wrapper.sh` from the payload. It uses the same render and the same gate (seam A) a home install uses. A test fails whenever a committed output is stale.

- **Same sources as a home install.** The generator renders `claude/CLAUDE.md` with no configuration and stages the payload with the render in its place. It then runs seam A on that stage. The files the setup embeds are exactly seam A's `INSTALL` lines: the rules file, the nine lenses, `scout` and the cross script. The overlay is the one seam A hashed.
- **Two cloud edits, and nothing else.** E1 and E2 reword two paragraphs of "When parallel sessions work one chain" for a session without the desktop session tools. Each anchor must appear once, inside that section, and outside every gated clause. After the edits, every gated clause must still appear once, word for word and in order. Seam A runs a second time on the edited text, and every embedded file matches an `INSTALL` hash from that run. The test pins the edit list by its ids and a hash.
- **Every byte comes from reviewed templates.** The four `tpl-*.sh` files and the payload make up both scripts, joined by literal splices. The generator refuses an output whose form is wrong (`cloud/form`): a delimiter line in a body, a carriage return, a single quote in the overlay, or a hidden or direction-changing character. It also refuses links, non-plain index entries and private paths in the payload.
- **The setup proves itself.** The setup's Result section checks every written file against the sha256 the generator gave it. It prints `pact cloud copy <marker>` only when every file was written and every hash matched. The marker is the first 12 hex characters of the sha256 of the script itself, so the owner can match the cloud log to the merged generator. It also says whether a GitHub token was present during setup, without its value.
- **Kept word for word:** the Windows Shell rule and "Where this config lives". Keeping them keeps the gated `no-skill-overrides` clause byte-identical.
- **No configuration in the cloud.** The cloud copy takes the shipped defaults, such as the 75% usage line, never the owner's own configuration. The fit-check instruction "end the fit line with `Config: <digest>.`" is in every render and stays; with no configuration notice, a cloud session leaves the digest out.
- **Changes stay on the security route.** Every change to `cloud-sessions/` and to `gate/tests/cloud-sessions.test.mjs` takes it, as AGENTS.md says.

## Why

- **The hand-kept copy went stale and lost a safety rule.** It lacked the tracker rule (`tracker-authors`) and still named retired agents. So a cloud session would have taken any account's comment as the record once the repo is public (#179).
- **The gate already decides what a home install gets.** Running seam A over the same stage means the cloud copy refuses whatever a home install refuses, with no second list to keep in step.
- **A test is cheaper than discipline.** The README used to say "run gen.ps1 after any such change", and nobody did. The new test is in the `fast` tier, so any change to the payload that doesn't regenerate fails a normal test run.
- **Node, not PowerShell.** The generator calls the gate's own modules in-process, and the test can call it with no PowerShell.

## Accepted limits

- **The setup still runs unpinned third-party installs as root,** at every cloud start, before any pact rule loads. The owner accepted that risk by name on 2026-10-09; #182 pins or drops them.
- **The container run of the setup (C6) was not done.** The owner declined building its test image. Both scripts pass `bash -n` and `sh -n` on the existing `node:22` image with no network. The first real run is the owner's cloud setup log.
- **Cloud sessions can't read tracker authors yet.** The cloud's GitHub proxy rejects the `gh` commands that use GraphQL, and the pact's author reads use GraphQL. So the tracker rule fails closed there: nothing on the tracker counts, and the session asks the owner. #188 adds reads that work in the cloud.

## How this was decided

- **2026-10-09** in mephistopheles4/the-pact#179: the owner chose to bring the cloud copy fully up to date before #10's visibility flip. Spec v3 and its amendment A1 were reviewed by the security pair, the spec pair and `unstated-lens`, and the owner said "Proceed".
- **2026-10-09** in #181: the build, and the owner's answers to the four sign-off items left open (no C6 image, keep every skills entry, no trigger uses the environment, accept the unpinned-install risk now).
- **Supersedes** the hand-kept `CLAUDE.cloud.md` and `cloud-sessions/gen.ps1`. **Still holds:** [ADR 0035](0035-publish-with-the-history-as-it-is.md); the cloud copy is one of the surfaces the flip publishes.
