# The poster drops its path-shape rule

**2026-10-17.** The poster's `path/local` rule refused any text shaped like a local path, which withheld whole lens reports and ordinary prose. The owner dropped it and accepted the risk. Tier: quick.

## What was built (#326)

- **The poster** loses `path/local` and its patterns; `path/machine` is unchanged.
- **Its tests** lose path/local's eight cases and gain two: one shows that a drive-letter path, a network share and another user's home post; one runs `path/machine` on a Windows-shaped machine, whose other-slash, drive-letter and project-folder forms path/local used to hide.
- **The rules file's poster bullet**, `docs/poster.md` and `docs/reference.md` name a path of this machine's, not any local path.
- **The threat model** records the accepted risk and updates the poster's scan line.
- **Regenerated:** `cloud-sessions/` and `builder/scriptorium.html`, both already in step.

## Decisions

- [ADR 0086](../adr/0086-the-poster-refuses-only-this-machines-own-paths.md): the poster refuses only this machine's own paths.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/326)
- [The tier and the declined sensitive route](https://github.com/mephistopheles4/the-pact/issues/326#issuecomment-6243713061); the owner accepted the risk in the issue body
