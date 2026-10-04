# Render check: the cross script's comment on GitHub (#44)

A recorded one-off for #44, the cross script. It is outside the default
`node --test` run. `cross/render-check.mjs` sends committed synthetic fixtures
to GitHub's `POST /markdown` (gfm mode, context `mephistopheles4/the-pact`).
That endpoint renders text and posts nothing.

## What it renders

- **`real`:** the cross script's whole comment for a security pair at the thorough tier. It holds hostile headlines, data names, not-checked items and non-risk notes, with the folded verbatim reports.
- **`real-exit1`:** the exit-1 output for the same pair. Its failing report holds an `<img>` in its prose and in its block, and a fake `<summary>`.
- **`none` and `none-exit1`:** the failing control. These are the same strings placed with no protection.

Each card (`<li>`) and table cell (`<td>`) is read on its own. The raw renders are kept beside this file in `2026-10-04-cross-render-check/`, as `.txt`.

## Expected result (written before the run)

- **`real` and `real-exit1`:** no card or cell renders a mention, issue link, maths, emoji, image, link or decoded entity. Nothing outside a code block renders an image, and no report's fake `<summary>` renders.
- **The control:** across `none` and `none-exit1`, it shows each kind: mention, issue link, maths, emoji, image, link and decoded entity. It also shows an image and the fake summary from the raw failing report.
- **Known limit, found before the run:** a team mention (`@org/team`) renders as plain text even in the control. It does so with this repo as context, with `github/docs`, and with `nodejs/node`, so no control can show it through this endpoint. The team-mention case is therefore not seen to fail. The real output still holds it inside a code span, as it holds the user mention, which the control does render.

## Result

_Filled in after the run._
