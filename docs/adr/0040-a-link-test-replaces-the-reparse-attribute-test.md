# A link test replaces the reparse-attribute test

The install refuses a path that redirects a read or a write. On Windows, the old script refused any path with the reparse-point attribute. The Node install tests each segment below a root with `lstat` and `realpathSync.native` instead.

- **The rule.** Take the root as the real path of the Claude home folder, or of the project. For each segment below it:
  - `lstat` must not report a link;
  - the segment's real path must equal the root joined with the relative path, compared without regard to case on Windows.
- **Below the root only.** The root's own ancestors are never tested, as the old script never tested them. So a moved `C:\Users` behind a junction, an 8.3 short name, or a `subst` or mapped drive still installs.
- **Fail closed.** Any error but not-found refuses. A not-found segment ends the walk.
  - So on Windows, where a file that can't be opened can't be resolved, an unreadable configuration file refuses at the link test, before the renderer would. On Linux the renderer refuses it.
  - The refusal names it a link or other reparse point, which is accurate only in the redirect case.
- **Where it runs:** the user configuration file and its blocks folder before the renderer, each live destination, and the project's paths at each step of a project install, including after the write.

## Why

- **The threat is redirection.** A link sends a read or a write somewhere else, which is what the test exists to catch. A probe on 2026-10-08 (#153, S7) showed that every redirecting entry is caught: junctions, directory and file symlinks, and a file under a junction. An app execution alias errors, and so refuses.
- **What changes.** A reparse point that doesn't redirect, such as a OneDrive cloud placeholder, now passes. It still holds its own content.
- **No Windows-only process.** Asking PowerShell 5.1 for the attribute would keep exact parity at the cost of a second process and its output parsing, which isn't worth it for this threat.

## Not checked

WSL symlinks, deduplicated files and Windows Container Isolation were not probed.

## How this was decided

- **2026-10-08:** #153's spec, S7 and D5, signed off in revision 6. Built in #166.
