# The pact's diagram format

How a review diagram is written and coloured; read it beside review.md's Diagrams section.

- **The block.** Each diagram sits under its sentence, written exactly as
  `<div align="center">`, a blank line, the `mermaid` fence, a blank line and
  `</div>`.
- **Pins,** on flowcharts only, carry one colour meaning: an `open` finding takes
  its severity's colour, `high` `#cf222e33`, `medium` `#bc4c0033`, `low`
  `#d4a72c33`; a fixed one `#2da44e33`; every other row gets no pin. The border
  is the same colour without its last two digits, `stroke-width:2px`, `3px` for a
  security finding. Boundary boxes have a transparent fill and a grey dashed border, `#8c959f`. Never set
  `color:`.
- **A place that can't draw diagrams** gets the title line, signal table and count line as plain text,
  with no diagram.
