# Scriptorium moves onto the aviation design system's bundle

#427, standard tier, built by pact-427.

`builder/scriptorium.html` now carries `dist/aviation.bundle.css` and `dist/aviation.behaviours.js` from `mephistopheles4/aviation-design-system` at `30685cc`, inline and byte for byte, in place of its hand-copied tokens and classes. The page's local tooltip, scheme toggle, tour, reset with undo, disclosure, dialogs, combobox, form fields, splitter, tabs and action chips are the design system's. The switch, the toast and the tag input stay local.

The pin is held in reviewed code: `AVIATION_PIN` in `builder/build.mjs` holds the commit, the sha256 of each dist file, the pre-paint snippet and a URL allow-list per block. No file is added, so the builder kit's lists and the installer are untouched. `buildPage` refuses a page whose marks, hashes or pre-paint text differ from the pin, on every rebuild.

Two page checks loosen, so this is a spec change, read by the spec pair and the security pair and approved on the issue:
- `scripts` is exactly three plain scripts (pre-paint, behaviours, the page's own), and `script-hash` checks that the policy lists exactly their three hashes.
- `external-url` and the CSS `url(` check allow, inside each pinned block, only the matches `AVIATION_PIN.urls` lists, in those counts. Outside the blocks nothing changes, and the other text checks scan the whole page.

A re-pin changes every constant and is reviewed like any change to this repo, at its own tier. `docs/threat-model.md` gains one scope line and one accepted class, "Pinned design-system code", which treats the design system as the owner's own code: the inlined code runs with the page's powers, including a folder the user grants, and review of each pin is its control.

The looks the owner kept stand in one local block of five entries after the bundle, headed with `aviation-design-system#22`, and go at the re-pin. One more page rule, the spacing of `details.av-disclosure > .av-disclosure-body`, stands outside the block and is carried to the same issue at the re-pin. The saved scheme key moves from `pact-config-scheme` to `aviation-scheme`, and the saved panel sizes move to the design system's keys, so each user's saved dark scheme and sizes reset once. The old keys stay in storage, so a revert brings them back.

One behaviour changed: taking a preset still offers Undo on the Reset chip, but for the design system's ten seconds, where it used to stay until the next change. The page presses the chip twice and enters it, so the design system's own reset rules offer the Undo.

**Rolling back:** revert the PR.

## Record

- The ask: https://github.com/mephistopheles4/the-pact/issues/427
- Spec revision 3, final: https://github.com/mephistopheles4/the-pact/issues/427#issuecomment-6715106983
- Spec round 2: https://github.com/mephistopheles4/the-pact/issues/427#issuecomment-6715058003
- Build brief: https://github.com/mephistopheles4/the-pact/issues/427#issuecomment-6715110097
