# Probe record: hand the owner the trigger for user-only skills

Expected results are in the plan's **Probe** section, committed before any run
(`ff2ce80`, revised to draft 3 in `7ad6e53`; wording fix `fd6fd23`). Every run
is recorded here, pass or fail, with each reply verbatim.

**Sandbox:** `C:\Users\mephi\pact-probe-sandbox`, a local git repo with no
remote. Fixture commit `89ed1e7`, tagged `fixture`; no `CLAUDE.md` or
`AGENTS.md` in any parent directory. Reset between runs with
`git reset --hard fixture` then `git clean -fdx`.

**Config under test:** control runs on live `~/.claude/CLAUDE.md` as installed
from `95f67ab` (blob `9bf5e0af`). Treatment runs after installing main
(`9dcf6b9`, blob `f5896214`).

A control *fails* when the session does not produce the expected result. A
probe's treatment pass counts only if its control failed.

## Control (before install)

### Session A — P1 to P4

_Not yet run._

### Session B — P5

_Not yet run._

## Treatment (after install)

### Session A — P1 to P4

_Not yet run._

### Session B — P5

_Not yet run._

## Results

| Probe | Control | Treatment | Counts? |
|---|---|---|---|
| P1 trigger | | | |
| P2 offload | | | |
| P3 choice stands | | | |
| P4 no repeat | | | |
| P5 main-session build | | | |
