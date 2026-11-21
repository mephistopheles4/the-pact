# The GitHub App helper

#602, T1 of #599.

`claude/tools/gh-app.mjs` is a Windows-only helper that lets a session post to GitHub as the owner's own GitHub App instead of the owner. It keeps the app's private key in Windows Credential Manager and mints an installation token, narrowed to one repo, on demand. It has five modes: `setup` pins one app and stores its key, `git-credential` answers git for an https github.com repo path, `gh` runs `gh` with a minted token, `status` says what git would do, and `forget` revokes and removes. No mode prints a token; `mintToken` is a module export only. Every GitHub request carries the pin check: the app's public record, owner, permissions and bot are compared with `~/.claude/pact/github.json` when a token is not already cached.

The gate change is small. `gh-app` joins `PACT_TOOLS` in `gate/shared.mjs` and its copy in `gate/install-core.mjs`, so seam A takes the file. The renderer refuses it in the `tools` list, with a bad case each for `gh-app` alone and with another tool, so nothing installs it in T1: only the agent-identity switch, a later ticket of #599, will. `docs/reference.md` says so. The helper's tests run on fakes (a fake GitHub, Credential Manager, `gh` and `git`); no key, token or app exists in the tree.

The owner picked, through the lead, that the machine is trusted: the node-path allow-list, the second-repo-flag refusal in `gh` mode and `forget`'s settings-file checks were removed, and hardening beyond real leaks (keys, transcripts, the network) was not built. Those removals wait for the owner's own confirmation. The threat-model edit that spec section S10 names must land no later than the switch that installs the helper.

**Rolling back:** revert the merge. Nothing installs the helper, so nothing on a machine changes until the switch exists.

## Record

- The ticket: https://github.com/mephistopheles4/the-pact/issues/602
- The spec, revision 5: https://github.com/mephistopheles4/the-pact/issues/599#issuecomment-7067672460
- The Test rounds, one and two: https://github.com/mephistopheles4/the-pact/issues/602#issuecomment-7068230636 and https://github.com/mephistopheles4/the-pact/issues/602#issuecomment-7068335393; the standards pair's read: https://github.com/mephistopheles4/the-pact/issues/602#issuecomment-7069256236
- The status comment: https://github.com/mephistopheles4/the-pact/issues/602#issuecomment-7068233607
- The CodeRabbit review and the replies: https://github.com/mephistopheles4/the-pact/pull/609
