# The cloud copy is generated

**2026-10-09** — the pact's copy for Claude Code cloud sessions is now generated from the payload, through the same render and seam A a home install uses, and a test fails when it goes stale (mephistopheles4/the-pact#179, built in #181). See [ADR 0038](../adr/0038-the-cloud-copy-is-generated-through-the-render-and-seam-a.md).

- **`cloud-sessions/gen.mjs`** replaces `gen.ps1`. It lists the payload with git, renders `claude/CLAUDE.md` with no configuration, and runs seam A on the stage. It then applies the two cloud edits, runs seam A again, and assembles both scripts from templates. `--check` writes nothing and names each stale output.
- **The cloud copy now carries the whole pact:** `tracker-authors`, #170's `no-skill-overrides` sentence, the nine lenses, `scout` and the cross script. Before, it lacked the tracker rule, named retired agents, and missed `scout` and the cross script, so every lens review in a cloud session stopped.
- **The setup checks itself.** Each written file is checked against its sha256. The log prints `pact cloud copy <marker>` only when everything matched, and says whether a GitHub token was present during setup.
- **`gate/tests/cloud-sessions.test.mjs`**, in the `fast` tier: 39 cases. The committed outputs must equal the generator's, and every refusal is held to its rule id with no absolute path in its message.
- **Docs:** the README's Status section and AGENTS.md name the command, the test and the security-route rule.

## What it set out to do

#179 asked for the hand-kept `CLAUDE.cloud.md` to catch up with the pact, at least the tracker rule, before #10's visibility flip. The owner chose to bring it fully up to date, and asked for it fast. The triage asked for a design that stops the copy going stale again, if that didn't slow the flip. Generating it through the gate did both in one ticket.

## What was found

- **Seam A accepts the edited rules text.** The second seam A run passes, so no gate rule was loosened.
- **The script is about four times larger:** about 193 KB, up from 46 KB, because it now embeds the whole rules file, `scout` and the 54 KB cross script. The cloud docs give no size limit for the setup field; the owner's paste is the check.
- **The cloud's GitHub proxy blocks GraphQL.** The docs say `gh issue` and `gh pr` fail in a cloud session, and the pact's author reads use GraphQL. So the tracker rule fails closed there. Filed as #188.
- **The proxy may set a stand-in token.** With the GitHub proxy, `GH_TOKEN` and `GITHUB_TOKEN` read `proxy-injected`. The setup's token line would then say "present". Because the owner accepted the unpinned-install risk now, nothing gates on that line.
- **The time budget held.** The `fast` tier took 94.2 s on 43 files before the change, and __AFTER__ after it. The new test file alone takes about 5 s.
- **The `Config:` check reads the filled form.** The spec asked for "no `Config:` digest instruction", but the fit-check instruction naming `Config: <digest>` is in every render. The test refuses a filled digest (`Config:` and 12 hex characters) and the "Configuration in effect" notice instead.

- **Move 4 tightened the tests and the setup.** `integrity-lens` found ten checks with no bad case or no independent comparison; each now has one, and six hand mutants of the generator were each caught by its new case. `adversarial-lens` found the plugin listing had no timeout and no overall cap; the setup now skips the remaining fetches after 600 seconds. `data-lens` found the manual drivers told the operator to mount the working clone; they now read a tracked-only export.
- **Two follow-ups from move 4:** the cloud setup doesn't check `settings.json` after the merge the way a home install does (#191), and cloud sessions can't read tracker authors (#188).
- **No probe was needed.** The new AGENTS.md bullet puts more paths on the security route and loosens nothing, and spec v3 ruled both probe floors out; the owner approved it.

## The owner's decisions

- **Spec v3 with amendment A1:** "Proceed" (#179).
- **The C6 image: not built.** C6, the container run of the setup, is unverified. Both scripts pass `bash -n` and `sh -n` on the `node:22` image already on the machine, with no network.
- **The skills list: every entry kept,** `typesafe-ai/skills` included.
- **Triggers: none use this environment.**
- **The unpinned installs: risk accepted now.** #182 doesn't block the flip.

## Before the flip

The owner merges this work, pastes the new `cloud-setup-wrapper.sh` into the cloud environment's setup field, and checks the first session's setup log for `pact cloud copy <marker>`, equal to the generator's, with no `INCOMPLETE` and no `WARN` line about Node or the cross script. The blocker is on #10.

## Record

Issue comments on mephistopheles4/the-pact#179:

- `6083397430` — the triage and the lead's brief.
- `6083588853` — spec v1; `6083733165`, `6083771922` — the security pair on v1, and its dispositions.
- `6083772367` — spec v2; `6083903268`, `6083903622`, `6083944269` — the spec pair and `unstated-lens` on v2, and their dispositions.
- `6083944668` — spec v3.
- `6084097212`, `6084107753` — the security pair on v3, and its dispositions.
- `6084108009` — amendment A1.
- `6084157527` — the owner's "Proceed".

Issue comments on mephistopheles4/the-pact#181:

- `6085386738` — the owner's answers to sign-off items 3 to 6.
- `6085813574`, `6085813865`, `6085814261` — move 4: the QA pair, `unstated-lens` and the standards pair.
- `6085814725`, `6085902827` — move 4: the security pair, round 1 (refused by the cross script) and round 2.
- __DISPOSITIONS__ — the lens dispositions, the timings and the full-suite record.

Issue comment on mephistopheles4/the-pact#10:

- `6085430621` — the blocker before the flip, with the owner's answers to items 5 and 6.
