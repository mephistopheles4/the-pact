# Practice runs happen in a container that never holds the checkout

A practice run or a rule probe that runs for real happens inside the sandbox container, built from `gate/tests/fixtures/sandbox/Dockerfile`. The container holds only the run's own folders and the installed pact files the run needs, mounted read-only. The-pact's checkout, with every expected answer, reference report and bad report, is never mounted. Before each run, a check inside the container must find no answer file. A named volume keeps the owner's sign-in, and it is cleared to that sign-in between runs.

## Why

- **Detection could not be finished.** The first plan scored each run's tool calls against lists of forbidden commands and paths. Every move-4 round on #47 found new ways past those lists. A deny-list is never complete.
- **Isolation removes the answers rather than watching for reads.** A lens cannot read an expected result that is not there. That holds whatever command it runs.
- **The isolation can be shown to fail.** A control that mounted the fixtures found every planted file with the same check. So a clean result means something.
- **Command rules stay, as a backstop.** The scorer still reads shell commands for installs, rebuilt tools and the planted secret, and the owner reads every tool call. But those rules no longer carry the job of keeping answers away.

## How this was decided

- **2026-10-06** — Decided in mephistopheles4/the-pact#47, after move 4 went three rounds on the scorer's lists. The owner chose isolation over detection; P-QA's second correction records the choice (comment 6009494937). `result-checker` confirmed the isolation and its control (comment 6009599095).
