# The poster refuses no path

The poster's `path/machine` rule is gone (#364): its scan no longer refuses this machine's home or temp folder, user name or host name. This amends [ADR 0086](0086-the-poster-refuses-only-this-machines-own-paths.md), which kept that rule when `path/local` went.

## Why

- **It refused ordinary work.** Since 2026-10-17 the temp folder on the owner's machine is a folder on the Dev Drive that names nobody, so every scratch and test-output path counted as "this machine's temp folder" and was refused. Sessions read that as the poster refusing absolute paths.
- **The owner wants no path check in the poster** (in chat, 2026-10-22). The owner declined the sensitive route for the change, in chat.

## What stays

Every other scan rule: tokens, link passwords, secret environment values, session ids, email addresses and hidden characters. The review procedure's read before posting still looks for a home or temp folder path, a user name and a host name. A gh error line is still shown only when it trips no scan rule; with no path rule, a line naming a local path is shown.

## The risk

A path that names the owner, such as one under their home folder, now reaches a post when the read before posting misses it. The threat model's R34 records the wider risk, accepted by the owner on 2026-10-22, in chat.
