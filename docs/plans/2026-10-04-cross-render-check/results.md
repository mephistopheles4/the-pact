# Render check results

Real output: PASS, no card, cell or report rendered anything live.

Control: showed every kind.

A team mention (@org/team) renders as plain text in the control as well; see the record.

| Variant | Piece | Case | What it became |
| --- | --- | --- | --- |
| none | li | H1 | mention, decoded entity |
| none | li | H3 | issue link |
| none | li | H4 | maths |
| none | li | H5 | emoji |
| none | li | H6 | link |
| none | li | H7 | image, link |
| none | li | H8 | image, link |
| none | li | H9 | decoded entity |
| none | td | H1 | mention, decoded entity |
| none | td | H3 | issue link |
| none | td | H4 | maths |
| none | td | H5 | emoji |
| none | td | H6 | link |
| none | td | H7 | image, link |
| none | td | H8 | image, link |
| none | td | H9 | decoded entity |
| none | td | N1 | emoji, image, link |
| none | td | N2 | mention |
| none | td | N3 | emoji |
| none | td | N4 | image, link |
| none | li | H13 | mention, maths, emoji, link, decoded entity |
| none | li | H1 | mention, decoded entity |
| none | li | H3 | issue link |
| none | li | H4 | maths |
| none | td | D1 | mention, emoji, decoded entity |
| none | td | H1 | mention, decoded entity |
| none | td | D2 | image, link |
| none | td | D1 | mention, emoji, decoded entity |
| none | td | H3 | issue link |
| none | td | D2 | image, link |
| none | td | H4 | maths |
| none | td | N1 | emoji, image, link |
| none | li | H13 | mention, maths, emoji, link, decoded entity |
| none | whole comment | - | an image outside a code block |
| none-exit1 | whole comment | - | an image outside a code block, a report's fake summary rendered |
