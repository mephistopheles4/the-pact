# The threat model says how crypto and data migrations stand here

**2026-10-17.** #321, from the security pair's review of #317. `docs/threat-model.md` gains a section, "Crypto and data migrations here", before "The risks at a glance", in the wording the owner approved on the issue, revised at Test on the owner's word after behaviour-lens found the crypto inventory incomplete. No accepted-risk entry, scope line or chart point changed. Tier: quick.

## What was built (#321)

- **Crypto.** Hashes in three places: git's SHA-1 object ids check the commit's bytes; SHA-256 fingerprints find drift and bind an apply to its dry run, authenticating no one (R14, R22); SHA-256 in the builder page's content security policy names the script and style the browser runs. Random bytes only name a temporary file. Adding a secret, key, signature or encryption step is new scope.
- **Data migrations.** No database; the install migrates its own state, in the Claude home folder and a project install's rules file and record, through the dry run. A change to the install record's format, the configuration's format, the settings overlay or what an install removes counts as a data migration.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/321)
