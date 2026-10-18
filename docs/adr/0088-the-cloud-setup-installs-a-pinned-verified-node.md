# The cloud setup installs a pinned, verified Node

The cloud setup installs Node 24 itself (#183, T1), because the image ships Node 22 and the install and the gate refuse anything below 24. A pinned mise, checked by hash before it is unpacked, installs a pinned Node against a lockfile hash; the installed `bin/node` is checked too. Only when every check passes do wrappers for `node`, `npm` and `npx` in `/root/.local/bin` point straight at that install, ahead of the image's Node. Any failure leaves no wrapper, so the image's Node stays, and the marker reads `INCOMPLETE` with the reason (`node: arch|download|hash|config|install|version`).

- **Since #183 T3:** the skills and plugins steps no longer fetch at the latest versions; each third-party repo is fetched at a pinned commit, and the Node block's two network steps are timed against the setup's fetch budget, failing as `node: time` when it is spent. See [ADR 0091](0091-the-cloud-setup-fetches-third-party-code-by-pinned-commit.md). This decision still holds.

## Why

- **The owner's decisions, in chat on 2026-10-18:** mise, not Volta, which is unmaintained and checks no hash; mise stays on the PATH with `paranoid` on, so Node can be switched in a session while a project's mise config is refused until `mise trust` (D1); the first run is in a separate test environment, before merge (D2); the wrappers point at the pinned install, not mise's shims (D3); a weekly routine watches advisories (D4).
- **The setup runs as root.** So every pin is a plain assignment the setup's environment can't replace, `gen.mjs` refuses a pin out of its shape, written twice or defaulted (`cloud/pin`), and every fetch runs with the two GitHub token variables, `GH_TOKEN` and `GITHUB_TOKEN`, unset.
- **Wrappers, not shims.** With `paranoid` on, mise's shims refuse to run Node in a folder holding an untrusted `mise.toml` or `.tool-versions`; the wrappers ignore it.
- **Safe mode alone is not enough.** `MISE_SAFE=1` outranks `paranoid` and still reads tools from configs above the working folder, so setup's install also runs with `MISE_LOCKED=1`, which refuses any tool not in the lockfile.

## The pins

`CLOUD_PINS` in `cloud-sessions/gen.mjs` holds five: `MISE_VERSION`, `MISE_SHA256`, `NODE_VERSION`, `NODE_TAR_SHA256` (the linux-x64 `.tar.gz`) and `NODE_BIN_SHA256` (its `bin/node`). The keys the bump checks against are committed in `cloud-sessions/keys/`, with their sources.

| Key | Fingerprint | Second source it was checked against |
| --- | --- | --- |
| Node release keyring (active releasers only) | signed Node 24.22.0's checksums: `C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C` | the releaser list in nodejs/node's README, commit `947b9a3` |
| mise's minisign key | key id `64113EDF160FDEC2`, public key `RWTC3g8W3z4RZK3V3qv7fa1QY4JEWyBtqIHW+85QlJpZc5yG+uNYNBSZ` | aquaproj/aqua-registry's `pkgs/jdx/mise/registry.yaml`, commit `56d6f76` |

## The pin bump

- **Node:** download `SHASUMS256.txt` and `SHASUMS256.txt.sig` for the new version, and check the signature with `gpgv --keyring <repo>/cloud-sessions/keys/node-release-keys.kbx`, which holds only the active releasers' keys. Confirm the signing fingerprint is in nodejs/node's current releaser list, and record it by fingerprint only. Take the linux-x64 archive hash from the checked file, download the archive and confirm its hash, unpack it and hash `bin/node`. Update `NODE_VERSION`, `NODE_TAR_SHA256` and `NODE_BIN_SHA256`, and regenerate. The dated log records the key that signed and both hashes.
- **mise:** check the release's `SHASUMS256.txt` signature with `minisign -Vm SHASUMS256.txt -p <repo>/cloud-sessions/keys/mise-minisign.pub`, take the linux-x64 tarball hash from it, confirm the download's hash, then update `MISE_VERSION` and `MISE_SHA256`. Pick a release at least two weeks old. The log records both checks.
- **Where it runs:** a build thread's container, where `gpgv` is in the image. `minisign` comes from Ubuntu's package archive, checked by apt's signed index, or from a pinned release checked by hash; failing both, the check runs on the owner's device through Remote Control.
- **When:** a Node 24 security release, a mise security advisory against the pinned line, or T4 needing a newer Node. A security fix overrides the two-week rule: a Node or mise security release that reaches a pin is bumped within 7 days of its release. A weekly routine in the project reads mise's and Node's advisories and opens a thread when one reaches a pin.
- **A key changes** only by a reviewed change that names its new source and a second source for its fingerprint, and updates the hash a gate test holds it to. Node's active-releaser keyring is refreshed from nodejs/release-keys when a new releaser signs a release.

## What stays

The image's Node 22 stays installed and is what the PATH falls back to. No `~/.bashrc` edit. The skills and plugins steps (R10) are unchanged, and now run on Node 24. Rolling back is pasting the previous wrapper into the setup field, then reverting the merge.

## Residual risk

A session that marks a project's mise config trusted, by any means, lets that config fetch tools and run hooks as root. `AGENTS.md` says a session here never does so without the owner's word in chat, and names the five means mise offers. The owner accepted the rest as R36 in the threat model, and the pins themselves as R35.

## How this was decided

- **2026-10-18** in chat with the owner: the spec signed off ("Proceed"), and D1 to D4. Plan and both Design review rounds are on #183. Builds on [ADR 0087](0087-node-is-installed-with-mise.md).
- **2026-10-18,** at hand-off, in chat: the owner took the build's picks on the Test review. They were the threat-model edits (R35 to R37), no separate pin for npm and npx, the token wording kept to the two variables, either source for `minisign`, and C2 reworded for a cloud session. The decisions and their reasons are in the dated log.
