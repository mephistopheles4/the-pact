# 2026-11-25: Scriptorium shows the harnesses (PACT-105 T7)

Scriptorium gains its harness half (spec 0007 S11,
[ADR 0174](../adr/0174-the-scriptorium-page-shows-the-harnesses-and-lives-in-the-pact-folder.md)):
a Harnesses dialog, a view of what each harness receives, and the bootstrap's
builder choice.

- **The gate changes.** Both builder-kit lists gain `gate/install-core.mjs`,
  `gate/harnesses.mjs`, `gate/harness-render.mjs` and
  `harnesses/known.json`. No check is loosened; the kit's list is a bound, so
  spec trade-off 51 records it for the owner.
- **A save dropped `harnesses`.** The page kept `commands` and `tools` from an
  existing `config.json` but not the new key. It keeps it now.
- **A save then wrote the page's whole list.** It now applies single changes
  over the folder's: a harness in or out, one model, one added or removed. With
  no install list there, a changed tick still writes a whole one, and a page
  that read no machine says so.
- **A row measured narrow.** The dialog's sheet is a wrapping column, so a grid
  inside a row was sized as one column; each row now takes the full width.
- **Two doc budgets rise** (`docs/install.md` to 9,550, `docs/reference.md`
  to 2,450) rather than cut needed text; PACT-110 cleans up.
- **A redraw dropped focus.** Choosing a chip or removing a harness left focus
  outside the dialog; it now stays on the control, or moves to the next one.
- **The T6 branch is merged in,** for `bin/pact.mjs`.

**Record:** PACT-105's comments signed `build-pact-105-t7`; Test round 1 is
comment `bd51ead1`, the final round 2 is comment `6504f177`.
