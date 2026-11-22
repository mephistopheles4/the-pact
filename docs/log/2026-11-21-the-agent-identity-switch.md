# The agent identity switch

#603, T2 of #599.

A new user setting, `agent-identity`, off by default, wires local sessions to the GitHub App helper that T1 (#602) added. While it is on, the renderer adds `gh-app` to the `TOOLS` line (the `tools` list still refuses it), so the install copies `~/.claude/pact/tools/gh-app.mjs`, and the install sets two keys in `env` in `settings.json`, `GIT_CONFIG_GLOBAL` (the claude app's gitconfig) and `GIT_TERMINAL_PROMPT` (`0`). The gitconfig includes the owner's own global config, sets the bot as `user.name` and `user.email` (the owner's own `author.*` settings still win), and drops Git Credential Manager, so a failed mint fails an HTTPS push. An askpass program, an SSH remote and a global git write still go around it; `docs/agent-identity.md` lists them. The builder's Settings dialog shows the switch; no preset or builder file turns it on.

The install records the two keys under `identityEnv`, as the stop switch records its rules, and drops only a key whose live value is still the recorded one. It refuses to turn the switch on when `pact/github.json` holds no claude app, when the gitconfig is missing or differs from the text setup writes (the install keeps its own copy of that text, and a test holds it equal to `gh-app.mjs`'s), and when the owner's own `env` already sets either key. The dry run says only `gitconfig as expected: yes`, or `no` with which part differs, never a line of the file. A switch-off dry run skips the check.

No gate check is loosened. `GIT_CONFIG_GLOBAL` is not among the install gate's `GIT_REDIRECTS`, and the gate's git calls get only `KEEP` variables, so the variable never reaches them. The first check of the spec (S7), on Git for Windows against temporary configs and a stub helper returning a canary, passed, and a gate test repeats it on both CI jobs: the include loads, the empty `helper =` drops the stub, a fill never returns the canary, a repository's own `user.name` wins, and a refused mint fails the fill with no prompt.

The app names are the owner's to choose and nothing in the code names one; the docs use the owner's picks as examples.

**Rolling back:** turn the switch off first, dry run, and apply on the owner's go-ahead; then take the key out of the configuration and revert the merge. An older installer refuses the key and ignores `identityEnv`, so reverting first would leave the two `env` keys in `settings.json`. `docs/agent-identity.md` has the order, the retire-an-app steps and the leaked-key steps.

**The Node rule.** On Windows the install refuses a Node that is not `C:\Program Files\nodejs\node.exe` on the system drive (S7); elsewhere only the absolute-path-to-`node` rule holds, since the helper cannot run there. The install's runner drops `ProgramFiles` from its environment, so the folder comes from `SystemRoot`. A test cannot move the folder, so the end-to-end tests plant the rule off in a throwaway copy of the repo, and the rule has its own unit test and a Windows-only end-to-end test that runs unplanted.

**Not built.** Marking the agent gitconfig read-only, so a session's `git config --global` could not rewrite it, was tried first: on Windows git replaces a read-only file anyway, so it stops nothing. The docs say instead that the next dry run refuses a rewritten gitconfig. The decision, with the switch's other limits, is [ADR 0162](../adr/0162-the-agent-identity-switch-installs-gh-app.md).

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/603
- The spec, revision 5: https://github.com/mephistopheles4/the-pact/issues/599#issuecomment-7067672460
- The plan: https://github.com/mephistopheles4/the-pact/issues/603#issuecomment-7071036217
- Test round 1: https://github.com/mephistopheles4/the-pact/issues/603#issuecomment-7071442672
