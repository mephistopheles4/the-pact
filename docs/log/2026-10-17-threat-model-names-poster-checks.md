# The threat model names the poster's own checks

**2026-10-17.** #316, from the security pair's review of #294. `docs/threat-model.md` gains a section, "The poster's own checks", that names the poster's login check, its owner checks and its input rules as a boundary in code, by their rule ids. No accepted-risk entry, scope line or chart point changed. Tier: quick.

## What was built (#316)

- **The threat model.** A new section before "What you may tweak" names each check by class, says which risks it bears on (R2, R4, R11 to R16, and R3, R13, R29 for the scans), and says where it does not hold: posts not sent through the poster, installs with it off, and a rewritten poster (R14).

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/316)
