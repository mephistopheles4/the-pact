# Brand marks

Two marks, one for the pact and one for its builder. They are drawn as members
of the grimoire family: one 24-unit SVG box, ink ground, paper linework, and the
Aviation deck's amber spent once, on the thing that asks to be looked at.

| Mark | Subject | Files |
| --- | --- | --- |
| pact | this repository | [`pact/`](pact) |
| scriptorium | the builder page and `/scriptorium` | [`scriptorium/`](scriptorium) |

<p>
  <img src="pact/pact-mark.svg" width="96" alt="pact mark">
  <img src="scriptorium/scriptorium-mark.svg" width="96" alt="scriptorium mark">
</p>

## The marks

**pact.** A pen nib drawn flat, like a part on a sheet: shoulders, collar and
slit, with a hairline down the centre of the collar. The rules are written by
hand, by the person who keeps them. The amber breather hole is where the ink
comes from. The hairline is dropped in the small variants.

**scriptorium.** A ruled sheet with crop marks at its corners: the builder's
canvas. On it, one connector joins two stages, snapped to the ruling, and the
amber stage is the one just placed. The ruling is dropped in the small variants,
where the stages grow to stay legible.

## Which file to use

Each directory holds three sizes of the same drawing, all on an ink ground. A
knockout disappears against dark browser chrome, so no mark has a paper-ground
variant.

| File | Use it at |
| --- | --- |
| `<name>-mark.svg` | 40px and up. The hairlines stop resolving below that. |
| `<name>-mark-solid.svg` | 32px and below. Hairlines dropped, ground bled to the edge. |
| `favicon.svg` | 16px, the browser tab. Heaviest strokes, fewest parts. |

The files hold no script, external reference, image or font, so any of them
can be inlined in a page. Colours are the Aviation deck tokens: ink `#22262B`,
paper `#FAFAF7`, amber `#B45309`.
