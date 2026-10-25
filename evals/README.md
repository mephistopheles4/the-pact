# Evals

A tool the owner runs on request, never a standing step: no CI job, hook or
gate check runs it (ADR 0119). It asks whether Claude follows a rule in the
pact's text without that text, so a rule it passes bare is a candidate to cut.
An eval run is not a probe under `docs/agents/changing-rules.md`, and it is no
evidence for a rule change; a rule still holds by review and by use.

`gen.mjs` writes each case in `cases/` twice, as a plugin folder
`claude plugin eval` can read: `<case>-with` carries the rules text as its
appended system prompt, and `<case>-without` is the case as it is. It prints
the commands to run, and runs none of them.

## Limits

- Haiku, agent and judge, one run per arm (`--ablation none --runs 1`).
- Rerun only a case whose two arms differ.
- `--max-cost-usd 1` on every run, and `--no-publish`: the report stays on
  this machine. A round that stops at the cap is marked `partial`; rerun only
  its missing cases, each by `--case`.
- No case grants a tool (`allowed_tools: []`), and every run denies the read
  and write tools, the shell, the web and subagents, so no run reaches a real
  repository, network or credential.
- Read every reply by hand. The Haiku judge was wrong in both earlier rounds
  (#402, #403).

## Running a round

From the repo root, with `NODE_OPTIONS` cleared:

```bash
env -u NODE_OPTIONS node evals/gen.mjs <output folder> [--rules <file>] [--canary]
```

- The output folder must be new or empty, and outside the repo.
- The rules text is the repo's default render, what a fresh install with no
  configuration renders. `--rules <file>` takes another file, such as your
  installed `~/.claude/CLAUDE.md`.
- `--canary` adds a code word to the rules text and a `canary` case that asks
  for it: its with copy shows the whole text reached the model.

It prints four steps: enter the output folder, run one case, check that run,
then run every case. Run the last step only after the check passes:

```bash
node evals/gen.mjs check <run JSON> <output folder>
```

`check` passes a run only when each case kept its own `max_turns`, its prompt
holds only the case text, and every run took one turn (a second turn means a
tool was called). For the canary, the with copy must find the word and the
without copy must not. It prints case and field names, never a reply or a path.

## Adding a case

A case is a folder in `cases/`, named in lower-case letters, digits and
hyphens, holding `prompt.md` and `graders/*.md`:

```markdown
---
max_turns: 4
allowed_tools: []
---

The situation, and what the agent is asked to reply.
```

The front matter holds the case's own keys and no `append_system_prompt`; the
generator adds that. Write each case's expected result down before its run,
and use no pact-only words in the prompt, so a difference shows clarity, not
vocabulary.

## Claude Code version

Checked against Claude Code 2.1.310: the eval's flags, its front-matter
reading (the front matter ends at the first `---`), and the run JSON's
`cases[].name`, `maxTurns`, `promptMarkdown` and `arms[].turns`. After an
update, run steps 1 and 2 with `--canary` before trusting a round.
