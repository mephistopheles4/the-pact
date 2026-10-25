# The eval generator becomes a tool the owner runs

#405, standard tier, planned and built by pact-405, led by head-chef-field-test. The lead answered every question on the issue (q1 to q10, named below by number) under the owner's standing instruction for the day; no answer came from the owner in chat, except the go-ahead to push.

The #402 pilot asked whether Claude follows the pact's rules without their text, using a throwaway generator that wrote each case with the rules and without. That generator put the rules text first in each case's front matter, and the eval ends the front matter at the first `---`, which the rules text holds in its first table, so every with-rules run was malformed. #403 fixed the layout in its own throwaway, which was never merged. #405 rebuilds it in the repo as `evals/gen.mjs`, with the 16 cases from #402 and #403 in `evals/cases/`, so the owner can run a second cut round on request (ADR 0119).

The spec went through four revisions. The spec pair's first read of revision 1 was blocking: the case sources weren't named, the escape that keeps `---` out of the front matter had been lost in editing, and the run JSON's shape and the confirming run's timing were missing. Its follow-up on revision 3 asked how the "no real repository" limit holds when the eval's reading of an empty tool list is unobserved, and whether input validation in the spec needed a security read. Revision 4 answers the first: every printed run denies the read tools too, runs start in the generated folder, and `check` fails a run of more than one turn. The lead declined the security pair on the spec (q8) and again at Test (q10). That decline stays open until the owner answers in chat.

Built test-first. `gate/tests/evals.test.mjs` has one test per claim, C1 to C6. The front-matter test builds the pilot's layout and fails on it. Mutations were caught: dropping the escape (C2, C3), dropping `--no-publish` (C5) and dropping the one-turn rule (C6). Against real run JSON renamed to this tool's case names, `check` passed a #403 run and failed the pilot's canary run on `maxTurns` and `promptMarkdown`. No paid run was made in the build. One confirming run, a canary case on Haiku, comes at Test, before merge, typed by the owner.

At Test, the QA pair and the standards pair read the pushed head. integrity-lens was blocking on one sub-check that could not fail: the canary fault was "named" by the case name, not the field. It also listed broken versions the tests would miss: the command-line flags, the printed output, a write before a later refusal, and the line-break refusal. behaviour-lens found that `check` passed a run with no cases and a canary with no grader result. reader-lens found the README's step numbers and the PowerShell form missing. conventions-lens found the tests not named `#405 C<n>`. All were fixed in the same six tests, which now spawn the command line, and each new rule was seen to fail under a mutation.

The pilot's 12 cases now grant no tools (q6); their workspace was empty, so they lose nothing. The pilot's canary is the `--canary` flag. The stronger move-sense case, a shell under WSL2, is #415.

## Record

- The spec, revision 4: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400932105
- The spec pair's first read, revision 1: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400836908
- The spec pair's follow-up, revision 3: https://github.com/mephistopheles4/the-pact/issues/405#issuecomment-6400932598
- The follow-up issue: https://github.com/mephistopheles4/the-pact/issues/415
