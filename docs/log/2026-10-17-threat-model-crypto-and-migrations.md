# The threat model says how crypto and data migrations stand here

**2026-10-17.** #321, from the security pair's review of #317. `docs/threat-model.md` gains a section, "Crypto and data migrations here", before "The risks at a glance", in the wording the owner approved on the issue, revised twice at Test on the owner's word after behaviour-lens found gaps; the owner capped it at one last round, with anything further going to a follow-up issue. No accepted-risk entry, scope line or chart point changed. Tier: quick.

## What was built (#321)

- **Crypto.** One rule: hashes detect change and never authenticate, apart from the builder page's policy hashes. Four uses named: git's SHA-1 object ids, SHA-256 checks in the install record and the cloud setup script, the apply binding to the rendered hash when a configuration applies (R14, R22), and the builder page's policy hashes. Random bytes only name a temporary file.
- **Data migrations.** No database; the install migrates its own state, in the Claude home folder and a project install's rules file and record. The install deletes any unchanged recorded file the pact no longer ships; the #262, #302 and #265 cases are named. A change to the install record's format, the configuration's format, the settings overlay or what an install removes counts as a data migration.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/321)
