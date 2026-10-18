# Scriptorium's canvas takes the réseau

**2026-10-18.** The aviation design system replaced its graph-paper ground with réseau crosses ([aviation-design-system#10](https://github.com/mephistopheles4/aviation-design-system/pull/10)). The owner asked for Scriptorium to follow. Tier: quick.

## What was built

- **The workflow canvas** in `builder/scriptorium.html` drops the two-tier lines (24 px at ink 3.5%, 120 px at 8.5%) for one 13 px cross at the middle of each 120 px division, in `--av-ink-30`, the same cross, pitch and ink as the design system's `.av-grid`.
- **The crosses are drawn by `draw()`** on the canvas element that already draws the links, under them, and pan and zoom with the world. The design system stages its cross as an SVG data URL, but Scriptorium's CSP has `img-src 'none'`, which refuses it; drawing keeps the CSP as it was.
- **The unused `--av-grid-minor` and `--av-grid-major` tokens** are gone from both themes, and the canvas no longer sets its background size and position each frame.
- **Not here:** the README figures in `docs/img` still draw a 24 px line grid.

## Record

- The owner's request and go-ahead were in chat on 2026-10-18; no issue was filed. The PR that carries this entry is the record.
