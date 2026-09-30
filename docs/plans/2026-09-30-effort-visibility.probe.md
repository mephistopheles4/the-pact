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
