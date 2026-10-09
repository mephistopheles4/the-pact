# Test helpers split by what they touch

The gate's tests share their helpers through five modules, each named for what it touches, in place of one `helpers.mjs`. The runner's `changed` tier picks a test that names a changed path in its own text or in any helper it imports (ADR 0030). `helpers.mjs` read every agent file, so nearly every test was tied to every agent file, and a one-agent-file change picked 45 of 48 files, all nine install files among them (#151). Agent files are the repo's most common edit.

- **The modules (#140, T7).**
  - **`text.mjs`** touches nothing: the gate's paths, built from its own location; text built in memory, such as agents, contracts and diffs; and readers of a module's output.
  - **`tree.mjs`** touches files a test names itself: `tempDir`, `writeTree` and `read`.
  - **`gate-files.mjs`** reads the gate's own files and the install script's text: `moduleFiles`, `moduleMatch`, `plantModule`, `copyGate` and `installScriptText`.
  - **`payload.mjs`** reads the repo's payload, agents included: `realPayload`, `realAgents`, `realOverlay`, `stage` and `routeTree`.
  - **`gate-run.mjs`** runs gate modules: the in-process runner (ADR 0032) and, beside it, `renderStage`, `runSeamA`, `childSeamA` and `sealedFamiliar`.
  - **`install-harness.mjs`** runs the install, as before.
- **Each test imports only what it uses.** The runner's rules don't change. They now see narrower imports, so a one-agent-file change picks 23 of 50 files. Of those, 17 are in `fast`, which `changed` runs anyway (S6), and 6 are install files: the smoke set, the three others that read agent files, and two the text rule ties to them without a read (`install-project` and `settings-install`; see Known limits). `builder-install`, `config-install` and `cross-script-install` reach the agents only through the install's copy of the payload. The smoke set covers that copy (ADR 0030, rule 4). They are no longer picked.
- **`stage()` registers its router with `gate-run.mjs`.** `runSeamA` routes a staged tree's test agents before each run. The router reads the pact's agent list, so if `gate-run.mjs` imported it, every test that runs a module would be tied to the agents. `stage()` hands `gate-run.mjs` its router through `routeBeforeRun(root, routeTree)` instead. The hook takes one router per process and refuses a second, different function, so nothing else can change a stage between a test's plant and the check (`adversarial-lens` at move 4).
- **`makeRepo` doesn't route.** A `makeRepo` mutate that adds a test agent calls `routeTree` itself; two tests do. With the router in the harness, every install file would read the agent list.
- **`install()` fails an unexpected routing refusal.** Without the harness routing, a test agent left unrouted would make a test that only asserts "refused" pass for the wrong reason. So `install()` fails a run that seam A refuses for routing, unless the test names the files it means to leave unrouted (`unrouted: [...]`), or passes `true` for any; any other value throws. A committed test pins the guard's reader, `routingFails`, against a real routing refusal, so a change to the install's line shape can't silence it.
- **No I/O at import.** Importing a helper touches no file and starts no process. The agent list and the harness's `pwsh` and `git` lookups happen on first use. `helper-imports.test.mjs` finds every helper under the tests folder outside `fixtures/` on each run. It imports each helper, and each gate core, in a child with the import trap armed at a new scope, `io`. That scope traps `node:fs` and `node:child_process` only, since some helpers read the environment at import. The cores keep the stricter guard of ADR 0032 as well.
- **The pin.** `agent-picks.test.mjs` checks the picks for a one-agent-file change against #151's audit, read from each file's source, not from the pick. Each install file is picked or not picked as the audit says. No fast-tier file that reads no agent file is picked, and no pick comes through a helper other than a payload reader.

## Why

- **The runner matches path names per module, not per export.** It can't tell which helpers a test uses. So whether a test is tied to the agents follows from which modules it imports. The split follows what each helper reads, so that tie is exact.
- **The run, not the pick, is what costs.** `changed` runs the fast tier beside its picks. So for an agent-file change, only the install-tier picks change the wall time. The table in #140's spec, followed alone, left all nine install files picked through the harness. That is why the router moved out of `makeRepo` and `gate-run.mjs`, on the owner's choice on #151.
- **Lazy, not eager.** A helper read at import is paid by every test that imports it, and the import guard can't tell a needed read from a stray one.

## Considered and rejected

- **The spec's table alone,** with `routeTree` imported by the harness, `read` in `payload.mjs` and `runSeamA` importing the payload. It narrows the fast-tier picks but no install pick, so the most common edit still ran every install file.
- **Teaching the runner which exports a test uses.** The runner is on the probe floor, and a per-export rule is a new classifier that could under-pick. Narrower modules give the same result with the rule unchanged.
- **Keeping `makeRepo`'s routing with the real agent set taken from its own copy.** Any code that finds the agents folder names it, so the harness would still name it.

## Known limits

- **The rule is still a superset.** `install-project` names the live folder's `agents` in its own text, and `settings-rules.mjs` holds the rule `Edit(~/.claude/agents/**)`. Neither reads an agent file, and both are picked. Loosening the runner to tell them apart is out of scope.
- **The pin's lists are hand-kept.** A test file added later that reads agents, or one that stops, fails the pin until the audit is updated. That is on purpose: the list is the independent record.
- **Only `routing` is guarded.** `makeRepo` no longer routes, so `install()` checks seam A's routing refusals. It doesn't check any other rule a test might trip by accident.
