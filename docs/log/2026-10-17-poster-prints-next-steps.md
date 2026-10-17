# The poster prints what to do next

**2026-10-17.** The one ticket of #294, built on #294 itself. On exit 1 and exit 3 the poster prints a `NEXT:` line above its `RESULT:` line, so a session in another project knows not to post again. Tier: standard.

## What was built (#294)

- **The poster.** `claude/tools/poster.mjs` builds each line in one place. Exit 3 (the failed post call, and a fault while sending) names the page and the checked login, and says what to do on found, not found and can't tell. Exit 1 (no usable id, failed or unusable read-back, mismatch, a fault after sending) says the post landed and must not be posted again, in the link, page or mismatch form. The header comment says so.
- **The tests.** The existing exit cases assert the second-last line; the fault table gains a row for a fault after sending before the id is read; two new cases cover exits 0, 2 and 4 printing none, and no gh or body text reaching a line, including gh text that itself starts with `NEXT:`. Runs use a machine user name that differs from the login. Each new check was seen to fail against a broken poster: line removed, moved below `RESULT:`, taking gh text, taking the machine user name, the wrong form.
- **The page.** `docs/poster.md` describes the line on the three rows, in the intro and under "After exit 3"; a doc test requires it.
- **The cloud copy.** `gen.mjs` was rerun; nothing under `cloud-sessions/` changed, `cloud-setup-wrapper.sh` included.

## Decisions

- [ADR 0082](../adr/0082-the-poster-prints-the-steps-after-a-result-that-may-be-public.md).

## Record

- [The issue](https://github.com/mephistopheles4/the-pact/issues/294)
- [The spec, revision 2](https://github.com/mephistopheles4/the-pact/issues/294#issuecomment-6239622092)
