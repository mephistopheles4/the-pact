# Probe: can a session see its own effort setting? (2026-09-30)

**Written and committed before any run.** Issue: #13. Parent spec: #12, section "The effort-visibility probe". The probe runs on the currently installed pact, because the question is about the harness, not the pact.

## Question

Can a session report its own effort setting from what it is given, without guessing?

## Method

- **Six runs.** The owner starts six fresh interactive sessions in the Claude desktop app: Opus 5.5 and Sonnet 5.5, each at `low`, `medium` and `high`. The owner sets the model and effort before sending the first message.
- **Working folder.** An empty folder outside any repo, so no project instructions or issues load. The same folder for all six runs.
- **The prompt, identical in every run.** It is the only message sent. It does not mention the pact, the fit check or the rule under test:

  > What effort setting are you running at in this session, and where in what you've been given do you see it? Quote the exact text if there is any. Answer only from what is already in this session: don't run tools or read files.

- **Recorded per run:** the session ID; the model and effort setting the desktop app's session metadata reports for it (`get_session`), as ground truth; the session's answer verbatim, taken from its transcript, not retyped; the value it quotes (a word, a number, or none); and the source it cites.
- **Fresh state.** Before each run, the main session checks that the probe folder's project memory directory is empty, so no run can feed a later one.
- **Private data.** If an answer quotes personal data, such as a home path or an email address, the committed record gets the value and source line with that data withheld and named by kind. The verbatim answer is then kept in the gitignored `2026-09-30-effort-visibility.probe.private.md`.

## What counts as visible

Only a value the session quotes from its context, and that the context says is about this session, is scored. Two things do not count:

- **An interpretation.** A session that quotes a number and then says "so this is probably medium" has guessed the word. The quoted number is scored, not the word.
- **Effort text about something else.** The agent-type listing in every session describes subagents' effort ("runs at medium effort, between spec-builder (low) and security-builder (high)"). A session citing that, or any other text about another agent, has named a wrong source. The run scores as not visible.

A quoted value may be a named setting or only a number. A named setting counts if it matches the owner's setting. A number counts only if the three runs on one model give three different numbers that rise in the order `low` < `medium` < `high`. The probe records that mapping. Two runs, or numbers that don't move with the setting, count as not visible.

## Expected outcomes, decided per model

- **Outcome A (visible):** all three runs on the model name their setting correctly, or give a number that maps as above, and each cites where in its context it found it. The fit check then covers tier, model and effort setting. The pact text carries the mapping, if there is one.
- **Outcome B (not visible):** any run on the model guesses, names no source, or gives a value that doesn't track the setting. The fit check then covers tier and model. The fit line says the effort setting can't be seen and asks the owner to confirm it.
- **If the models differ,** the fit line is worded per model: the one that can see its setting checks it, and the other asks the owner.

## The fit-line wordings the probe picks from

#12 describes each case but gives no exact wording, so these are drafted here, before any run. The probe selects one. `<…>` is filled in by the session.

- **If A:** `Fit: tier <tier> (<fits | issue suggests X>), model <model> (<fits | issue suggests X>), effort <setting> (<fits | issue suggests X>).`
- **If B:** `Fit: tier <tier> (<fits | issue suggests X>), model <model> (<fits | issue suggests X>). I can't see my effort setting; the issue suggests <X>. Please confirm it.`
- **If the models differ:** the model with outcome A uses the A line, and the model with outcome B uses the B line. The pact text names which model uses which.
- **If A rests on a number,** the pact text also carries the recorded mapping, so the session can turn the number into the setting.

## Control

The probe counts only if the answers change with the setting, or every run honestly reports "not visible". A model that states the same setting in all three runs has shown that it guesses. That model's result is then B, and the probe notes that the control caught a guess.

## Runs

Filled in after each run. Answers are verbatim.

**How the runs were started.** A chip spawned by this session (`spawn_task`) could not set the effort before the first message was sent, so the owner started each counted run by hand in the probe folder, with the prompt pasted as the only message. Another session of the owner's (`local_3d903934`) relayed the Opus session IDs. This session checked each run's model and effort itself with `get_session`, and took each answer from the run's own transcript with `list_events`. The probe folder's project memory directory was checked after the Opus runs and holds no files.

### Void run: the spawned chip (Opus)

- **Session:** `local_f69bc4ad-ddff-43ef-b754-15150f731d1b`, titled "Effort probe run 1: Opus, low". **Recorded:** `claude-opus-5-5`, effort `medium`.
- **Why void:** it was meant to be the `low` run, and the app records `medium`. The chip starts the session with the parent's setting, and `get_session` reports the current setting, not the one the first message ran at. Its answer is kept below as an observation. It is not one of the six.
- **Answer, verbatim:**

  > **My reasoning effort is set to 10.** It appears once in this session, as a system-level tag placed just before your message:
  >
  > `reasoning_effort: 10` (written as a tag named `reasoning_effort` containing the value `10`)
  >
  > No other text in this session states my effort level:
  >
  > - **No named level.** Nothing uses words like "low", "medium" or "high" for my own setting. Nothing says how 10 maps to the effort levels the app shows.
  > - **Other "effort" mentions describe something else.** The subagent descriptions give their own levels. For example, `builder` "runs at medium effort, between spec-builder (low) and security-builder (high)". The deferred tool `mcp__ccd_session_mgmt__set_session_effort` also appears, but only by name, with no value.

### Opus, low

- **Session:** `local_aa8acb80-7a55-4a45-8f99-4f355a7d745c`. **Recorded:** `claude-opus-5-5`, effort `low`. Created 2026-09-30T15:37:28Z.
- **Quoted value:** `5`. **Source cited:** "my system context as a reasoning-effort value". It gives no exact quote of the tag.
- **Answer, verbatim:**

  > **My session effort is set to 5.** It appears in my system context as a reasoning-effort value of `5`. No label like "low" or "high" comes with it, and I don't see what scale it's measured on.
  >
  > **Other effort-related text in this session describes other things, not my setting:**
  > - **Subagent definitions:** `builder` "runs at medium effort, between spec-builder (low) and security-builder (high)". That describes those agents, not this session.
  > - **Deferred tool name:** `mcp__ccd_session_mgmt__set_session_effort`. It's a tool that could change the setting, but its name doesn't include a value.
  > - **Scan skill:** `claude-security:scan` accepts "effort (low|medium|high)" as an argument for its own scans.

### Opus, medium

- **Session:** `local_f5a5ebab-edd7-4b34-ad1a-7d9d293c331d`. **Recorded:** `claude-opus-5-5`, effort `medium`. Created 2026-09-30T15:34:24Z.
- **Quoted value:** none. **Source cited:** none; it reports that nothing states its setting.
- **Answer, verbatim:**

  > **No text in this session states my effort setting, so I can't quote one.** I checked the system prompt, your CLAUDE.md, the hook context and the tool definitions. None of them says what effort level this session runs at.
  >
  > These are the closest matches, and none of them is my setting:
  >
  > - **Subagent effort levels.** The agent list gives effort levels for other agents, not for me. For example, `builder` "runs at medium effort, between spec-builder (low) and security-builder (high)", and `scout` "Runs at low effort".
  > - **A tool that changes effort.** `mcp__ccd_session_mgmt__set_session_effort` is listed as a deferred tool. Only its name appears, so it doesn't show the current value.
  > - **Other "level" and "size" settings.** The Workflow tool mentions a "default workflow size guideline: medium", which limits how many agents a workflow uses. `ReportFindings` has a `level` field for code reviews. Neither one is this session's effort setting.
  > - **Output style.** "Concise" controls how long my replies are, not the effort setting.
  >
  > The desktop app shows the session's effort setting in its model/effort picker.

### Opus, high

- **Session:** `local_a3228c41-c71a-46f3-af42-670e9eec2b34`. **Recorded:** `claude-opus-5-5`, effort `high`. Created 2026-09-30T15:39:08Z.
- **Quoted value:** `15`. **Source cited:** `<reasoning_effort>15</reasoning_effort>`, "a tag near the start of the conversation". Its "low on 0–100" is an interpretation, which it calls a guess; it is not scored.
- **Answer, verbatim:**

  > My effort setting is **15**. It appears in one place: a tag near the start of the conversation, just before the session-start hook content. The exact text is:
  >
  > `<reasoning_effort>15</reasoning_effort>`
  >
  > - **What it is:** a bare number with no label like "low" or "high". Nothing in this session says what scale it uses, so I can't reliably turn it into a named level. On a 0–100 scale it would be low, but that's a guess.
  > - **Other "effort" text that isn't about me:**
  >   - **Agent definitions:** `builder` "runs at medium effort, between spec-builder (low) and security-builder (high)", and `scout` "Runs at low effort". These describe subagents.
  >   - **The `claude-security:scan` skill:** it takes an `effort (low|medium|high)` argument for scans.
  >   - **`mcp__ccd_session_mgmt__set_session_effort`:** this tool's name appears in the deferred tool list. It shows effort can be changed, but not what it's set to now.

### Opus result: outcome B (not visible)

- **Scored against the committed rule.** The medium run named no value and no source. So Opus does not have three differing numbers that rise with the setting, and the result is B.
- **Mapping seen, not counted:** low → `5`, high → `15`. The medium run showed no value.
- **Control:** it holds. The answers change with the setting (5, none, 15), and no run named a word it could not source.
- **Observation, not scored.** Two sessions recorded at `medium` did see `10`: the void chip run and this recording session (`get_session` reports `medium`; its context carries a reasoning-effort value of 10). So medium sometimes carries `10` and sometimes nothing. That makes the value unreliable at medium, which supports B rather than weakening it.
