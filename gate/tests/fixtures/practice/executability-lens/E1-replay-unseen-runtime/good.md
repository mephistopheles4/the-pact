**For the owner**

The design rests on a behaviour nobody has seen: that each sub-agent's isolated worktree holds the change under test. If it holds the default branch instead, every check runs on the wrong code. I suggest a small throwaway to observe it before the first ticket.

**For the session**

### First ticket, drafted

Red step:
- S1: nothing found that would fail to build.
- S2: assumes isolation: worktree holds the change under test; taken from the docs, never observed.
- S3: nothing found that would fail to build.
- S4: nothing found that would fail to build.
- S5: nothing found that would fail to build.
- S6: nothing found that would fail to build.
Steps:
1. Write the sub-agent file with isolation: worktree (S2). Stalls: S2: which tree the worktree holds is unobserved; the check could run on the default branch.
2. Run the checker on the change (S3).

- S2 (F1): The worktree is assumed to hold the change under test, unobserved

```lens-findings
{
  "lens": "executability-lens",
  "verdict": "blocking",
  "findings": [
    {
      "id": "F1",
      "anchor": {
        "kind": "section",
        "id": "S2"
      },
      "severity": "high",
      "headline": "The worktree is assumed to hold the change under test, unobserved"
    }
  ],
  "notChecked": [
    "Whether the export format suits the readers downstream: that is the owner's call"
  ]
}
```
