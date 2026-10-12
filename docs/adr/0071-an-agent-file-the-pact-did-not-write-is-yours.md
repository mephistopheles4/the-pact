# An agent file the pact did not write is yours

The pact manages only the agent files it wrote. An agent file in `~/.claude/agents/` that it didn't write, or one changed since it wrote it, belongs to the person: the install never overwrites, deletes or records it, and the dry run lists it under "Yours, left as is". Agents stay ordinary files in the standard agents folder (#262, the correction to addendum 3; the owner's decision in chat).

## What changed

- **Ownership comes from the install record.** An agent path the last record lists, whose live bytes still match the recorded hash, is the pact's, and the install keeps it current. An agent path whose live file differs from its record, or that the record doesn't list, is the person's. A first install, which has no record, treats a file sharing a pact agent's name as the person's unless it is byte for byte the pact's.
- **The person's files are left alone.** The install never overwrites, deletes or records one, and lists it in the dry run under "Yours, left as is". A changed pact agent is no longer drift that blocks the install. Deleting the file brings the pact's back on the next install.
- **The builder writes agent files.** The page's Agents dialog can add an agent or edit a pact agent's prompt, and a save writes the whole file into `agents/`. The install then treats it like any file of the person's. A save never deletes an agent file.
- **No `pact/agents/` folder.** Addendum 3 had the owner's agent files live in the pact folder, rendered and installed by the gate. That was reverted: the pact folder holds only what has no standard place in Claude Code.
- **Seam A no longer polices a `tools` line's form.** An agent file only has to parse, with a name that matches its stem (ADR 0069).

## Why

- **People bring their own expertise.** The pact's agents are suggestions; a person who rewrites one has decided. Overwriting it on the next install, or blocking on it as drift, made the pact the owner of a file the person had taken over.
- **The record already knows what the pact wrote.** A hash per file is enough to tell the pact's from the person's, so no marker line in the file is needed.
- **Standard places are where people look.** An agent in `~/.claude/agents/` is one Claude Code users already know how to read and edit.

## What was weighed

- **A marker line in each pact agent.** Rejected: the record already decides, and a marker can be copied.
- **Agent files under `pact/agents/`, installed through the gate** (addendum 3). Reverted, as above.
- **The cost.** A pact agent a fooled session rewrites no longer shows as drift; it stays until the person reads the "Yours, left as is" list. The threat model's R14 records it.
