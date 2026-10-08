# Every pact lens is configurable, with opinionated defaults

A user configuration's `agents` key may set the `model` and `effort` of every lens the pact ships. Each lens's own file holds its default. `scout` is the one exception: it is a sealed familiar, so it stays locked.

- **Values:** models `opus` or `sonnet`; efforts `low`, `medium` or `high`. `xhigh` is never a starting setting.
- **How it renders:** the renderer rewrites only the agent file's model and effort lines. It refuses if the result would differ from the file anywhere else, so no setting adds a tool. The install checks the same again before it installs the file.
- **Security-set lenses are computed, not listed.** The renderer reads the signs on every run. A lens is security-set when any of these holds:
  - its tools line holds more than the read tools;
  - the tool allow-list has an entry for it;
  - the security-route clause names it;
  - its own file carries a risk-floor block;
  - it is on a short doubt list, where each entry has a reason (`good-enough-lens` and `unstated-lens`).

  Today six lenses are security-set. Only `integrity-lens` is plain.
- **An override is marked.** A security-set lens set off its default carries "override, not security-tested" in four places: the dry-run warning, the installed notice, every report posted from it, and its Lens dispositions row. The dispositions table records effort beside model. The cross script's "not verified" mark keeps its own meaning.
- **The shell and web lenses warn in plain words.** `behaviour-lens` and `adversarial-lens` hold a shell or web tools. The warning for an override says that, on a weaker setting, the lens may follow instructions planted in the code it reviews, or send a secret out. The owner chose this warning over an Opus floor.

## Why

- **The owner's ask.** On #97 the owner said: "i think i wouldnt lock any, just provide a default", then "unlock all, we said we will let people configure with opinionated defaults".
- **The protected set binds the defaults.** The protected set keeps "the security set's contents, and its rerun after a model change". The owner confirmed reading this as binding the pact's shipped defaults. A change to a shipped file's model still reruns that lens's security set. A person's override never ran there, so it is marked rather than refused.
- **Fail closed without a hand-kept list.** ADR 0025 refused any lens showing a security sign. With the refusal gone, the same signs now classify instead. A lens that later gains a sign is marked without anyone editing a list.
- **`scout` stays locked.** Its seal is a digest over its own file, so a changed model line would break it. It already runs at the cheapest setting.

## How this was decided

- **2026-10-08** — Decided in mephistopheles4/the-pact#97.
  - The spec change (comment 6051819812) was read by the spec pair, `unstated-lens` and the security pair. Their reports are in comments 6051880927, 6051881177 and 6051881381.
  - Revision 1 (comment 6051960947) folds their findings in. The owner approved it with "looks good".
  - The Lens dispositions are in comment 6051960683.

Supersedes [ADR 0025](0025-a-configuration-sets-only-non-security-lenses.md).
