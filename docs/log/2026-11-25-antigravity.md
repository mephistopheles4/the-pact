# Antigravity: agents, skills, the guard and the probe

**2026-11-25.** PACT-105 T5 builds what spec 0007 gives Antigravity: its agents, the commands as skills, the guard, and a probe of the installed Antigravity. The work runs at the thorough tier on the sensitive route.

## What was built

- **Agents.** The tool table is filled: `Read` to `view_file`, `Glob` to `find_by_name`, `Grep` to `grep_search`, `Bash` to `run_command`, `WebFetch` to `read_url_content`, `WebSearch` to `search_web`. Any other name is dropped with a warning.
- **Skills.** A skill keeps its command's own `disable-model-invocation: true`, and Antigravity's description takes `explicit-skills`. The render adds the key to no command that lacks it, so a model in any harness can still start a skill that was never kept from it. Antigravity also takes `skill-copies`: its skill folders are copied, not linked.
- **The guard** now judges text typed into a running program (`manage_task` with `send_input`, and `send_command_input`) as it judges a command. A new rule, `owner-skill`, asks before `view_file` or `read_file` opens the `SKILL.md` of `make-it-so`, `finis` or `scry`. The hook matches the read tools only while that rule is on.
- **Windows.** T4's launcher serves Antigravity too, so the guard installs there.
- **A command a session starts itself** is never the owner's word for an install apply or mise trust. That is a rule; nothing enforces it.

## The probe

Antigravity's command line, agy 1.2.14, on Windows 11, headless (`agy -p`), on Gemini's flash model, in throwaway homes (`USERPROFILE` and `HOME`). The sign-in worked there. The app and its editor were not probed. The last runs used a home written by a real `--home` apply of this branch.

- **The hook's shell.** A hook runs under `cmd /c` on Windows, in the folder of its hooks file. Its docs say `sh -c` elsewhere, which was not probed. `run_command` itself runs PowerShell.
- **Answers.** Exit 0 with no output lets the call run. `{}` refuses it. `deny` blocks, `allow` runs, `ask` ran with nobody to ask. `force_ask` was refused as a question headless mode can't show, for a command on the allow list and for a file read. The question itself was not seen, and `force_ask` under auto-proceed was not run.
- **Failures.** Exit 1, exit 2 with and without standard error, a hook that can't start, a time-out and output that is not JSON all blocked the call. Its documentation says a non-zero exit is ignored, so the pact relies on none of this: the wrapper and the launcher answer `deny` with exit 0.
- **T4's launcher.** A deny blocked, a silent exit 0 ran, `force_ask` asked, and a missing wrapper and a missing `node` were both denied, under a path with spaces and parentheses and with a `NODE_OPTIONS` that would crash `node` inherited.
- **Typed input.** A matcher of `run_command` misses it: a guarded command typed into a running `cmd.exe` through `manage_task` ran. With the widened matcher it is refused. `send_command_input` is registered, but neither the session nor a subagent that listed it was given it, so its arguments are unknown; the guard reads `Input`.
- **Agent files.** An agent with `tools: []` got `send_message` and `manage_task`; with no `tools` line it got more, with no shell. An unknown name stops the subagent from starting. A subagent got `read_file` for `view_file`, `run_command` and `search_web`; `find_by_name`, `grep_search`, `list_dir` and `read_url_content` were accepted and never arrived, on the flash and pro models alike. The installed `data-lens` got `read_file`, `send_message` and `manage_task`.
- **Lenses and the hook.** The guard refused a guarded command from `behaviour-lens`.
- **Skills.** A junctioned skill folder was not listed, and typing its name found nothing but what the model searched out with a shell. The same skill as a real folder was listed, and typed, ran. With `disable-model-invocation: true` it was left out of what the model sees, and typed, still ran with no file read.
- **The ask on a read.** A read of the installed `finis` skill file was held for a question; a read of `scriptorium`'s ran.
- **Rules.** `~/.gemini/AGENTS.md` loaded.
- **The environment.** A command saw planted variables named like a token, a secret, an API key and a password. No setting that drops them was found in the bundled documentation or by searching the program's text.

## Left open

- **Not probed:** the app and the editor, Linux and macOS, the question a person sees, auto-proceed, a child `agy` run, and any other version.
- **Lenses can't search** on this command line, so a lens there reads only files it can name.
- **The owner's call** on widening "A session takes checkpoints alone" (spec 0007, S15) is still open. On a no, Antigravity leaves the default install list.
- **Word budgets.** The threat model's cap rose to 3,900 (PACT-109 cleans that file up), and any doc budget this text passes rises with it (PACT-110).
