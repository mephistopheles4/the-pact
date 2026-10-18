# Keys for the cloud setup's pin bump

The two public keys the pin bump in [ADR 0088](../../docs/adr/0088-the-cloud-setup-installs-a-pinned-verified-node.md)
checks signatures against. Neither is fetched again at a bump: a key changes
here only by a reviewed change that names its new source.

| File | What it is | Source | Licence |
| --- | --- | --- | --- |
| `node-release-keys.kbx` | Node's release keyring, the active releasers' keys only | `gpg-only-active-keys/pubring.kbx` in [nodejs/release-keys](https://github.com/nodejs/release-keys) at commit `481637f813e912c4aa3622d7964ab426c97b8e8d` | MIT |
| `mise-minisign.pub` | mise's release-signing key, `64113EDF160FDEC2` | `minisign.pub` in [jdx/mise](https://github.com/jdx/mise) at tag `v2026.10.2`, commit `44ea2537166efbe21b19d808355d9914e830941a` | MIT |

SHA-256 of each file as committed:

- `node-release-keys.kbx`: `140f2ad5260fd62773b6243ce8e1d3009645d558f121b8262c55e383dc285932`
- `mise-minisign.pub`: `647782ec4f81cc3b9be690bd266e30191acd6711cf0ff8163b7d1e46cd8f96a1`

The fingerprints and their second sources are in the ADR. A gate test holds each file to its hash above, so a swapped key shows as a text change here.

The keyring carries its releasers' public user IDs, names and email addresses. A log or a post names a key by its fingerprint only.
