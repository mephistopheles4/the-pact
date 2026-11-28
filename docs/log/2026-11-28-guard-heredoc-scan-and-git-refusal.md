# The guard's heredoc scan runs in linear time, and its git refusal names a prefix that passes

**2026-11-28.** PACT-130 asked about three problems the identity guard showed after PR 692:
- the timing test failed on slow runners;
- the prefix the `identity-git` refusal names was itself refused;
- `gh run rerun` was refused, although the docs exempt it.

The tier is Standard. The owner said "its not sensitive" (relayed by the lead), so it is not the sensitive route. The work went in two PRs, at the lead's request, because the timing test also failed on `main`'s own macOS job and held up other PRs.

## What was found

- **The timing test.** In PowerShell mode, every `<<` searched for the next newline from its own position. On a 1 MiB line with no newline, each search runs to the end of the command, so a line of N `<<` costs N full scans. On the author's machine, `judge` on the test's `<< a ` input took 1,751 ms, against 51 ms before PR 692. CI failed at 12.9 s on gate-macos and 19.3 s on gate-windows, against a 12 s limit.
- **The refusal's prefix.** Claude Code's hook environment on Windows has no `HOME`: Git Bash sets it only inside its own shell. The check accepts `$HOME/...` only when the hook's `HOME` is set. So the Bash prefix the refusal named, `GIT_CONFIG_GLOBAL="$HOME/..."`, counted as an override and was refused. A session building another PR saw the same thing with `git push`. Two other cases failed the same way:
  - In PowerShell, a call holding a block distrusts every `$env:` assignment, so no prefix the refusal named could pass there.
  - Antigravity's `send_input` passes an unknown shell, and got the PowerShell form, which an unknown shell refuses.
- **`gh run rerun`.** The pact's guard passes it, and a test covers that. The refusal came from the owner's own hook, `~/.claude/hooks/identity-guard.mjs`. That hook is outside this repo, and it was passed to the owner.

## What was built

- **PR 701, the heredoc scan.** `hasClosingDelimiterAfter` remembers its last newline search and reuses it while no newline lies between. The guard's answers are unchanged. The timing test, its inputs and its 12 s limit are unchanged too, so no check is loosened.
  - Two cases were added inside existing tests. One is a command with two PowerShell heredocs on different lines, which fails when the reuse keeps a stale newline. The other adds `<< a ` to the `answerCall` timing loop.
  - Tests: +0 −0.
- **The second PR, the refusal text.** The refusal now names the pinned gitconfig as a quoted literal, which the check accepts whatever `HOME` or `USERPROFILE` hold. It also says where the prefix goes:
  - the Bash form goes right before each git command, inside any subshell or pipe;
  - the PowerShell form starts a call of its own, then the git write, with no block, pipe, subshell, `&&` or `||`;
  - an unknown shell gets the Bash form;
  - a path that would not pass as a literal keeps the same text with the variable path, `$HOME` or `$env:USERPROFILE`.

  Spec 0010 S3 is amended to match.
  - A hook that times out lets the call through. So the C11 `answerCall` timing loop now bounds `answerCall`, the hook's own entry point, on every CI runner. It holds all ten inputs of the `judge` timing test, at 3,000 ms each.
  - Tests: +3 −0. The first checks that each provider's refusal prefix, put where its text says, passes, with `HOME` and `USERPROFILE` each absent and present, and with a home holding `'`. The second covers the paths that keep the variable form. The third runs the real claude hook with no `HOME`.

## The Test review

- **PR 701, round 1.** The QA pair and the standards pair ran. Integrity-lens found that nothing failed if the reuse's reset was dropped, and the first added case answers that. In athanor, that mutation fails it.
- **Round 2 (final).** It noted that the `<< a ` timing case fails on the unfixed code only on slow runners: in athanor's Linux container the base passes at about 0.8 s.
- **CI on PR 701's head `764db2d8`.** The timing test took 2,271 ms on gate, 4,314 ms on gate-macos and 4,850 ms on gate-windows.
- **The second PR, round 1.** The QA pair and the standards pair ran. Behaviour-lens compared head and base on 1,008 refused calls, and no decision changed. The reader and conventions lenses found wordings that could send a refused session into a second refusal, and a spec label that named a platform where the code picks by shell. All were fixed. The manual no-`HOME` hook check became the third test.

## Not done here

- **The owner's own hook.** It counts `gh run rerun` as a write, names the old `~/.claude/pact/tools` paths, and splits commands on `|` inside quotes.
- **Widening the app to `actions: write`.** This is deferred until a session needs a rerun the owner can't do.

## Rolling back

Revert either PR, then run the install's dry run and apply. Nothing is migrated.

## Record

- `PACT-130`:
  - spec revision 2 (`5990488e`);
  - Design round 1 (`19191b91`);
  - Design round 2, final, with revision 3's changes (`b8e6d9c5`);
  - PR 701's Test round 1 (`884c81c0`) and round 2, final (`4c0ac065`);
  - this PR's Test round 1 (`4b776d46`);
  - the status comment (`1221444c`), which links each later round.
- The C6 probe is a test, so it has no record of its own.
