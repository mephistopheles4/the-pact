# PROTOTYPE (#53): the installer renders a configuration file

Throwaway. It lives only on branch `prototype/53-config`, which is pushed to the private remote so the record survives the session. It is never merged to `main` and never installed. It answers design questions for the #53 spec; the plan it was built to is on #53.

## Run it

```
env -u NODE_OPTIONS node prototypes/53-config/run.proto.mjs     # POSIX
$env:NODE_OPTIONS = $null; node prototypes/53-config/run.proto.mjs   # PowerShell
```

It needs Node 20 or later, and it must run on this branch. It stages HEAD the way `scripts/install.ps1` does: `ls-tree` plus `cat-file`, with blob ids checked. It then runs the **staged, real** `gate/seam-a.mjs` on each rendered stage, and writes `out/results.md` plus one diff per benign scenario.

All scratch files go in one `os.tmpdir()` folder, which is removed at the end. It touches nothing in the home folder's Claude folder, opens no network connection, and moves no git ref.

## Why it's not a single HTML page

The prototype skill's logic branch is a single clickable HTML file. These questions need the real pact text and the real gate, and a browser page can't run the gate.

## Files

- **`render.proto.mjs`:** the pure part: read the configuration, layer the files, render, compare and decide. It has no file system calls. The gate's own helpers (`readStrictJson`, `scanText`, `safePath`, `shown`) are passed in. It still copies the gate's structure patterns and has its own mark reader; the real build would put those in one shared module too.
- **`run.proto.mjs`:** staging, safe block-file reading, the scenarios, the gate runs and the output.
- **`out/`:** the results of the last run.

## Shape tried

The configuration file looks like this:

```
{ "schema": 1,
  "settings": { "usagePause": 90 },
  "edits": [ { "mark": "move-4", "op": "add-after", "file": "blocks/extra.md" } ] }
```

- **Marks are of two kinds.**
  - **Gated marks** are today's seven, protected word for word by the gate.
  - **Open marks** are new. This prototype adds two, `usage-pause` and `move-2`, to a simulated future source.
- **Operations.** `replace`, `remove` and `add-after` each address a mark by name. One edit per mark per file.
- **Settings are templates, not edits.** A setting fills a fixed template inside an open mark with a checked whole number.
- **Rendering.** The renderer re-indents block text to its anchor. It strips open marks from the output, and keeps gated marks so the gate can check them.

## What it showed

See `out/results.md` for every scenario and every gate line.

1. **Values fit as templates in open marks, and the no-file install is byte-identical.** In S01, the rendered file equals HEAD's blob, and the gate's INSTALL hash equals the blob hash. The catch is that the source must carry open marks, and **today's gate refuses every open mark name**: four `unknown block name` failures on the future source. The gate needs a second kind of mark: a listed name, no canonical text, and stripped at render.
2. **Ordering: render, then gate, is the only one where a gate reads what gets installed.**
   - **Gate, then render.** The gate checks HEAD's bytes, and every non-default install then writes bytes no check read.
   - **Render, then gate.** The gate catches some things beyond protected edits. In S05, replacing move 2 drops `plan-reviewer`, and the gate's routing check refuses it. In C18, a heading injected inside move 4 fails its structure check, but only because the renderer indented it. C18b puts the same kind of text after the usage-pause block, and today's gate passes it.
   - **The cost.** In this ordering, today's gate refuses *every* protected-block edit (S06, S07, S11). So "warn, then install" cannot happen without changing the gate's clause check.
   - **Both orderings need `install.ps1` changed.**
     - In render-then-gate, the gate's INSTALL hash is the rendered file's, so the copy-set match against the staged blob hash (`install.ps1:484-490`) refuses every non-default install.
     - In gate-then-render, the pre-write re-hash (`:594-598`) or the post-write verify (`:628-631`) refuses.
     - The manifest and the drift check bind to the same hash.
     - `install.ps1` is gate code, so this is security-route work.
3. **Exact compare and the soft reviewer catch different things.**
   - **What exact compare catches.** It flags removals and rewordings of protected blocks, including a harmless rewording (S07, a false alarm).
   - **What it misses.** It is blind to text added right after a protected block that undoes it (S08). It also misses a contradiction far from any protected block (S09).
   - **The soft reviewer** is needed for S08 and S09, and would be quiet on S07. The prototype lists the exact rendered regions it would read. S09 shows it must read them against the whole pact, not only the neighbouring block.
4. **"The project file wins" needs a rule per slot, not per mark.**
   - **Per mark loses work silently.** In S10, a project add-after silently drops the user's replace of the same mark. Per slot (content, and what follows) keeps both.
   - **Precedence only covers what the project names.** A project file does not undo a user's removal of a block it doesn't name (S11).
   - **The other layering cases.** A home install reads no project file (S03b). A project replace beats a user setting on the same block (S12).
5. **Every must-refuse case is refused by the renderer, before either ordering.**
   - **Network paths.** UNC and device paths are refused on their text alone, before any file system call.
   - **Imports.** C17 is a planted control: an `@` import passes today's gate in ordering A. The renderer's import check is load-bearing.
     - The rule refuses any `@` followed by a non-space character, anywhere, code spans included. R17b (inside bold) and R17c (after an escaped backtick) are refused.
     - Claude Code's exact import grammar was not checked.
   - **Structure.** C18b shows that today's gate passes a heading and a numbered line added outside "Implementing a change". The renderer owns the structure check in **both** orderings; the gate is no backstop.
   - **Value forms.** These are open for the spec. R06d (`9e1`) and R06e (`90.0`) are both accepted as 90. That is harmless through a fixed template, but refusing them needs the raw token, which `readStrictJson` discards.
   - **The gate's helpers.** Reusing them needed a source rewrite of `seam-a.mjs`, which calls `main()` on import and exports nothing. The real build should move `readStrictJson`, `scanText`, `safePath` and `shown` into a module both can import.
6. **Protected-block policy, both ways.**
   - **Policy "refuse":** S06, S07 and S11 refuse.
   - **Policy "warn":** they would install with a session-start line and a manifest record of what was weakened. With today's gate in ordering A, they refuse anyway.
   - **What "warn" would take.** It needs the gate's gated-clause check changed. That check is in AGENTS.md's protected set, so the collision is the owner's to rule on, read by both `plan-reviewer` and `security-reviewer`.

**Side effects seen.** Editing `risk-floor` also desyncs `plan-reviewer`'s shared copy (S07, a `shared-block` failure). Text added after the move-4 block lands inside move 4 (S08's diff).

## Not covered

- **The graph-builder UI.**
- **A real soft reviewer,** which would be a model call.
- **Linux, and installs into a project folder.**
- **How the session-start line is delivered.** The prototype prints only the line it would show.
- **Whether CRLF block files should be accepted.** Today they refuse, through the gate's own character check.
