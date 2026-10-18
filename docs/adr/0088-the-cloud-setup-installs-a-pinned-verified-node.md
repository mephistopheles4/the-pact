# The cloud setup installs a pinned, verified Node

The cloud setup installs Node 24 itself (#183, T1), because the image ships Node 22 and the install and the gate refuse anything below 24. A pinned mise, checked by hash before it is unpacked, installs a pinned Node against a lockfile hash; the installed `bin/node` is checked too. Only when every check passes do wrappers for `node`, `npm` and `npx` in `/root/.local/bin` point straight at that install, ahead of the image's Node. Any failure leaves no wrapper, so the image's Node stays, and the marker reads `INCOMPLETE` with the reason (`node: arch|download|hash|config|install|version`).

## Why

- **The owner's decisions, in chat on 2026-10-18:** mise, not Volta, which is unmaintained and checks no hash; mise stays on the PATH with `paranoid` on, so Node can be switched in a session while a project's mise config is refused until `mise trust` (D1); the first run is in a separate test environment, before merge (D2); the wrappers point at the pinned install, not mise's shims (D3); a weekly routine watches advisories (D4).
- **The setup runs as root.** So every pin is a plain assignment the setup's environment can't replace, `gen.mjs` refuses a pin out of its shape, written twice or defaulted (`cloud/pin`), and every fetch runs with the GitHub token variables unset.
- **Wrappers, not shims.** With `paranoid` on, mise's shims refuse to run Node in a folder holding an untrusted `mise.toml` or `.tool-versions`; the wrappers ignore it.
- **Safe mode alone is not enough.** `MISE_SAFE=1` outranks `paranoid` and still reads tools from configs above the working folder, so setup's install also runs with `MISE_LOCKED=1`, which refuses any tool not in the lockfile.

## The pins

`CLOUD_PINS` in `cloud-sessions/gen.mjs` holds five: `MISE_VERSION`, `MISE_SHA256`, `NODE_VERSION`, `NODE_TAR_SHA256` (the linux-x64 `.tar.gz`) and `NODE_BIN_SHA256` (its `bin/node`). The keys the bump checks against are committed in `cloud-sessions/keys/`, with their sources.

| Key | Fingerprint | Second source it was checked against |
| --- | --- | --- |
| Node release keyring | signed Node 24.22.0's checksums: `C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C` (Richard Lau) | the releaser list in nodejs/node's README, commit `947b9a3` |
| mise's minisign key | key id `64113EDF160FDEC2`, public key `RWTC3g8W3z4RZK3V3qv7fa1QY4JEWyBtqIHW+85QlJpZc5yG+uNYNBSZ` | aquaproj/aqua-registry's `pkgs/jdx/mise/registry.yaml`, commit `56d6f76` |

## The pin bump

- **Node:** download `SHASUMS256.txt` and `SHASUMS256.txt.sig` for the new version, and check the signature with `gpgv --keyring <repo>/cloud-sessions/keys/node-release-keys.kbx`. Take the linux-x64 archive hash from the checked file, download the archive and confirm its hash, unpack it and hash `bin/node`. Update `NODE_VERSION`, `NODE_TAR_SHA256` and `NODE_BIN_SHA256`, and regenerate. The dated log records the key that signed and both hashes.
- **mise:** check the release's `SHASUMS256.txt` signature with `minisign -Vm SHASUMS256.txt -p <repo>/cloud-sessions/keys/mise-minisign.pub`, take the linux-x64 tarball hash from it, confirm the download's hash, then update `MISE_VERSION` and `MISE_SHA256`. Pick a release at least two weeks old. The log records both checks.
- **Where it runs:** a build thread's container, where `gpgv` is in the image. `minisign` is fetched as a pinned release and checked by hash, or the check runs on the owner's device through Remote Control if it can't be had in the cloud.
- **When:** a Node 24 security release, a mise security advisory against the pinned line, or T4 needing a newer Node. A security fix overrides the two-week rule. A weekly routine in the project reads mise's and Node's advisories and opens a thread when one reaches a pin.
- **A key changes** only by a reviewed change that names its new source and a second source for its fingerprint.

## What stays

The image's Node 22 stays installed and is what the PATH falls back to. No `~/.bashrc` edit. The skills and plugins steps (R10) are unchanged, and now run on Node 24. Rolling back is pasting the previous wrapper into the setup field, then reverting the merge.

## Residual risk

A session that runs `mise trust` on a project's config, or turns `paranoid` off, lets that config fetch tools and run hooks as root. `AGENTS.md` says a session here never does either without the owner's word in chat. Recording it as an accepted risk is the owner's call, at hand-off.

## How this was decided

- **2026-10-18** in chat with the owner: the spec signed off ("Proceed"), and D1 to D4. Plan and both Design review rounds are on #183. Builds on [ADR 0087](0087-node-is-installed-with-mise.md).
