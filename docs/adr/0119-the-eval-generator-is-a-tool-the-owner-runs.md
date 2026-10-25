# The eval generator is a tool the owner runs

An eval instrument lives in the repo again: `evals/gen.mjs` and the cases in `evals/cases/` (#405). It writes each case twice, with the pact's rules text as the appended system prompt and without, and prints the `claude plugin eval` commands for the owner to type. It runs nothing, and nothing runs it: no CI job, hook or gate check. An eval run is not a probe under `docs/agents/changing-rules.md` and no evidence for a rule change; a rule still holds by review and by use (ADR 0069).

## What it partly reverses

ADR 0045 deleted the practice cases and their scorer because each run cost a session the owner started by hand and the runs mostly tested themselves. This brings back cases and a checker, on different terms:

- **Run only on the owner's ask.** A cost paid on every change is what ended the practice tests.
- **Cheap and headless.** Haiku, one run per arm, `--max-cost-usd 1` per run, about half a cent a case pair. #402's whole Haiku round cost about $0.10.
- **Aimed at cutting text.** A case asks whether Claude follows a rule without the rule's text. A pass bare makes the text a cut candidate for the owner; it never cuts anything on its own.
- **Not a probe.** ADR 0045's probe rule is unchanged: a probe the owner asks for by name still runs interactively, after installing.

## The front matter

`claude plugin eval` ends a case's front matter at the first `---` it meets, anywhere in the text. The rules text holds one in its first table. The #402 pilot wrote the rules as a block scalar first in the front matter, so every with-rules run lost the case's `max_turns` and `allowed_tools`, and most of the rules text went into the user prompt (the correction on #402). The generator writes the case's keys, then the rules as one JSON string with every hyphen escaped, and checks each with copy the eval's way before it writes anything. A gate test builds the pilot's layout and is seen to fail on it.

`check` reads a first run's JSON before the rest are spent. A run passes only when each case kept its own `max_turns`, its prompt holds only the case text, and every run took one turn. On the pilot's real canary run, `check` fails on `maxTurns` and `promptMarkdown`. On a real #403 run, it passes.

## Limits

- **No case grants a tool.** Every printed run also denies the read, write, shell, web and subagent tools, so the "no real repository, network or credential" limit holds whatever the eval makes of an empty tool list. A tool call would show as a second turn, which `check` fails.
- **`--no-publish` on every printed run.** The report stays on the owner's machine.
- **`--trust-plugin` on every printed run.** It trusts only the folder the generator just wrote. With `--json` the eval can't stop to ask, and it refuses an untrusted folder; the owner's confirming run found that.
- **Checked against Claude Code 2.1.310.** The flags, the front-matter reading and the JSON fields are its interfaces. After an update, the generator runs with `--canary` and its printed steps 1 and 2 run before a round is trusted.
- **The judge is not trusted alone.** Every reply is read by hand; the Haiku judge was wrong in both earlier rounds.

## What was weighed

The q-numbers are the questions on #405, q1 to q10, each answered by the lead (see How this was decided).

- **The tool spawning the eval itself**, with the limits enforced in code. Not taken (q1): every paid run stays a command the owner types, and the tool stays testable with no `claude` call.
- **The owner's installed rules as the default.** Not taken (q2): the default render is reproducible and holds no private configuration; `--rules` takes the installed copy.
- **A case with a shell under WSL2** for Sense the work's bug clause. Split off to #415 (q3): it needs a scaffold that runs bash as the owner, and paid runs to check.
- **Cases with read tools, as the pilot ran them.** Not taken (q6): the pilot's workspace was empty, so the tools added nothing but reach.

## How this was decided

- **2026-10-25.** Decided on #405, spec revision 4, standard tier. The questions on #405, q1 to q10, were answered by the lead, head-chef-field-test, under the owner's standing instruction for the day, not by the owner in chat. The lead declined the security pair on the spec (q8) and at Test (q10); that decline stays open until the owner answers in chat.
