# The builder-file check reads decoded text

**2026-10-24.** The Test review of #283 (adversarial-lens, F5) found that the builder file's character scan read raw bytes, so a JSON escape for an invisible or direction-changing character passed it and decoded into the page. Tier: quick, set by the owner, with the security pair at Test since it is input validation.

## What was built (#327)

- **The check:** `loadBuilder` in `builder/build.mjs` walks every decoded key and string after the parse and refuses the file if one holds a character the scanner refuses (ADR 0106).
- **The page:** `presetFromText` in `builder/scriptorium.html` runs the same walk on a file opened on the page, before any of its text is shown, and refuses it with fixed text. The owner widened the change to this path after the Test review (adversarial-lens F2). An opened file's name that holds such a character, or a line break, is shown as fixed text, in the fallback title and the refusal (adversarial-lens, round 2).
- **The test:** a new test in `gate/tests/builder-page.test.mjs` loads a clean file, and one whose agent file holds an escaped tab and line feed, which still load; then six bad ones: an escaped right-to-left override, carriage return, tag character and lone surrogate in the title, an escaped zero-width space in a key, and an escaped bell in a nested string. Each gets the one fixed refusal, which quotes nothing from the file. A second test does the same for the page's reader, and a third for an opened file's name. A line feed must pass, since part texts run to several lines; the shipped presets hold many.
- **Rebuilt:** `builder/scriptorium.html`. **Unaffected:** `builder/default-config/` and `cloud-sessions/`.

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/327).
