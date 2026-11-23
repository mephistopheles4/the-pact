# The lenses drop their carried rules

PACT-55. Cuts the security lenses' four carried rules outright: no working exploit or payload, checklists carried and never fetched, fetched pages treated as untrusted data, and a missing tool never rebuilt through the shell.

The rules go from `adversarial-lens`, `behaviour-lens` and `data-lens`, from item 3 of the probes list in `AGENTS.md`'s "Reviewing a change here" (the protected set's fifth item, as ADR 0046 counted it), and from the generated cloud copy and the Scriptorium page. `adversarial-lens` and `data-lens` lose their "Rules you carry" list; `behaviour-lens` keeps its other three rules (edit nothing, run in the foreground, no destructive action). The lenses' checklists stay as steps; only the rule that they are carried, never fetched, goes.

Why: the owner's call; the rules were Claude writing guards against Claude, and `docs/rule-reasons.md` never held a reason for any of them. Claude Code's own guardrails cover two of the four: its handling of fetched text as data, and its permission prompts and classifier on a shell or a rebuilt tool. Two have no harness control behind them: the limit on how much attack detail a lens report holds (reports post word for word) and the limit on why the adversarial lens fetches. The owner accepts both gaps by this cut. Older ADRs and log entries that name the rules stay as the record of what was decided then.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-55 on Linear. The PR is #639.
