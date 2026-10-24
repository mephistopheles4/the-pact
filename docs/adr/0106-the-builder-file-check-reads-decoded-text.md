# The builder-file check reads decoded text

`loadBuilder` in `builder/build.mjs`, and `presetFromText` in `builder/scriptorium.html` for a file opened on the page, now run the scanner's character test over every key and string the JSON decodes to, after the parse, and refuses a file that holds an invisible, direction-changing or control character there (#327). The raw-byte scan stays first.

## Why

- **An escape hid the character.** The scan read the raw bytes, where a JSON escape such as `\u202e` is six plain characters; it decoded into a title, a part field or an agent file and could make a chip or a checklist row read differently from what the file holds (Test of #283, adversarial-lens F5).
- **A second untrusted source.** #283 sends a person's own presets folder, which may hold a file someone handed them, down the same path.

## How

- **One test, the scanner's own.** It uses `isRefused` and `isInvisible` from `gate/shared.mjs`, so a decoded string meets the same bar as a raw line; a tab and a line feed still pass, as they do in the raw scan, since a part's text runs to several lines; the field checks still refuse a line break where one line is due.
- **A lone surrogate too.** A JSON escape can decode to half of a surrogate pair, which the raw scan refuses as invalid UTF-8 when written out; the walk refuses one as well (Test, behaviour-lens F2).
- **Every builder file, on both paths.** Shipped presets, the example builder file and a person's own presets folder go through `loadBuilder`; a file opened on the page goes through the page's `presetFromText`, which runs the same walk with its own copy of the character test before any of the file's text is shown, a key it would name in a refusal included (Test, adversarial-lens F2; the owner widened the change to cover it).
- **The opened file's name too.** The page shows that name as a fallback title and at the head of a refusal, so a name with a line break or a character the walk refuses is shown as fixed text instead (Test, adversarial-lens round 2 F1; the owner's word).
- **The refusal names no text** from the file, as the other refusals don't.

## Limits

- It is still your look, not an install-time control (threat model R30, R32).
