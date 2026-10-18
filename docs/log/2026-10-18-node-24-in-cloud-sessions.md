# Node 24 in cloud sessions

**2026-10-18.** #183, ticket T1. The cloud image ships Node 22, and the install and the gate refuse anything below 24. The cloud setup now installs a pinned, verified Node 24 through mise and puts it on the PATH. Tier: thorough, sensitive route; built on Opus at high, test-first.

## What was built

- **The Node block** in `cloud-sessions/tpl-setup-head.sh`, before the skills step. It refuses any machine but `x86_64`, downloads the pinned mise with the GitHub token variables unset, and checks its hash before unpacking. It then writes mise's global config with `paranoid` on and a lockfile holding the Node archive's hash, and asks mise whether `paranoid` is on. It installs the pinned Node with `MISE_SAFE=1 MISE_LOCKED=1` from a temp folder and checks the installed `bin/node`. Only then does it write `node`, `npm` and `npx` wrappers in `/root/.local/bin`. Any failure removes the wrappers it wrote and names its reason.
- **The Result section** runs `/root/.local/bin/node` by path and turns the marker `INCOMPLETE (… node: <reason>)` on any Node failure or a version other than the pin.
- **`gen.mjs`** holds the pins in `CLOUD_PINS` and writes them as five plain assignments. `assemble()` refuses a pin out of its shape, one set twice, defaulted in an expansion, or whose value appears anywhere else (`cloud/pin`).
- **Tests: +3.** One holds the block's checks in order, every pin once and every fetch without the tokens. One holds the `cloud/pin` refusals, among them a wrong length, a shell metacharacter, a line break, a `${VAR:-…}` or `${VAR-…}` default and an `export` reassignment. One holds each committed key file to the hash its README records. The marker test changed for the new condition, and the assemble tests' stand-in head gained the pins placeholder. Run before the build, the new tests and the marker test failed, and the rest passed; each case added after the lenses was seen to catch a broken copy of the code.
- **The test drivers** install `curl` and `gnupg`, show the wrappers and `paranoid` after each pass, and run the hand checks below. Their stale `familiars/scout.md` path (scout moved to `claude/agents/`) is fixed.
- **`cloud-sessions/keys/`** holds Node's release keyring and mise's minisign key, with their sources. **`AGENTS.md`** says a session never runs `mise trust` or turns `paranoid` off without the owner's word in chat.

## The pins, re-checked at build time

- **Node 24.22.0:** `SHASUMS256.txt.sig` checked with `gpgv` against the committed keyring (nodejs/release-keys at `481637f`, the active releasers' keys only): a good signature from `C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C`, which nodejs/node's README lists. The archive hash in the checked file, `28ea0a43…4228c`, matches the download. `bin/node` hashes to `67ca5783…751c`.
- **mise 2026.10.2:** the release's `SHASUMS256.txt` checked with `minisign` against the committed key (jdx/mise at tag `v2026.10.2`), key id `64113EDF160FDEC2`, which aqua-registry's mise entry also names. A copy with one byte changed failed the check. The tarball hash in the checked file, `79a2bf0f…db788`, matches the download.
- **One departure from the signed-off procedure:** `minisign` came from Ubuntu 24.04's package archive (`minisign 0.11-1`, checked by apt's signed index), not from a pinned release checked by hash. It is raised with the owner at hand-off.

## Hand checks

Run with the test driver in an `ubuntu:24.04` container. In a cloud container the network goes only through a proxy, so the container got the proxy's address and its CA bundle through a forwarder on the Docker bridge, with no host network and no credentials.

- **C5:** two passes give the same snapshot, the same three wrappers and `v24.22.0`.
- **C3:** a wrong mise pin, a wrong archive pin and a wrong binary pin each print their mismatch `WARN`, leave no wrapper and read `INCOMPLETE (12 of 12 written, 0 hash mismatches, node: hash)`. A wrong mise pin leaves no mise; a wrong archive or binary pin leaves the checked mise and no Node install, aliases included. A missing mise release reads `node: download`, and `paranoid` off in the config reads `node: config` and leaves no mise.
- **C4:** under a `uname` stub printing `aarch64`, the block is skipped with a `WARN` and `node: arch`.
- **C8, in the container:** the block alone took 8 to 10 s from nothing installed, over four runs.
- **C10, in the container:** in a folder holding an untrusted `mise.toml` that asks for Node 22, `mise install` refuses with "are not trusted" and installs nothing, and `node --version` through the wrapper prints `v24.22.0`. The half of C10 that runs `mise trust` was not run: `AGENTS.md` keeps that for the owner's word.
- **C1, in the container:** `mise exec node@22 -- node --version` printed `v22.23.3`.
- **C1, C2, C7, C8, C10** run again in a cloud session in the test environment before merge (D2).

## The full suite in a cloud container

On Node 24.22.0, with `NODE_OPTIONS` and the token variables unset, 240 tests failed: the install refuses while `GIT_CONFIG_COUNT` is set, and a cloud session sets it, with its `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*` pairs. With those unset too, 2,154 passed and one failed: "a project holding the real home folder refuses", which fails the same way on `main` in a cloud container, where the home folder is `/root`. So C2's command, as the spec words it, can't pass in a cloud session yet; that question goes to the owner. CI's full run on Linux is the Test evidence.

## Decisions

- [ADR 0088](../adr/0088-the-cloud-setup-installs-a-pinned-verified-node.md) — The cloud setup installs a pinned, verified Node.

## Record

- [Plan, signed off](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6250226884)
- [Design review, round 1](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6250252522)
- [Design review, round 2](https://github.com/mephistopheles4/the-pact/issues/183#issuecomment-6250267526)
