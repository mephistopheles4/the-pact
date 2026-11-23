# The pact's diagram format

How a review diagram is written and coloured; read it beside review.md's Diagrams section.

- **The block.** Each diagram sits under its sentence. On GitHub, write it
  exactly as `<div align="center">`, a blank line, the `mermaid` fence, a blank
  line and `</div>`. On Linear, write the `mermaid` fence alone, with no HTML
  around it: Linear draws the fence, and shows HTML tags as text. A post you
  hand to another session, as a cloud session hands its posts to its starter,
  takes the form of the place it will land.
- **Pins,** on flowcharts only, carry one colour meaning: an `open` finding takes
  its severity's colour, `high` `#cf222e33`, `medium` `#bc4c0033`, `low`
  `#d4a72c33`; a fixed one `#2da44e33`; every other row gets no pin. The border
  is the same colour without its last two digits, `stroke-width:2px`, `3px` for a
  security finding. Boundary boxes have a transparent fill and a grey dashed border, `#8c959f`. Never set
  `color:`.
- **A place that can't draw diagrams** gets the title line, signal table and count line as plain text,
  with no diagram. GitHub and Linear both draw them.
