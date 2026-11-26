# Spec delta: per-merge tags are betas, `v1.<n>.0-beta.<k>`

Status: draft 4, after one final executability read, with its fixes folded
in. A delta on [0007](0007-harness-agnostic-pact.md) S10; everything else there
holds. The spec counts once it is on `main`.

- **Business driver:** the owner's ask, a standard name for the per-merge lane. Where nothing else decides, take the option that is cheaper to reverse.
- **Trade-off:** naming against continuity. The name `-beta` is taken, and continuity is kept by reading the legacy `-rc` tags.

## S1 Objective

- **The beta lane:** each green push to `main` tags `v1.<n>.0-beta.<k>`, where it tagged `-rc.<k>` before. `npx …#semver:^1 --channel beta` takes the newest.
- **The stable lane:** the owner runs `node gate/release-promote.mjs v1.<n>.0-beta.<k>`, which tags `v1.<n>.0`. The default npx command takes the highest stable release.
- **The legacy tags:** the three existing `v1.1.0-rc.*` tags stay, as legacy betas.

## S2 Names and order

- **A release tag** is `v1.<n>.0` (stable), `v1.<n>.0-beta.<k>` (beta), or `v1.<n>.0-rc.<k>` (legacy beta), with no leading zeros.
- **Order within a minor:** every `-rc` ranks below every `-beta`, and every `-beta` below `v1.<n>.0`. Within one kind, a higher `k` ranks higher. So `v1.1.0-beta.1` outranks `v1.1.0-rc.3`.
- **The order is the pact's own, not semver's.** Semver puts `rc` above `beta`, so the tags are never ranked with a semver library.
- **Only the release job makes betas,** and it makes only `-beta`. No new `-rc` is ever made.

## S3 The release job

- **Unchanged:** the trigger, the condition (`PACT_RELEASES`), the permissions, no checkout, the concurrency group and both tip checks.
- **Renames:** the job `candidate` becomes `beta`, and its step `Tag a release candidate` becomes `Tag a beta release`.
- **What it reads:** all three names. If any of them already names the commit, it tags nothing. The tip at the time of writing holds `rc.3`, so the first beta comes on the next merge.
- **What it makes:** `n` is one past the highest stable minor, or 1 when there is none. `k` is one past the highest `-beta` of that minor; `-rc` doesn't count. So the first tag is `v1.1.0-beta.1`.
- **The tests:** the header says "beta". In `workflow.test.mjs` and `release-job.test.mjs`, the job name, the step name, the problem messages and plant strings that quote them, and the job default all change. No check or plant is added or dropped, and each plant is still seen to fail.

## S4 `release-promote.mjs`

- **Argument:** `v1.<n>.0-beta.<k>`, or a legacy `-rc.<k>`. It tags `v1.<n>.0`, with the same refusals as before: the minor is already released, the minor is not the next one, or the commit is not on `main`.
- **A tag that leads nowhere:** another beta that leads nowhere is skipped. A named argument or a stable tag that leads nowhere stops the command with `does not lead to a commit`.
- **The first stable release must come from a `-beta` made after this change.** A legacy `-rc` still promotes, but its bootstrap predates this change and can't read `-beta`. npx's default runs the bootstrap of the highest stable release, so promoting `v1.1.0-rc.3` would hide the beta lane.

## S5 The bootstrap

- `TAG` and `TAG_LINE` read all three names.
- `--channel beta` takes the highest release by S2's order. The default takes stable releases only.
- `--release` takes exactly the named tag, whichever of the three names it has.
- The texts say "beta", and the usage example is `v1.4.0-beta.2`.

## S6 The install

- `RELEASE_RE` reads all three names, for the option, the record and `behindLine`.
- `behindLine` ranks by S2's order.
- The `args-release` message names `v1.1.0` and `v1.2.0-beta.1`.

## S7 Docs

- **`docs/install.md`:** betas per merge, `--channel beta`, promote, S4's first-stable sentence, and that `-rc` still installs below the betas. Its opening sentence says "but a beta".
- **`docs/threat-model.md`:** the open names are `v1.*.0-beta.*`, the example is `v1.2.3+x.0-beta.1`, and the job tags "a beta". The accepted risk is the same.
- **`CONTEXT.md`:** rewrite the "Release tag" entry with the three names and who makes each, and drop "(a later ticket)".
- **The three files' and the tests' header comments** are updated to match.
- **A dated log.**

## S8 Acceptance claims

1. **The order (S2) has its own table test.**
   - **Bootstrap:** the ranking puts `v1.1.0-rc.1 < v1.1.0-rc.3 < v1.1.0-beta.1 < v1.1.0-beta.2 < v1.1.0 < v1.2.0-rc.9 < v1.2.0-beta.1`, in any listing order.
   - **Install:** `behindLine` agrees, with each lower against each higher warning, and the reverse not.
   - (A new table test in the bootstrap and release-core tests; claims 5 and 7 don't repeat it.)
2. **With no release,** the job tags the tip `v1.1.0-beta.1`, and `-rc` doesn't count toward `k`. (release-job: first case, numbering)
3. **The job never makes** a stable tag, an `-rc` or a major. It tags nothing when a stable, `-beta` or `-rc` tag, annotated or not, already names the commit. (release-job: existing cases)
4. **Promote** tags `-beta.<k>` or legacy `-rc.<k>` as `v1.<n>.0`. Its refusals hold, and so does the stop for an argument that leads nowhere. (promote tests)
5. **`--channel beta`** picks by claim 1's ranking, and the default takes stable only. (bootstrap channel tests)
6. **`--release`** installs exactly the named tag, under any of the three names. A bad name or a major other than 1 is refused before any fetch. (bootstrap tests)
7. **The install's `--release`** reads all three names, and a legacy `-rc` record loads. (release-core tests)
8. **The allow-list** holds the renamed `release.yml`, and each plant still fails. (workflow test)
9. **At Test, the grep** `rg -n -i "candidate|-rc\b" bin gate docs/install.md docs/threat-model.md CONTEXT.md` is recorded.
   - **The allowed hits:** the legacy-name regexes and their test rows; the prune's and the cleaner's "candidate" in `install-core.mjs`, `install-io.mjs`, `cleaner.test.mjs` and `install-io.test.mjs`.
   - **Any other hit** is listed with its reason.

## S9 Boundaries and environments

- **Environments:**
  - the job runs on GitHub Actions (ubuntu-24.04);
  - promote runs on the owner's machine;
  - the bootstrap and the install run on the user's machine (Windows, macOS or Linux, Node 24 or later).
  - CI's three jobs are the clean build.
- **The owner's one step:** on the ruleset "tags: only the owner creates (candidates open)", change the exclusion `refs/tags/v1.*.0-rc.*` to `refs/tags/v1.*.0-beta.*` and rename the ruleset "betas open".
  - Do it just before the merge, so the merge's own release run can tag. No bypass actor is needed.
  - If you do it after the merge, re-run that run while its commit is still the tip. If main has moved on, the next merge tags.
- **Done when:**
  - a release run logs `Tagged v1.1.0-beta.1 on <sha>`;
  - `git ls-remote --tags origin "v1.1.0-beta.*"` shows it on main's tip;
  - the run link is recorded on the issue.
- **Stop:** if the job fails on two merges in a row after the ruleset change, set `PACT_RELEASES` off and ask.
- **Never:** the build doesn't touch the rulesets, delete or move tags, or make a tag.
- **Review:**
  - The spec had one executability read, final.
  - Test runs the QA pair and the standards pair.
  - The trust route is unchanged, so the security pair is offered once at Test, not planned.

## S10 Rollback

- **The ruleset:** restore the `-rc` exclusion in the same sitting as merging the revert, just before it. If you do it after, re-run the revert's release run while its commit is the tip.
- **Leftover tags:** the `-beta` tags made in the meantime stay, and old code ignores them.
- **Accepted:** an older installer reading a `-beta` record says it can't tell which release is older.
