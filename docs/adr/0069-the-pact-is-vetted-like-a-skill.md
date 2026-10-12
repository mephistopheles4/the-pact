# The pact is vetted like a skill

The install gate checks install mechanics only. What the pact's files say, and which tools each agent holds, is vetted the way any skill from GitHub is: the harness warns about what you install, you read the commit, and the model's judgment carries the rest. The gate stops defending against crafted input and malicious models (#262 phase 2, the owner's decision in chat, recorded on the issue).

## What changed

- **What stays.** The dry run, then `--apply` bound to the commit and the rendered hash; the drift check against the last manifest; the re-hash after install; deleting only pact files; writing only inside the Claude home folder or the project's rules folder, with no link followed; the settings merge and its overlay guard. Seam A still sorts each staged file into a kind and a live path, refuses a duplicate name or destination, reads each agent's frontmatter so the file still parses with a name that matches its stem, and runs the text scanner on every installed text file.
- **What goes.**
  - the per-lens tool allow-list (`gate/tool-allowlist.json`) and seam A's key and tools checks on agents;
  - the pinned-block and offers-paragraph word checks (`gate/pact-text.mjs`, `gate/clauses/`) and the rules file's marker grammar and import check;
  - the pinned grimoire check script and its pin, which sealed familiars; none is left since `scout` moved (ADR 0067);
  - the block-text rules on configuration edits: comment openers, `@` imports, headings, fences, numbered lines, blank lines, leading space. A block must still be LF-only text that ends in one line feed;
  - the command file checks on shell lines, arguments, includes and keys, and the review file's hidden-text and size checks;
  - the model value's shape: a model is now one word, with no space or line break, at most 128 characters. A value YAML can't read as text is refused when seam A reads the rendered agent file;
  - the project qualities field rules: a row is now a quality, a measure and a list of lenses, each one line of text;
  - the builder page's stub tests on labels and layout, folded into one smoke test.
- **The fixed block.** `stop-and-escalate` keeps its marker lines, so no configuration edit can target it and the builder shows it as a locked clause. The gate no longer holds its words. The `install-go-ahead` markers in `AGENTS.md` are gone; the rule stays.
- **Records.** `AGENTS.md`'s protected set drops the pinned blocks, the offers paragraph's gate check and the tool allow-list; the three left hold by review. The threat model's R12, R17 and R22 say what now stands.

## Why

- **The checks cost more than they bought.** Each content rule needed its own bad cases, its builder mirror and its docs, and every change to the pact's text ran into them. They defended against a crafted configuration and a model that ignores its rules, neither of which a word check stops: a gate can hold text, not make a model obey it.
- **The pact is a skill.** Like any skill, it is text and agent files a person installs into their own Claude home. The harness's own checks, and the owner's reading of the commit, are what any skill gets.

## What was weighed

- **Keep the tool allow-list as the one content check.** Rejected by the owner: a lens's tools are in its committed file, in the diff the owner vets.
- **Keep the text scanner.** Kept: it is cheap, shared with the configuration reader, and keeps what a reader sees equal to what the model reads.

Supersedes in part [ADR 0067](0067-every-agent-can-be-set-on-any-claude-code-model.md) (the model shape) and the gate's pinned blocks and tool allow-list wherever earlier ADRs set them.
