# The run-guards tests find Git's shell whatever the PATH order

**2026-10-16.** On Windows, the run-guards cases that run the documented POSIX command failed with "no POSIX shell found" unless Git's `cmd` folder came first on PATH. An earlier full suite on the same machine passed, so the result hung on PATH order. Tier: quick.

## What was built (#293)

- **`gitShell` in `gate/tests/run-guards.test.mjs`** walks up from every git that `where` reports to the Git install root holding `bin\sh.exe` or `usr\bin\sh.exe`. Before, only the first git was used, and only its parent folder was tried, which misses when `mingw64\bin` comes first.
- **A unit case** feeds the lookup a fake file system: each of Git's three git folders, a later git on PATH, the `usr\bin` fallback alone, and no shell at all.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/293)
- [The QA pair's review and Lens dispositions](https://github.com/mephistopheles4/the-pact/issues/293#issuecomment-6227257791)
