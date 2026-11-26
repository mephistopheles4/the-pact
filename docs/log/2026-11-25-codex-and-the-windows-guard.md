# Codex: skill links, the Windows guard and the probe

**2026-11-25.** PACT-105 T4 builds what spec 0007 gives Codex: the commands linked in as skills (C19), the guard on Windows, and a probe of the installed Codex. The work runs at the thorough tier on the sensitive route.

## What was built

- **Skill links.** Each command that is on, and `/scriptorium`, is linked from a harness's skills folder to `~/.pact/skills/<name>`: a directory junction on Windows, a symlink elsewhere, and a copy where no link can be made. The record lists each link, and only a recorded link or copy is removed. A recorded link that is gone is made again; one replaced since is drift; a folder the record does not list is the owner's.
- **Codex's agent files.** The record check took only `.md` files in an agents folder, so every re-run skipped Codex's recorded `.toml` agents: no drift check, the owner's own file or edit would be replaced, and taking Codex out left them. It takes both now.
- **The shell environment policy.** While Codex is taken, the install puts `shell_environment_policy.ignore_default_excludes = false` first in `~/.codex/config.toml`, marked with the pact's comment, and records that it did (C33). A config that names the policy itself is left with a warning. The file is read as lines, with no TOML parser, so a mention anywhere outside a comment counts as the owner's. The pick came after the probe found that Codex's shells keep every variable.
- **The Windows hook.** The install makes a launcher beside each wrapper, and the hook is `<Windows>\System32\cmd.exe /d /c call "<launcher>.cmd" ; exit $LASTEXITCODE` (S8). The launcher turns every unexpected end, a missing `node` included, into the harness's denial. A path either shell would misread refuses. A node that is not Windows's refuses to write a guard into a home holding `AppData`. This settles T3's open amendment: the five Windows install skips are gone, and the guard installs on Windows for Codex and Antigravity.

## The probe

Codex CLI 0.159.0 on Windows 11, run in throwaway homes (`CODEX_HOME`, `HOME` and `USERPROFILE`), with a stand-in model service on the loopback address that asked for fixed tool calls, planted fake secrets, and a stand-in MCP server. No credential was used and no model ran, so this shows what Codex does with a call, not what a model chooses to call. The Windows sandbox's elevated mode was not set up, since that changes the machine.

- **The hook's shell.** Codex runs a hook as `pwsh -NoProfile -Command "<command>"`, in the session's working folder, with the parent's environment.
- **Deny shape.** Exit 2 with a reason on standard error: the call is refused as `Command blocked by PreToolUse hook: <reason>`. Of five command forms for a wrapper that exits 2 (bare `node`, T3's `cmd` text, `cmd /c` of the launcher with and without `call`, and the form above), only the last blocked; the others let the call run.
- **Paths.** Under PowerShell the launcher form fails for a path holding `$`, a backtick, a curly double quote, `&` or `^`, and for `(`, `)`, `;`, `,` or `=` in a path with no space. Spaces, parentheses beside a space, apostrophes and letters outside ASCII work.
- **Trust.** `codex exec` runs no untrusted hook, and says nothing. The probes passed `--dangerously-bypass-hook-trust`, in a throwaway home holding only the probe's and the pact's hooks. The trust step in `/hooks` itself was not driven.
- **The installed guard** refused a guarded command from the session and from a lens, whose hook input names its agent.
- **Typed input.** `write_stdin` runs no PreToolUse hook, even under a matcher of `.*`: a guarded command typed into a running shell ran. No hook can cover it. `--disable unified_exec_tty` closed it: a command asking for a terminal was refused with `TTY execution is disabled by config`, and one without got no open input. Disabling `write_stdin_approval` or `unified_exec` did not.
- **The environment.** At Codex's defaults, commands of the session and of a lens, and the hook, saw every variable of the parent, the planted `*_KEY`, `*_SECRET` and `*_TOKEN` ones included, sandboxed or not.
- **The policy.** With the pact's line, as with the same key in a table, the shells of the session, of a lens and of a typed-into shell lost the names holding KEY, SECRET or TOKEN, in any case. `DB_PASSWORD`, `AWS_CREDENTIALS`, `CONNECTION_STRING` and `GITHUB_PAT` stayed, and the hook still saw everything. A trusted project's `.codex/config.toml`, or a `-c` flag, set it back; the same table in a lens's agent file did not. `codex mcp add`, `codex mcp remove` and `codex features enable` kept the line and the comments, rewriting CRLF as LF. Not probed: macOS and Linux, and whether a login shell or a saved Windows user variable brings a dropped value back.
- **Agents and skills.** The rules loaded from `CODEX_HOME/AGENTS.md`, and a lens took its model and effort from its agent file. A lens had no multi-agent tool, and had the configuration's MCP servers. Codex finds `~/.agents/skills` through the Windows profile, not `USERPROFILE`, so that folder was not probed with the pact's links; a junction in a project's `.agents/skills` was followed, `$finis` loaded the skill, and the skill was not in the list the model sees. Junctioned skills in `CODEX_HOME/skills` were listed and loaded too.
- **MCP calls.** Under approval `on-request` Codex asked before a tool with no read-only mark, from the session and from a lens, and ran one marked read-only without asking. Under `never` with full access both ran without asking, and `codex exec` ran at `never` even when passed `on-request`.
- **The sandbox.** With no `[windows] sandbox` setting, `codex exec` refused every command under its read-only default, and the app server turned a workspace-write request into read-only and asked before each command. With `unelevated` and workspace-write: writes inside the work folder worked and outside it failed; a file in the home folder was readable; a raw TCP connection to the loopback address succeeded, although the session said network access was off, which that mode sets through proxy variables. Nothing off the machine was tried.
- **Leftover processes.** A process a lens started detached outlived it and wrote a file later. A command still running in the lens's own exec session did not write after the lens was closed.

## Left open

- **A leftover process can write after `review.md`'s tree check.** The threat model says so now; the check is unchanged.
- **Typed input** passes the guard in Codex. Setting `features.unified_exec_tty=false` would close it, at the cost of every interactive terminal session and an edit inside the owner's `[features]`; it is not built, and is the owner's call.
- **Secrets under other names** reach every command in Codex, and a dropped value stays readable where it was set. The poster in a Codex shell no longer refuses a dropped value.
- **Antigravity's hook on Windows** was probed by the T5 session, not this one: it reported this launcher, under agy 1.2.14, blocking both a denial and a launcher failure.
- **Not probed:** the trust step in `/hooks`, the elevated sandbox, a Codex of another version, a hook under a session shell other than PowerShell, and the pact's links in the real `~/.agents/skills`.
- **Word budgets.** `docs/install.md`'s was raised to 10,250 and `docs/reference.md`'s to 2,450 (PACT-110 cleans them up), and the threat model's cap to 4,000 (PACT-109).

## Record

- PACT-105, ticket T4's comments: its plan, its status comments and its checkpoint log.
- Pull request #678: the comments titled "Test round" and "Test further read", and its status comment.
