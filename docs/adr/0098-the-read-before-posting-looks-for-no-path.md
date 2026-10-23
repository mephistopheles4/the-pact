# The read before posting looks for no path

The review procedure's read before posting no longer counts a home or temp folder path as a personal detail (#368). It still looks for a secret's value, a user name, a host name and an email address; a path counts only for a user or host name it holds. This amends [ADR 0097](0097-the-poster-refuses-no-path.md), which kept the path item in the read when the poster's path rule went.

## Why

- **It held back ordinary reports.** With the temp folder on a Dev Drive folder that names nobody, a lens report citing a scratch or test-output path stayed local, and the rules forbid editing or rerunning a report to get it posted. Sessions read that as the path check still being on.
- **The owner chose it** (in chat, 2026-10-23): drop paths from the read entirely, keep user name, host name, email and secrets. #364's own body already described the read as looking for a user name or a host name.

## What stays

The read's other items, and the push read of commits in `AGENTS.md` and `docs/agents/gate-tests.md`, which still names this machine's paths.

## The risk

A path that says something about the owner without holding their user or host name, such as a project folder's name, now reaches a post with no check. The threat model's R34 records the wider risk, accepted by the owner on 2026-10-23, in chat.
