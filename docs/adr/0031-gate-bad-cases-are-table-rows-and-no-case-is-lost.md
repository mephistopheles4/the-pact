# Gate bad cases are table rows, and no case is lost

A bad case for a gate module is a row in that module's table: one plant on a base input that passes, and the exact rule ids it must fail with. The T1 baseline of every case is committed, and a compare script proves at each move 4 that every baseline case still has a home.

- **A table** (`gate/tests/tables.mjs`) has a name, the gate module whose rule ids it names, a `base()` that builds the passing input as a tree of files, a `run(input, t)` that returns the exit code, the `FAIL` rule ids, the last line and the output, and rows `{ id, plant, fails, says?, why }`. An optional `everyRow` adds the same assertions to every row, such as "a refusal writes no file".
- **The test file registers them.** `table()` returns its tests as `{ name, fn }`, and the file registers each: `for (const c of table('<name>', { ... })) test(c.name, c.fn);`. node's reporters name the file that called `test()`, so tests registered from inside `tables.mjs` were reported under it, and no case could find its home. A guard checks every test file that uses a table for that loop, and the compare fails any case reported under a file that is not a top-level test file.
- **The tests it makes.** `<table>: base passes` asserts exit 0, `RESULT: pass` and no `FAIL` line. `<table>: <row id>` applies the plant to a fresh base and asserts exit 1, `RESULT: fail`, and that the set of `FAIL` rule ids equals `fails`; equals, not includes. When `says` is given, the output must match it. `<table>: base passes after the rows` catches a row that leaked state into the process.
- **A malformed table fails its file's load:** no rows; a duplicate row id, or one outside lower-case words joined by dashes; a row with empty `fails` or no `why`; a plant that leaves the input's bytes unchanged; or a rule id that no string literal holds in the module and the gate files it imports. A `grimoire/` id is checked against the pinned check.
- **The first tables** are `render-edits`' edit list and block paths, 51 rows that replaced two loops. Their old cases map to their rows in the map of moves. New bad cases go in tables. A file already in `fast` converts when a session next changes its cases for another reason.
- **The baseline** is `gate/tests/fixtures/baseline-140/baseline.tsv`: T1's 1,651 cases as `<status>\t<file>\t<name>`, byte for byte, sha256 `14af7916…`. It never changes; the compare holds its hash.
- **Three hand-kept lists sit beside it.**
  - **`moves.tsv`:** one line per case that changed file, or became a table row in its own file.
  - **`reporter-names.tsv`:** a case the report names differently from the baseline, one line each, never a pattern. It is empty today.
  - **`env-cases.tsv`:** a case whose status depends on the machine, with why and a platform where it must pass.
- **The compare** (`gate/tests/baseline-compare.mjs <record>`) reads a record-mode junit run. It names a case as T1 did: its suite chain and its own name, unescaped once. It fails when:
  - a baseline case is in neither the run nor the map, or a map target is missing from the run;
  - a status differs from the baseline's, except that a listed machine-dependent case may pass or skip off its named platform; a skip on its named platform fails, and a fail is never accepted;
  - any case in the run failed;
  - a move line does more than change a file, unless it turns a case into `<table>: <row id>` in its own file, and that file's source registers the row. The row is read from string literals: the table's name in a `table(...)` call that heads a top-level registering loop, and the `id` of an object directly in its `rows` array. An `id` in a base input or a plant, or a table inside a function or a branch, doesn't count;
  - the record is not one full-tier run that passed: one `run: tier full` header, and the runner's `RESULT: full tier, N files, pass` last;
  - a case is reported under a path other than `<repo>` then `gate/tests/<file>.test.mjs`, as when a helper calls `test()`, or a module outside the repo has a path that ends like a test file;
  - two lines name one target, or a target is a baseline case that stays where it is;
  - the baseline's hash differs;
  - a hand-kept line holds a local path, the user or host name, or an email address. It is reported by file and line number only, never by its text. Every line the compare prints is checked the same way, and withheld on a match.
- **Repeated names count.** Three `cross-checks` names appear twice in the baseline, so the compare counts the cases of each name, and every count must match.
- **The record's platform** comes from the separator in its case paths. A record that mixes both fails, and so does one that names no file: Node 20's junit reporter writes none, so a Node 20 record can't be compared.
- **On the probe floor.** The table module, the compare, the baseline and its two lists `env-cases.tsv` and `reporter-names.tsv` are on AGENTS.md's probe floor, with `tables.test.mjs` and `baseline-compare.test.mjs`. `moves.tsv` is not: its lines change with every move, and the compare bounds what a line can do.

## Why

- **A new bad case should cost one row, not a new test with its own setup.** The owner's target is thousands of cases that still run fast. A row is a few words, and the table carries the setup.
- **A row must fail because of its plant.** A loop that checks only that its rule appears among the `FAIL` lines can pass for the wrong reason, when a second rule trips or the runner always fails. The base passing, and the row differing from it only by its plant, closes both: a runner that always passes fails every row, and one that always fails fails the base.
- **Moving tests can hide a lost one.** #140's tickets move hundreds of cases between files and turn loops into tables. A count that stays the same can still hide a case that was dropped while another was added. Matching every baseline case by name, file and status, with each move written down, makes a loss visible.
- **The lists are hand-kept, and the repo was being readied for publishing.** A path or a name typed into a list would be published, so the compare checks every line with the runner's leak patterns before reading any. It never echoes a line it flagged.
- **Names are read the baseline's way.** #145's move 4 read each case by its own name alone, and counted 38 cases the report "named differently". Read the way the baseline was made, with the suite chain, all of them match. So `reporter-names.tsv` stays empty, and no pattern matching is needed.

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#140, spec revision 10, signed off by the owner, built in #154 (T5). The owner chose "render-edits first" for the first tables (D5), and "when touched" for converting other files (D3).
- **The Linux compare waits on #149.** On Node 20 the four `node:sqlite` practice cases fail, and Node 20's junit reporter names no file for any case. The owner chose "B, everything should be on LTS": the four get no exception in `env-cases.tsv`, and the Linux compare runs once the container is on the LTS (#149). Until then, each Linux run checks the Linux-listed cases by name in its record, and posts how many passed.
- **Known limits, not closed by the compare.** It matches a moved case by file, name and status, not by its body, so a move that empties a test's body still finds a home; review of the diff covers that, and #157 (T6), which moves hundreds of cases, should check moved bodies. The record carries no commit, so the compare can't tell a record from an earlier commit; binding one needs the runner to write it, a change on the probe floor.
- **Still holds:** [ADR 0030](0030-the-gate-suite-runs-through-one-runner-in-named-tiers.md), on the runner, its tiers and record mode. The compare reads the runner's record and imports its leak patterns.
