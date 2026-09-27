# security-reviewer, round 2 — verbatim

Reviewed: `2026-09-27-resume-and-handoff.md`, draft 3 (`3b64c1b`), changed parts only. 2026-09-27. The reviewer was asked to cite repo-relative paths only, so this file is committed.

```text
## Security re-review, round 2 (draft 3): D1, D3, D4, E1, E2 and the disposition table

**Verdict: nothing High, but three Medium findings (R1–R3) change E1's text, so draft 4 comes before `security-builder`.** R1–R3 all touch E1, the text that gets installed. Each needs a clause or two. Nothing else blocks. The other findings are Low or Info, or unverified hypotheses to check.

All paths below are repo-relative, or written as `~/.claude`. I opened no `*.private.md` file and read nothing outside the worktree.

### Round-2 table: do the dispositions close the round-1 findings?

| Finding | Round-2 verdict | Why |
|---|---|---|
| S3 Refusal fails availability; no wait | **Closed**, with one Low edge (R4) | E1 names the heading and the kind of data, never the value, and waits. It collides with the relay-verbatim rule for BLOCKED or PARTIAL builders. |
| S4 Resume bypasses pre-approval | **Partly closed** (R2) | Closed for resumes, which are "a fix inside the approved plan", and for new security scope. E1 drops D1's "goes back through the plan" for non-security new scope. |
| S5 (local form) Notes as an injection path | **Partly closed** (R3) | "Quote, never fetch" removes the builder's fetch path. Quoted notes still carry taint into the next brief, with no data-not-instructions framing. |
| S6 Keeper scope | **Closed** | E1 says "save only those four headings". |
| S8 Lists don't match | **Closed**, with a verification nit (R5) | E1 and E2 list the same items word for word. Only the capital N differs, which a literal A2 check would trip on. |
| S10 Resumed context and stale definitions | **Partly closed** (R1, R3) | Adding the tainted-context case to the start-fresh list is right. The stale-definition statement is wrong, and notes re-import the taint that starting fresh is meant to cut. |

### Findings

**R1. Medium (new in draft 3): the stale-definition claim is wrong, and E1 implies the wrong fix.**
- **Evidence.** D1 (plan line 32) says: "After an install mid-session, only a fresh agent follows the new rules." `AGENTS.md:49-51` says a session loads agent definitions at startup and doesn't see an install made during it. The plan's own A4 control (plan line 135) depends on this: a fresh `spec-builder` in the same session still has the old definition.
- **What gets installed.** E1 installs "A resumed agent keeps the definition it was spawned with." That is true, but it tells the main session that spawning fresh gets the new rules.
- **Failure scenario.** A security fix to a builder definition is installed mid-session. The main session spawns a fresh builder, believes the fix is in force, and it isn't.
- **Remediation.** In D1 and E1, say that every agent keeps the definitions loaded when the session started, whether fresh or resumed. Only a new session picks up an install.

**R2. Medium: E1 closes S4 for security scope only.**
- **Evidence.** D1 (plan line 29) says new scope "goes back through the plan". E1 (plan lines 67-69) says "Start a fresh one when … it is new scope — new security scope goes back through `security-reviewer` first." For non-security new scope, the installed text's only remedy is "start a fresh one". That reads as permission to spawn a fresh builder on unplanned scope.
- **Existing control.** The stop signal "the work has left the approved plan" (`claude/CLAUDE.md:132`) partly backstops this. So it is a drafting gap in verbatim text, not an open bypass.
- **Remediation.** Change E1 to read "…or when it is new scope, which goes back through the plan first (new security scope through `security-reviewer`)".

**R3. Medium: quoting notes carries taint across the S10 boundary and the tool boundary.**
- **Evidence.** E1 (plan lines 69-70) says to start fresh when the builder has read secrets or untrusted content. E1 (plan lines 81-82) then says to "quote the latest notes into its brief", with no exception.
- **Why it matters.** Notes are that builder's own summary of what it read. Quoting them passes the taint straight to the fresh agent, and inside the orchestrator's brief the text carries the orchestrator's authority.
- **Tool boundary.** `claude/agents/builder.md:6` has WebFetch, WebSearch and browser tools. `claude/agents/security-builder.md:6,9` has no web tools, by design. Quoting a `builder`'s notes into a `security-builder` brief carries web-derived text across that boundary.
- **Remediation, two clauses in E1.**
  - **Frame quoted notes as data.** Mark them as context from a previous builder, not instructions.
  - **Don't quote tainted notes.** Skip notes from a builder that met the S10 condition, or ask the owner first. Also say to quote only notes that were saved, so notes that failed the D4 test are never quoted from memory.

**R4. Low: the relay rule conflicts with "never the value".**
- **Evidence.** `claude/CLAUDE.md:118-125` requires a BLOCKED or PARTIAL builder report to be shown verbatim. After E2, that report includes the handover notes. If the notes hold a secret, the relay shows the value, which contradicts E1's "never the value".
- **Remediation.** Add one line: when relaying a report whose notes fail the test, withhold those headings and name the kind of data instead.

**R5. Low (verification): the A2 wording check fails on case.**
- **Evidence.** E1 has "nothing secret or personal" and E2 has "Nothing secret or personal". A2 (plan line 132) calls the wording identical.
- **Remediation.** Make A2 compare the list after the dash, or ignore case.

**R6. Low: undefined path parts can mix up projects.**
- **Evidence.** D3 and E1 don't define `<repo>` or `<work>`.
  - **Collisions.** Two repos with the same folder name, such as a fork or a client repo, share one directory. The main session can then quote another project's notes as "the latest".
  - **Branch names.** Names such as `chore/resume-and-handoff` contain `/`, which creates nested folders.
  - **Parallel sessions.** Two sessions on the same work can race for the same `N`, which makes "latest" ambiguous.
- **Remediation.** Define `<repo>` as the git remote's owner-name, or else the repo's full path hashed. Define `<work>` as the plan slug or issue number, with `/` replaced.

**R7. Low: a relative-path slip puts notes inside the repo.**
- **Evidence.** If the path is written relative to the project, as `.claude/handover/...`, the notes land inside the repo. `.gitignore:10` ignores only `.claude/worktrees/`, so a broad `git add` could commit them. That breaks D3's main guarantee.
- **Remediation.** Say "the home directory's `.claude`" in E1. Optionally, add `.claude/handover/` to this repo's `.gitignore` as a backstop. That would take the diff past A3's four files, so it needs a plan change.

**R8. Low (plan change, not a blocker): README doesn't exclude the handover folder.**
- **Evidence.** `README.md:21-25` lists what never goes into the-pact: history, sessions, project memory and so on. It doesn't list `~/.claude/handover/`. This repo is built from `~/.claude` contents, and E3 and `AGENTS.md:19-20` run drift checks between them. A later "sync live to repo" or privacy pass could sweep the notes in.
- **Remediation.** Add the folder to that list, either as a follow-up or in draft 4. It is outside A3's four files.

**R9. Low: the notes test doesn't cover confidential business content.**
- **Evidence.** The test covers secrets, personal data, and text from gitignored or private files. It doesn't cover proprietary facts from an employer or client repo. `README.md:25` treats that kind of content as never-to-publish.
- **Why it's Low.** Local-only storage limits the exposure. It becomes relevant together with R6, if notes are quoted across projects.

### Question 2: new risks from local-only storage

These are unverified hypotheses. I didn't look outside the worktree.

- **H1. Synced or tracked `~/.claude`.** D3 says the folder is "outside every repository". That is true for project repos, but I can't confirm that `~/.claude` itself isn't a git or dotfiles repo, or inside a sync client's root. To verify, the owner runs `git -C ~/.claude rev-parse --is-inside-work-tree` (expected: an error) and checks the sync clients' root folders. The README's copy-based install model suggests it isn't a repo.
- **H2. Permission scope.** `claude/settings.overlay.json:5-7,17` sets `defaultMode: auto` and skips the auto-permission prompt. Routine main-session writes into `~/.claude` sit beside the live `CLAUDE.md`, the agents and `settings.json`, where hooks mean code execution. That may lead to allow rules broad enough to cover live config, which weakens the install-only-on-go-ahead rule in `AGENTS.md:17-22`. Remediation: scope any allow rule to `~/.claude/handover/**`, or keep notes outside `~/.claude`.
- **H3. Plaintext on disk (Info).** As far as I know, Claude Code already keeps full session transcripts under `~/.claude`, including every builder's final message. So notes add little new plaintext exposure. D4's "plaintext on disk" reason is weak. The real reason to keep the test is re-quoting into briefs (R3, R6).
- **Retention (Info).** Notes build up with no expiry. Rollback leaves deleting them to the owner, which is acceptable for local catch-up aids.

### Verification approach

- **R1, R2, R3 and R4.** Re-read draft 4's E1 for the added clauses. Check that D1's install statement matches `AGENTS.md:49-51`.
- **R5.** Run A2 with the case-insensitive or list-only comparison.
- **H1 and H2.** The owner runs the checks above once, before E3.

### Files reviewed
- `docs/plans/2026-09-27-resume-and-handoff.md`
- `claude/CLAUDE.md`
- `claude/agents/builder.md`
- `claude/agents/spec-builder.md`
- `claude/agents/security-builder.md`
- `claude/settings.overlay.json`
- `AGENTS.md`
- `README.md`
- `.gitignore`
```
