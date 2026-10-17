# The poster prints the steps after a result that may be public

On exit 1 and exit 3 the poster prints one fixed `NEXT:` line, straight above its `RESULT:` line, saying what a session does next (#294). The rules file's poster part is not touched.

## Why

- **A session elsewhere sees only the rules file.** The reference page `docs/poster.md` is not installed, so a session in another project could retry after exit 3 and post a duplicate under the owner's account. The tool's own output is the one place that session is sure to read.
- **The rules file stays short.** Option B, a clause in the rules text, would be rule text the owner must read again, and it would repeat what the tool already knows (the page and the login).

## What the line holds

- Fixed words, the page the poster knew before it sent, and the login it checked before it sent. Never text from gh's answers or error line, the body, a title or a label. The login is held outside the `try` and set only after every owner check, so the catch can't print an unchecked value.
- Exit 3 says to look at the page for a post by the login, to tell the owner its link and never post it again if it is there, to tell the owner and post again only on their word if it isn't, and, if the session can't tell, to tell the owner and not post.
- Exit 1 says the post landed and must not be posted again. Its form says what the address below it is: the post's link, the page only (the id was never read), or, on a mismatch, the link and the fields named above.

## What stays

- The `RESULT:` line is last and unchanged, so nothing that reads it breaks. Exits 0, 2 and 4 print no `NEXT:` line. The poster still never retries.
- `gate/tests/poster-doc.test.mjs` still compares the header's `RESULT` lines with the page's exit table.

## What was weighed

- **The page on the `RESULT: failed` line.** Not taken: it changes a result line other tools and the doc test read. A separate line is removed without touching them.
- **A lookup command per surface in the output.** Not taken: it repeats the page's commands in the code and grows the output; the "can't tell" branch covers a session that can't look.
