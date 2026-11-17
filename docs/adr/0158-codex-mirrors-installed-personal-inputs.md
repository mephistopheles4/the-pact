# Codex mirrors installed personal inputs through a separate local target

#570, thorough tier on the sensitive route. A Claude home override cannot be a
Codex target: the payload and settings have different runtime meanings.

## Decision

Keep the Claude installer unchanged. `codex/install.mjs` is a separate, scoped
local target. Its code comes from the reviewed commit; personal inputs come
from the installed record, rendered rules and skill folders. Workflow skill
choices are discovered rather than committed as an owner's inventory. Source
hashes, resolved local skill roots, destination hashes and the payload bind the
private plan. Both required CI jobs must identify the expected gate workflow
and installing head.

The target preserves existing settings and unrelated hooks. Plans and backups
stay in known local private Codex directories. Default dry run cannot apply;
the owner separately approves the passing concrete result. Native hook trust
remains the owner's action after installation.

Native subagents inherit parent permissions. The mirror documents the accepted
difference rather than claiming to recreate isolation in prose. Source questions,
efforts and carried rules remain. The cleaner reuses existing recovery and tag
logic with Codex worktree and active-thread discovery. Overrides require a direct
owner-run command because the native pre-tool hook cannot request approval.

## Consequences

The builder source format stays intact. No credential or unrelated plugin
migration is implied. Updates require a fresh dry run against the installed
source. Rollback uses private before-bytes and refuses subsequent owner edits.
Missing source references are reported rather than fabricated.
