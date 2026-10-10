# The install.ps1 ask rules removed

**2026-10-10**: the 18 ask rules that guarded the old PowerShell installer's apply step leave the pact (mephistopheles4/the-pact#217, built in #218). `install.ps1` left the repo in #204, so the rules matched only a command run from an old checkout, and the owner accepted that rollback risk. See [ADR 0052](../adr/0052-the-ask-rules-no-longer-guard-a-rollback-to-install-ps1.md).

- **Out of the overlay, the allow-list and seam A.** The 10 PowerShell and 8 Bash rules are gone from `claude/settings.overlay.json` and `gate/settings-allowlist.json`, and from `SETTINGS_APPLY_ASK` in `gate/seam-a-core.mjs`, which now holds 42. Its `DASHES` constant went with them. The other 52 ask rules are unchanged.
- **The tests follow.** The near-miss table loses its six hyphen-for-dash rows, and its two splat rows now guard the Node installer's splat rules. The ASCII check drops its exception for the three dashes. The per-rule "stays required" cases fall from 60 to 42 on their own.
- **New cases prove the removal.** No ask rule names the old installer; a seam A copy that still required one refuses today's overlay (a table, "seam a still requiring an old installer rule"); one put back into the overlay alone fails as outside the allow-list; and, as a control, one put back into both passes, so that failure comes from the allow-list. The old rule's text lives in `settings-rules.mjs`, so `settings.test.mjs` never names the old installer and stays in the `fast` tier.
- **The docs.** R22 drops its two old-installer misses and records the accepted risk; the threat model's ask-rules summary, `docs/install.md` and `AGENTS.md` no longer say the old installer's apply asks. ADR 0049 and ADR 0048 are marked superseded in part.
- **The cloud copy** is regenerated: 18 rule lines leave each of the two scripts, and the `pact cloud copy` marker changes with them.
- **The live settings are cleaned by hand.** After the install, the owner deletes every `permissions.ask` line containing `nstall.ps1`, and any comma that leaves before `]`, then checks the editor's search finds none and a fresh dry run shows no missing-rule or not-JSON warning and `settings.json: unchanged`. `docs/install.md` gives the step, now after the install step. No session reads the live file.

## What the reviews found

Seven lenses read the result: the QA pair, `unstated-lens`, the standards pair and the security pair. Every cross call passed; `behaviour-lens` and `reader-lens` were each rerun once for a report the cross would read.

- **A comma the step would leave.** `behaviour-lens` ran the cleanup in memory with the installer's own writer. The ask list is written sorted, so `PowerShell(./scripts/install.ps1 -Apply)` is likely its last entry, and deleting its line leaves a trailing comma that breaks the file. The how-to now says to delete that comma.
- **The step in the wrong place.** `reader-lens` found the cleanup in the dry-run step, before the install it must follow, and "three" look-alike dash rules where there are six. The section moved after the install step, and the count is fixed.
- **Loops in a fast-tier file.** `conventions-lens` held the file to the rule that a file whose cases change converts its loops. The new seam A controls and the banned-name loop became tables; the 42-rule loop stays, as the spec planned.
- **The accepted risk, read twice.** Both security lenses named the unprompted rollback, which the owner accepted at sign-off; neither found another way in.
- **Deleted tests, dismissed.** `integrity-lens` flagged the tests deleted with the old rules, as its rules require; the spec directs each deletion.
- **Two gaps with no home.** `unstated-lens` asked who fills this Record list, and for the R22 row to name the rollback case. Both are done.

## Record

Issue comments on mephistopheles4/the-pact#217:

- **Spec:** revision 1 6100816201; security pair on it 6100861222; revision 2 6100895637; spec pair 6100952728 and `unstated-lens` 6100952830 on it; revision 3 6100997175; Lens dispositions 6100997341.
- **Owner decision, from chat:** proceed on revision 3, no backstop, 6101007779.

Issue comments on mephistopheles4/the-pact#218:

- **Brief:** 6101015322.
- **Build evidence:** 6101377482.
- **Move 4:** security pair 6101448825, `unstated-lens` 6101448956, standards pair 6101472360, QA pair 6101754931, Lens dispositions 6101767022 and its correction 6101906879; the refused first runs of the standards pair 6101904288 and the QA pair 6101904439.
- **The owner's cleanup report (C5b):** posted on #217 after the merge; the session that posts it adds its id here.
