# #53 prototype: results

Staged from HEAD of `prototype/53-config`. Node v24.14.1. PROTOTYPE, throwaway.

## Once-only facts

- **Today's gate on HEAD's pact:** RESULT: pass. CLAUDE.md INSTALL hash b2f8a0558070; HEAD blob sha256 b2f8a0558070.
- **Today's gate on the future source (HEAD plus the two open marks):** RESULT: fail.
  - `FAIL marker: claude/CLAUDE.md line 208: an unknown block name`
  - `FAIL marker: claude/CLAUDE.md line 220: an unknown block name`
  - `FAIL marker: claude/CLAUDE.md line 420: an unknown block name`
  - `FAIL marker: claude/CLAUDE.md line 426: an unknown block name`
- **Ordering B, gate then render:** the gate checks HEAD's bytes (RESULT: pass), then the renderer writes different bytes. Every row below whose rendered text differs from HEAD installs bytes no gate read. install.ps1's pre-write re-hash (`install.ps1:594-598`) refuses a stage rewritten after the check; rendering elsewhere instead fails its post-write verify (`:628-631`).
- **Ordering A, render then gate:** the gate's INSTALL hash is the rendered file's, so install.ps1's copy-set match against the staged blob hash (`install.ps1:484-490`) refuses every row below whose rendered text differs from HEAD. **Both orderings need install.ps1 changed** (gate code: security route).
- **Policy columns** show the policy's own verdict; "today's gate refuses (A)" marks rows that today's gate fails in ordering A whatever the policy.

## Results

| Scenario | Renderer | Exact compare (protected blocks) | Soft reviewer (stand-in) | Ordering A: render, then today's gate | Ordering B: rendered = checked? | Policy "refuse" | Policy "warn" |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 No file | ok | nothing changed | — | pass | yes | INSTALL | INSTALL |
| S02 User file sets the usage pause to 90% | ok | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| S03a User 90%, project 80%, installing into the project | ok | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| S03b User 90%, project 80%, installing into the home folder | ok | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| S04 Project adds a reviewer step after the move-4 block | ok | move-4: same, text added after | quiet: the added step adds a check and contradicts nothing | pass | **no** | INSTALL | INSTALL |
| S05 User replaces move 2 with their own spec habit | ok | nothing changed | may flag: the thorough tier loses its plan review; no protected block says so | **fail**: routing | **no** | INSTALL; today's gate refuses (A) | INSTALL; today's gate refuses (A) |
| S06 User removes the security route | ok | security-route: removed | flags: the risk floor still names the security route, which no longer exists | **fail**: required-clause | **no** | REFUSE: security-route removed; today's gate refuses (A) | WARN, then INSTALL: security-route removed; today's gate refuses (A) |
| S07 User rewords the risk floor, same meaning | ok | risk-floor: changed | quiet: same meaning | **fail**: required-clause, shared-block | **no** | REFUSE: risk-floor changed; today's gate refuses (A) | WARN, then INSTALL: risk-floor changed; today's gate refuses (A) |
| S08 Project adds a contradiction right after the move-4 block | ok | move-4: same, text added after | flags: contradicts move-4 (QA pair at every tier) and the owner closing tickets | pass | **no** | INSTALL | INSTALL |
| S09 User adds a contradiction far from any protected block | ok | nothing changed | flags: contradicts never-substitute and the security route | pass | **no** | INSTALL | INSTALL |
| S10 (per-mark) User replaces move 2, project adds after move 2 | ok | nothing changed | quiet | pass | **no** | INSTALL | INSTALL |
| S10 (per-slot) User replaces move 2, project adds after move 2 | ok | nothing changed | quiet | pass | **no** | INSTALL | INSTALL |
| S11 User removes the security route; project only sets the pause line | ok | security-route: removed | flags, as S06 | **fail**: required-clause | **no** | REFUSE: security-route removed; today's gate refuses (A) | WARN, then INSTALL: security-route removed; today's gate refuses (A) |
| R01 Malformed JSON | **refused** by renderer: read | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R02 A key given twice, differing only in case | **refused** by renderer: duplicate | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R03 Unknown schema version | **refused** by renderer: schema | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R04 Unknown mark name that tries to forge markup | **refused** by renderer: mark | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R05 Prototype-pollution keys | **refused** by renderer: setting, key | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R06a Pause line as text | **refused** by renderer: type | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R06b Pause line as a fraction | **refused** by renderer: type | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R06c Pause line out of range | **refused** by renderer: range | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R06d Pause line as an exponent (parses to 90) | ok | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| R07 A mark in AGENTS.md, never installed | **refused** by renderer: mark | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R08 The same mark edited twice in one file | **refused** by renderer: twice | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R09 Too many edits | **refused** by renderer: count | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R10 Oversized configuration file | **refused** by renderer: size | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| S12 User sets the pause line; project replaces the same block | ok | nothing changed | quiet | pass | **no** | INSTALL | INSTALL |
| R11 A setting and an edit set the same block in one file | **refused** by renderer: conflict | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12a Block path: drive-absolute | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12b Block path: root-absolute | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12c Block path: parent folder | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12d Block path: network share, slashes | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12e Block path: network share, backslashes | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12f Block path: drive-relative | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12g Block path: alternate data stream | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12h Block path: reserved device name | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12i Block path: trailing dot | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12j Block path: backslash separator | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12k Block path: trailing space | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R12l Block path: device path | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R13a Block file is a symbolic link | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R13b Block folder is a junction | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R13c Block file is a hard link | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R13d Block path is a folder | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R14 Oversized block file | **refused** by renderer (path): path | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R15a Block file with a byte-order mark | **refused** by renderer (gate scanText): characters | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R15b Block file with Windows line endings | **refused** by renderer (gate scanText): characters | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R15c Block file with a hidden character | **refused** by renderer (gate scanText): characters | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R15d Block file that is not UTF-8 | **refused** by renderer (gate scanText): characters | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R16a Block text forges a mark | **refused** by renderer: comment | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R16b Block text opens a comment it never closes | **refused** by renderer: comment | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R17 Block text holds an @ import | **refused** by renderer: import | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R18 Block text reshapes the file | **refused** by renderer: structure, structure, structure, structure | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| C17 Control: R17 with the renderer text checks off | ok (checks OFF) | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| R17b Block text holds an @ import inside bold | **refused** by renderer: import | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R17c Block text holds an @ import after an escaped backtick | **refused** by renderer: import | not reached | not reached | not reached (renderer refuses first in both orderings) | not reached | REFUSE | REFUSE |
| R06e Pause line written as 90.0 (parses to 90) | ok | nothing changed | — | pass | **no** | INSTALL | INSTALL |
| C18 Control: heading and move line added inside move 4, renderer text checks off | ok (checks OFF) | move-4: same, text added after | — | **fail**: structure | **no** | INSTALL; today's gate refuses (A) | INSTALL; today's gate refuses (A) |
| C18b Control: heading and numbered line added after the usage-pause block, renderer text checks off | ok (checks OFF) | nothing changed | — | pass | **no** | INSTALL | INSTALL |

## Per scenario

### S01: No file

Question: Q1: the rendered pact is byte-identical to today.

- Settings in effect: none
- Regions the soft reviewer would read: none
- Rendered sha256 b2f8a0558070; byte-identical to HEAD: yes
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash b2f8a0558070 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":null,"projectConfig":null,"rendered":"b2f8a0558070","weakened":[]}

### S02: User file sets the usage pause to 90%

Question: Q1: a value fills a fixed template inside an open mark.

- Settings in effect: usagePause=90 (user)
- Regions the soft reviewer would read: user setting usagePause usage-pause, rendered lines 418-422
- Rendered sha256 68e00fc42130; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 68e00fc42130 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"7d07b09988b0","projectConfig":null,"rendered":"68e00fc42130","weakened":[]}
- Diff against HEAD: `out/S02.diff.txt`

### S03a: User 90%, project 80%, installing into the project

Question: Q4: the project file wins in its repo.

- Settings in effect: usagePause=80 (project)
- Regions the soft reviewer would read: project setting usagePause usage-pause, rendered lines 418-422
- Rendered sha256 96f1574aa1c3; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 96f1574aa1c3 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"7d07b09988b0","projectConfig":"86b972e707a5","rendered":"96f1574aa1c3","weakened":[]}
- Diff against HEAD: `out/S03a.diff.txt`

### S03b: User 90%, project 80%, installing into the home folder

Question: Q4: a home install reads no project file.

- Settings in effect: usagePause=90 (user)
- Regions the soft reviewer would read: user setting usagePause usage-pause, rendered lines 418-422
- Rendered sha256 68e00fc42130; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 68e00fc42130 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"7d07b09988b0","projectConfig":null,"rendered":"68e00fc42130","weakened":[]}
- Diff against HEAD: `out/S03b.diff.txt`

### S04: Project adds a reviewer step after the move-4 block

Question: Q3: an add-after next to a protected block that agrees with it.

- Settings in effect: none
- Regions the soft reviewer would read: project add-after move-4, rendered lines 248-248
- Soft reviewer: not built. Scenario author's expectation: quiet: the added step adds a check and contradicts nothing
- Rendered sha256 556759f722d9; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 556759f722d9 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":null,"projectConfig":"c1c8cc9bd5aa","rendered":"556759f722d9","weakened":[]}
- Diff against HEAD: `out/S04.diff.txt`

### S05: User replaces move 2 with their own spec habit

Question: Q2/Q3: an open block edit that drops an agent the gate routes.

- Settings in effect: none
- Regions the soft reviewer would read: user replace move-2, rendered lines 208-208
- Soft reviewer: not built. Scenario author's expectation: may flag: the thorough tier loses its plan review; no protected block says so
- Rendered sha256 2ce64e7123bb; byte-identical to HEAD: no
- Ordering A gate: RESULT: fail; staged gate/ unchanged by rendering: yes
  - `FAIL routing: claude/agents/plan-reviewer.md: not named in moves 1 to 4 or a listed role line`
- Install manifest would record: {"policy":"warn","userConfig":"eadbfc5d173f","projectConfig":null,"rendered":"2ce64e7123bb","weakened":[]}
- Diff against HEAD: `out/S05.diff.txt`

### S06: User removes the security route

Question: Q6: a protected block removed, under both policies.

- Settings in effect: none
- Regions the soft reviewer would read: user remove security-route, rendered lines 225-225
- Soft reviewer: not built. Scenario author's expectation: flags: the risk floor still names the security route, which no longer exists
- Rendered sha256 07b6a8d9013c; byte-identical to HEAD: no
- Ordering A gate: RESULT: fail; staged gate/ unchanged by rendering: yes
  - `FAIL required-clause: claude/CLAUDE.md: security-route is missing`
- Install manifest would record: {"policy":"warn","userConfig":"00e0b12473c0","projectConfig":null,"rendered":"07b6a8d9013c","weakened":["security-route removed"]}
- Session-start line under "warn": "This pact is weakened by a configuration file: security-route removed."

### S07: User rewords the risk floor, same meaning

Question: Q3: exact compare flags a harmless rewording.

- Settings in effect: none
- Regions the soft reviewer would read: user replace risk-floor, rendered lines 78-78
- Soft reviewer: not built. Scenario author's expectation: quiet: same meaning
- Rendered sha256 01c6c69d29af; byte-identical to HEAD: no
- Ordering A gate: RESULT: fail; staged gate/ unchanged by rendering: yes
  - `FAIL required-clause: claude/CLAUDE.md: risk-floor differs from its canonical text`
  - `FAIL shared-block: claude/agents/plan-reviewer.md line 18: the shared risk-floor block differs from the pact's`
- Install manifest would record: {"policy":"warn","userConfig":"8a91bc696c80","projectConfig":null,"rendered":"01c6c69d29af","weakened":["risk-floor changed"]}
- Session-start line under "warn": "This pact is weakened by a configuration file: risk-floor changed."
- Diff against HEAD: `out/S07.diff.txt`

### S08: Project adds a contradiction right after the move-4 block

Question: Q3: exact compare is blind to an add-after that undoes a protected block.

- Settings in effect: none
- Regions the soft reviewer would read: project add-after move-4, rendered lines 248-248
- Soft reviewer: not built. Scenario author's expectation: flags: contradicts move-4 (QA pair at every tier) and the owner closing tickets
- Rendered sha256 a06d2fb9afec; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash a06d2fb9afec = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":null,"projectConfig":"1e9c67619ac8","rendered":"a06d2fb9afec","weakened":[]}
- Diff against HEAD: `out/S08.diff.txt`

### S09: User adds a contradiction far from any protected block

Question: Q3: placement does not protect; the model reads the whole file.

- Settings in effect: none
- Regions the soft reviewer would read: user add-after usage-pause, rendered lines 423-423
- Soft reviewer: not built. Scenario author's expectation: flags: contradicts never-substitute and the security route
- Rendered sha256 78582ac12c50; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 78582ac12c50 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"71dc54c85eb2","projectConfig":null,"rendered":"78582ac12c50","weakened":[]}
- Diff against HEAD: `out/S09.diff.txt`

### S10: User replaces move 2, project adds after move 2

Question: Q4: "project wins" per mark against per slot.

- **Layering rule per-mark:** edits in effect: project add-after move-2
- Settings in effect: none
- Regions the soft reviewer would read: project add-after move-2, rendered lines 219-219
- Soft reviewer: not built. Scenario author's expectation: quiet
- Rendered sha256 491df0c25e3c; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 491df0c25e3c = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"eadbfc5d173f","projectConfig":"8e7046b3ade3","rendered":"491df0c25e3c","weakened":[]}
- Diff against HEAD: `out/S10-per-mark.diff.txt`
- **Layering rule per-slot:** edits in effect: user replace move-2; project add-after move-2
- Settings in effect: none
- Regions the soft reviewer would read: user replace move-2, rendered lines 208-208; project add-after move-2, rendered lines 209-209
- Soft reviewer: not built. Scenario author's expectation: quiet
- Rendered sha256 744042e20a11; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 744042e20a11 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"eadbfc5d173f","projectConfig":"8e7046b3ade3","rendered":"744042e20a11","weakened":[]}
- Diff against HEAD: `out/S10-per-slot.diff.txt`

### S11: User removes the security route; project only sets the pause line

Question: Q4/Q6: a project file does not undo a user weakening it does not name.

- Settings in effect: usagePause=80 (project)
- Regions the soft reviewer would read: user remove security-route, rendered lines 225-225; project setting usagePause usage-pause, rendered lines 412-416
- Soft reviewer: not built. Scenario author's expectation: flags, as S06
- Rendered sha256 d1ae246529c5; byte-identical to HEAD: no
- Ordering A gate: RESULT: fail; staged gate/ unchanged by rendering: yes
  - `FAIL required-clause: claude/CLAUDE.md: security-route is missing`
- Install manifest would record: {"policy":"warn","userConfig":"00e0b12473c0","projectConfig":"86b972e707a5","rendered":"d1ae246529c5","weakened":["security-route removed"]}
- Session-start line under "warn": "This pact is weakened by a configuration file: security-route removed."

### R01: Malformed JSON

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `read`: user file: not valid JSON

### R02: A key given twice, differing only in case

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `duplicate`: user file: a key seen twice in one object (compared exactly and case-folded)

### R03: Unknown schema version

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `schema`: user file: schema must be the number 1

### R04: Unknown mark name that tries to forge markup

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `mark`: user file, edit 1: an unknown mark name

### R05: Prototype-pollution keys

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `setting`: user file: an unknown setting
- REFUSED by renderer, rule `key`: user file, edit 1: an unknown key

### R06a: Pause line as text

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `type`: user file: usagePause must be a whole number

### R06b: Pause line as a fraction

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `type`: user file: usagePause must be a whole number

### R06c: Pause line out of range

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `range`: user file: usagePause must be 50 to 100

### R06d: Pause line as an exponent (parses to 90)

Question: Q5: must refuse under both policies.

- Settings in effect: usagePause=90 (user)
- Regions the soft reviewer would read: user setting usagePause usage-pause, rendered lines 418-422
- Rendered sha256 68e00fc42130; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 68e00fc42130 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"e0b0d6765ae8","projectConfig":null,"rendered":"68e00fc42130","weakened":[]}

### R07: A mark in AGENTS.md, never installed

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `mark`: user file, edit 1: install-go-ahead is in AGENTS.md, which is never installed

### R08: The same mark edited twice in one file

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `twice`: user file, edit 2: move-2 is edited twice in one file

### R09: Too many edits

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `count`: user file: more than 16 edits

### R10: Oversized configuration file

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `size`: user file is larger than 65536 bytes

### S12: User sets the pause line; project replaces the same block

Question: Q4: a setting and an edit across files that set one block; the project wins.

- Settings in effect: none
- Regions the soft reviewer would read: project replace usage-pause, rendered lines 418-418
- Soft reviewer: not built. Scenario author's expectation: quiet
- Rendered sha256 a1b410c8577b; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash a1b410c8577b = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"7d07b09988b0","projectConfig":"be334fd05de9","rendered":"a1b410c8577b","weakened":[]}
- Diff against HEAD: `out/S12.diff.txt`

### R11: A setting and an edit set the same block in one file

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `conflict`: user file: usagePause and an edit to usage-pause both set that block

### R12a: Block path: drive-absolute

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: C?/Windows/win.ini: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12b: Block path: root-absolute

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: /etc/passwd.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12c: Block path: parent folder

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: ../outside.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12d: Block path: network share, slashes

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: //pact-proto53.invalid/share/x.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12e: Block path: network share, backslashes

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: ??pact-proto53.invalid?share?x.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12f: Block path: drive-relative

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: C?x.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12g: Block path: alternate data stream

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/x.md?stream: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12h: Block path: reserved device name

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/CON.md: a reserved device name (refused at the text check)

### R12i: Block path: trailing dot

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/x.md.: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12j: Block path: backslash separator

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks?x.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12k: Block path: trailing space

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/x.md?: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R12l: Block path: device path

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: ????C??x.md: a path outside letters, digits, '.', '_', '-' and '/' segments, or holding '.', '..' or a trailing dot (refused at the text check)

### R13a: Block file is a symbolic link

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/link.md: a link or junction on the path (refused at the filesystem check)

### R13b: Block folder is a junction

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: jblocks/x.md: a link or junction on the path (refused at the filesystem check)

### R13c: Block file is a hard link

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/hard.md: a hard link (refused at the filesystem check)

### R13d: Block path is a folder

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: dir.md: not a regular file (refused at the filesystem check)

### R14: Oversized block file

Question: Q5: must refuse under both policies.

- REFUSED by renderer (path), rule `path`: blocks/big.md: larger than 16384 bytes (refused at the filesystem check)

### R15a: Block file with a byte-order mark

Question: Q5: must refuse under both policies.

- REFUSED by renderer (gate scanText), rule `characters`: bom: blocks/b.md line 1: a byte-order mark

### R15b: Block file with Windows line endings

Question: Q5: must refuse under both policies.

- REFUSED by renderer (gate scanText), rule `characters`: characters: blocks/b.md line 1: a carriage return

### R15c: Block file with a hidden character

Question: Q5: must refuse under both policies.

- REFUSED by renderer (gate scanText), rule `characters`: invisible: blocks/b.md line 1: an invisible or direction-changing character

### R15d: Block file that is not UTF-8

Question: Q5: must refuse under both policies.

- REFUSED by renderer (gate scanText), rule `characters`: encoding: blocks/b.md: not valid UTF-8

### R16a: Block text forges a mark

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `comment`: blocks/f.md: an HTML comment (a forged mark or hidden text)

### R16b: Block text opens a comment it never closes

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `comment`: blocks/f.md: an HTML comment (a forged mark or hidden text)

### R17: Block text holds an @ import

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `import`: blocks/i.md line 1: an @ import

### R18: Block text reshapes the file

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `structure`: blocks/s.md line 2: a blank line
- REFUSED by renderer, rule `structure`: blocks/s.md line 3: a heading
- REFUSED by renderer, rule `structure`: blocks/s.md line 4: a code fence
- REFUSED by renderer, rule `structure`: blocks/s.md line 5: a numbered list line

### C17: Control: R17 with the renderer text checks off

Question: Is the renderer's import check load-bearing?

- Settings in effect: none
- Regions the soft reviewer would read: user add-after usage-pause, rendered lines 423-423
- Rendered sha256 4fd5d47b68a4; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 4fd5d47b68a4 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"62297cc4eb10","projectConfig":null,"rendered":"4fd5d47b68a4","weakened":[]}

### R17b: Block text holds an @ import inside bold

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `import`: blocks/i.md line 1: an @ import

### R17c: Block text holds an @ import after an escaped backtick

Question: Q5: must refuse under both policies.

- REFUSED by renderer, rule `import`: blocks/i.md line 1: an @ import

### R06e: Pause line written as 90.0 (parses to 90)

Question: Q5: must refuse under both policies.

- Settings in effect: usagePause=90 (user)
- Regions the soft reviewer would read: user setting usagePause usage-pause, rendered lines 418-422
- Rendered sha256 68e00fc42130; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 68e00fc42130 = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"e7324941d0be","projectConfig":null,"rendered":"68e00fc42130","weakened":[]}

### C18: Control: heading and move line added inside move 4, renderer text checks off

Question: Does the gate catch structure injected inside a move?

- Settings in effect: none
- Regions the soft reviewer would read: user add-after move-4, rendered lines 248-250
- Rendered sha256 e3c5d28e7762; byte-identical to HEAD: no
- Ordering A gate: RESULT: fail; staged gate/ unchanged by rendering: yes
  - `FAIL structure: claude/CLAUDE.md line 249: a heading not written as "## title" at column 0`
- Install manifest would record: {"policy":"warn","userConfig":"2c25e2ffedcf","projectConfig":null,"rendered":"e3c5d28e7762","weakened":[]}

### C18b: Control: heading and numbered line added after the usage-pause block, renderer text checks off

Question: Does the gate catch structure injected outside "Implementing a change"?

- Settings in effect: none
- Regions the soft reviewer would read: user add-after usage-pause, rendered lines 423-425
- Rendered sha256 68b5cdbd1c1a; byte-identical to HEAD: no
- Ordering A gate: RESULT: pass; staged gate/ unchanged by rendering: yes
  - CLAUDE.md INSTALL hash 68b5cdbd1c1a = rendered bytes
- Install manifest would record: {"policy":"warn","userConfig":"8e55aad87f89","projectConfig":null,"rendered":"68b5cdbd1c1a","weakened":[]}
