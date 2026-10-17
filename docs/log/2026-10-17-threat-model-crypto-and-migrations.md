# The threat model says how crypto and data migrations stand here

**2026-10-17.** #321, from the security pair's review of #317. `docs/threat-model.md` gains a section, "Crypto and data migrations here", before "The risks at a glance", in the wording the owner approved on the issue. No accepted-risk entry, scope line or chart point changed. Tier: quick.

## What was built (#321)

- **Crypto.** SHA-256 is used only as a fingerprint for drift and to bind an apply to its dry run; it authenticates no one (R14). Random bytes only name a temporary file. Adding a secret, key, signature or encryption step is new scope.
- **Data migrations.** No database; the install migrates its own state in the Claude home folder through the dry run. A change to the install record's format, the settings overlay or what an install removes counts as a data migration.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/321)
