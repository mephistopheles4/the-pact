# The eval generator becomes a tool the owner runs

#405, standard tier, planned and built by pact-405, led by head-chef-field-test. The lead answered every question on the issue (q1 to q11, named below by number) under the owner's standing instruction for the day; no answer came from the owner in chat, except the go-ahead to push.

The #402 pilot asked whether Claude follows the pact's rules without their text, using a throwaway generator that wrote each case with the rules and without. That generator put the rules text first in each case's front matter, and the eval ends the front matter at the first `---`, which the rules text holds in its first table, so every with-rules run was malformed. #403 fixed the layout in its own throwaway, which was never merged. #405 rebuilds it in the repo as `evals/gen.mjs`, with the 16 cases from #402 and #403 in `evals/cases/`, so the owner can run a second cut round on request (ADR 0119).

The spec went through four revisions. The spec pair's first read of revision 1 was blocking: the case sources weren't named, the escape that keeps `---` out of the front matter had been lost in editing, and the run JSON's shape and the confirming run's timing were missing. Its follow-up on revision 3 asked how the "no real repository" limit holds when the eval's reading of an empty tool list is unobserved, and whether input validation in the spec needed a security read. Revision 4 answers the first: every printed run denies the read tools too, runs start in the generated folder, and `check` fails a run of more than one turn. The lead declined the security pair on the spec (q8) and again at Test (q10). The owner confirmed it in the lead's chat, relayed: the only input is the owner's own command line.

Built test-first. `gate/tests/evals.test.mjs` has one test per claim, C1 to C6. The front-matter test builds the pilot's layout and fails on it. Mutations were caught: dropping the escape (C2, C3), dropping `--no-publish` (C5) and dropping the one-turn rule (C6). Against real run JSON renamed to this tool's case names, `check` passed a #403 run and failed the pilot's canary run on `maxTurns` and `promptMarkdown`. No paid run was made in the build.

At Test, the QA pair and the standards pair read the pushed head. integrity-lens was blocking on one sub-check that could not fail: the canary fault was "named" by the case name, not the field. It also listed broken versions the tests would miss: the command-line flags, the printed output, a write before a later refusal, and the line-break refusal. behaviour-lens found that `check` passed a run with no cases and a canary with no grader result. reader-lens found the README's step numbers and the PowerShell form missing. conventions-lens found the tests not named `#405 C<n>`. All were fixed in the same six tests, C3 to C6 of which now also spawn the command line, and each new rule was seen to fail under a mutation.

The owner's confirming run then stopped before any spend: with `--json`, the eval refuses a plugin folder it hasn't been told to trust, and can't stop to ask. Every printed run now carries `--trust-plugin`, which trusts only the generated folder, and C5 checks for it (the lead's pick, q11). Rerun with it by the lead, under the owner's standing instruction, the confirming run passed: `canary-with` kept `max_turns` 2, its prompt held only the case text, it took one turn, and the canary word came back. It cost $0.0027.

The closing read by all four lenses found no CI on its head, because the PR conflicted with main in the two indexes, and a few more test and wording gaps. Main was merged in, and the gaps were fixed in the same tests and texts.

The second closing read, on the merged head, found three gaps in input checking. A link into the repo got past the inside-the-repo refusal, and so could the extended-length path prefix. A typographic double quote in the output path split the printed command differently in PowerShell. A repeated or camelCase tool key got past the no-tools check. The generator now compares real paths, refuses those quotes, and refuses a repeated key or any other tool key. It also escapes every character a YAML reader refuses, and the canary's grader is checked in both copies and run against the word. Input checking is on the sensitive list, so these came to the owner through the lead as security rows.

The pilot's 12 cases now grant no tools (q6); their workspace was empty, so they lose nothing. The pilot's canary is the `--canary` flag. The stronger move-sense case, a shell under WSL2, is #415.

## Record

- The spec, revision 4: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400932105
- The spec pair's first read, revision 1: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400836908
- The spec pair's follow-up, revision 3: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400932598
- The Test review, first round (QA and standards pairs): https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6401167409
- The confirming run: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6401275198
- The closing read: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6401311123
- The second closing read: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6401497741
- The follow-up issue: https://github.com/mephistopheles4/the-pact/issues/415
