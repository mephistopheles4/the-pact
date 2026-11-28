# Spec: cross-harness agent identity guard — V1

Status: approved (r6; owner signed off on PACT-119) (absorbs
PACT-41; leaves PACT-95's poster-retirement and Linear MCP questions open). The
owner settled all 13 design decisions in the PACT-119 Eagle-Eye box (S2);
flagged security checkpoints are listed in S7 and S10. The spec counts once it
is on `main`.

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 Decisions](#s2-decisions)
- [S3 Shared guard engine and rule table](#s3-shared-guard-engine-and-rule-table)
  - [Rule table (`~/.pact/guard/rules.json`)](#rule-table-pactguardrulesjson)
  - [Closed subcommand and option tables](#closed-subcommand-and-option-tables)
  - [Precedence and entry point (`answerCall`)](#precedence-and-entry-point-answercall)
  - [Plain-text repo-owner resolution (no `git` subprocess)](#plain-text-repo-owner-resolution-no-git-subprocess)
- [S4 Per-harness wrappers](#s4-per-harness-wrappers)
- [S5 Installer, Seam A and rendered rules](#s5-installer-seam-a-and-rendered-rules)
  - [Guard switches, copy set, and hardened Claude Code hook (`gate/install-core.mjs`, `gate/install-run.mjs`, `gate/seam-a-core.mjs`)](#guard-switches-copy-set-and-hardened-claude-code-hook-gateinstall-coremjs-gateinstall-runmjs-gateseam-a-coremjs)
  - [Rendered session guidance (`claude/CLAUDE.md`, `harnesses/known.json`, `gate/`, `builder/`)](#rendered-session-guidance-claudeclaudemd-harnessesknownjson-gate-builder)
- [S6 Documentation updates](#s6-documentation-updates)
- [S7 Threat model and security invariants](#s7-threat-model-and-security-invariants)
- [S8 Trade-offs](#s8-trade-offs)
- [S9 Acceptance claims](#s9-acceptance-claims)
- [S10 Tickets](#s10-tickets)
  - [Target environment vs dev/CI notes](#target-environment-vs-devci-notes)
  - [Needs the owner](#needs-the-owner)
  - [Stop and ask when](#stop-and-ask-when)
- [S11 Rollback](#s11-rollback)
- [S12 Out of scope (deferred)](#s12-out-of-scope-deferred)

<!-- /toc -->

## S1 Objective

When `agent-identity` is `true` in `~/.pact/config.json` and GitHub Apps are
pinned in `~/.pact/github.json`, Claude Code injects `GIT_CONFIG_GLOBAL` and
`GIT_TERMINAL_PROMPT=0` through `~/.claude/settings.json`. Antigravity and
Codex have no equivalent environment block, so plain `git` writes in those
harnesses fall back to the owner's personal Git configuration and credentials.
Across all three harnesses, plain `gh` write commands also run under the
owner's personal `gh` login unless intercepted; today only Claude Code has an
external user-level hook outside the pact, and `claude/review.md` omits
`--provider <provider>` on `gh-app.mjs status`.

Who uses V1: the pact owner on Windows (PowerShell in Antigravity/Codex, with
POSIX formatting supported in the guard for forward compatibility) across
Claude Code, Codex and Antigravity.

Success: under the single existing `agent-identity: true` setting, one install
wires all three harnesses to the shared guard (`~/.pact/guard/`), intercepts
owner-repo plain `git` and `gh` writes, renders a one-line startup reminder
into non-env harnesses' `AGENTS.md`, fixes `--provider <provider>` and
explicit-login `--add-assignee` across docs, passes CI's three jobs (`gate`,
`gate-macos`, `gate-windows`), and passes a live Antigravity probe of
`overwrite` + `decision: "force_ask"` (falling back to `"deny"` if the probe
shows `force_ask` drops `overwrite` or fails to prompt).

## S2 Decisions

All 13 decisions were settled by the owner in the PACT-119 Eagle-Eye box (with
Design round 1 security refinements marked):

1. **Harnesses wired:** all three harnesses (`claude`, `codex`, `antigravity`)
   under one pact config.
2. **Writes guarded:** plain `git` writes missing `GIT_CONFIG_GLOBAL` and plain
   `gh` writes. Linear MCP writes stay out of scope (`PACT-95`).
3. **Antigravity git hook action:** `PreToolUse` `overwrite` rewriting
   `CommandLine` with `decision: "force_ask"` (tightened from `"ask"` after
   review of `docs/log/2026-11-25-antigravity.md`, where `"ask"` ran without
   prompting in headless `agy -p`; gated on a live probe right after T2, with
   automatic fallback to `"deny"` if `force_ask` drops `overwrite` or fails to
   prompt) on unambiguous `run_command` calls; fallback to `decision: "deny"`
   with an actionable reason on `manage_task` (`send_input`) /
   `send_command_input`, on shadowed/unsupported shell commands, and in Codex.
   Claude Code keeps `settings.json` `env` injection for normal `git` writes
   and runs the shared guard for both plain `gh` writes and `git`
   override/unset attempts (while skipping cleaner rules and keeping
   `canOverwrite: false`).
4. **Claude Code hook wiring:** a thin `claude/guard/claude.mjs` wrapper
   sharing `~/.pact/guard/guard.mjs` and `rules.json`, merged into
   `~/.claude/settings.json` `PreToolUse` (`Bash|PowerShell`) via a hardened
   launcher (clearing `NODE_OPTIONS` and blocking `cwd` `node` lookup on
   Windows) while `agent-identity` is on.
5. **Config switch:** reuse the existing `agent-identity: true` switch in
   `~/.pact/config.json` (no separate Scriptorium checkbox).
6. **Unpinned harness check:** skip install-time pin and gitconfig checks for
   non-Claude harnesses; keep Claude Code's existing install-time pin and
   gitconfig check untouched.
7. **Runtime pin behavior:** identity rules read `~/.pact/github.json` at hook
   runtime — enforce when `pin.apps[provider]` is present (and verify
   `<home>/.pact/gh-app-<provider>.gitconfig` exists as a regular non-symlink
   file before rewriting or accepting `git` writes), pass through when that
   provider is unpinned (or the file is absent via `lstatSync` `ENOENT`), and
   fail closed (`pin` failure code) when the file is a symlink, unreadable, or
   malformed.
8. **Repo-owner scoping:** scope repo-bound `git` and `gh` identity rules to
   `pin.owner.login` repos by inspecting explicit target slots (`-R`/`--repo`,
   `GH_REPO`, `gh api` endpoint, `git push` remote URL) first — never prose
   flags — then reading `.git/config` directly as plain text (never spawning
   `git` in `cwd`, rejecting UNC/network paths and symlinks). Account-level
   `gh` writes stay guarded regardless of `cwd`. Third-party repos pass
   through; unreadable, missing, or unresolvable remotes fail closed (guarded).
9. **Guarded git subcommands:** `commit`, `push`, `merge`, `cherry-pick`,
   `revert`, `rebase`, `tag`, `am` (`git pull` stays excluded as an accepted
   residual recorded in S7).
10. **Denied `gh` routing:** when `poster` is on in `~/.pact/config.json`,
    free-text `gh` writes direct to `poster.mjs` and other `gh` writes direct
    to `gh-app.mjs gh --provider <provider>`; when `poster` is off, all denied
    `gh` writes direct to `gh-app.mjs gh --provider <provider>`.
11. **`gh` write exceptions:** route `--add-assignee <owner>` through
    `gh-app.mjs gh` naming the owner's login explicitly (updating
    `docs/agents/agent-apps.md`, `claude/review.md`, and `AGENTS.md`; plain
    `gh pr/issue edit` stays denied), and exempt `gh run` and `gh workflow`
    write subcommands while `gh-app.mjs` `CLAIM_PERMISSIONS` holds
    `actions: read` only (recorded as an open `Who counts as you` residual in
    S7 and `docs/threat-model.md`).
12. **Session guidance:** render one short rule line into `AGENTS.md` for
    harnesses lacking `settings.json` `env` injection (`codex`, `antigravity`)
    when `agent-identity` is on (with a `docs/rule-reasons.md` entry), and add
    `--provider <provider>` to `gh-app.mjs status` in `claude/review.md`,
    `docs/agent-identity.md` and `docs/agents/agent-apps.md`.
13. **Review tier and route:** Thorough tier on the sensitive route (spec cut
    into tickets, with `adversarial-lens` and `data-lens` on the spec and on
    every ticket's diff at Test).

## S3 Shared guard engine and rule table

`claude/guard/guard.mjs` remains a zero-dependency Node 24+ ESM module whose
existing exports (`COMMAND_MAX`, `GuardFailure`, `segmentsOf`, `programAt`,
`parseTable`, `judge`, `answer`) remain backwards-compatible for existing tests
and callers.

- **Tokenizer hardening (`segmentsOf` in `claude/guard/guard.mjs:67,73,80-105`):**
  - In `bash === true` double quotes, treat ONLY `\"` and `\\` as escapes
    (removing the `bash && command[i] === '`'` branch at line 67 so ``"x`"``
    does not hide a command after closing `"`); also support Bash ANSI-C
    `$'...'` strings (`\'` and `\\` escapes inside `$'...'`).
  - In `bash === false` inside `"..."`, consume `` ` `` escapes via `i += 2`
    (so `` ``" `` closes the string) and handle PowerShell doubled `""` inside
    `"..."` and `''` inside `'...'`.
  - For PowerShell here-strings (`@'`/`@"`), restrict matching to
    `!bash && !started` (`guard.mjs:73`) and scan past unlimited `[ \t]`
    before `\r?\n` (removing the 80-character `command.slice(i + 2, i + 80)`
    cap).
  - For heredoc delimiters (`<<`/`<<-`) and PowerShell `--%`, restrict heredoc
    matching to `(bash || (!started && !stopParse))`, handle PowerShell `--%`
    stop-parsing to end of line (`stopParse` reset at `\n`), and unquote
    backslash escapes and single/double quotes across the entire delimiter word
    (so `<<\EOF`, `<<E'O'F`, and `<<"E"OF` all match `EOF`).

### Rule table (`~/.pact/guard/rules.json`)

- When `agent-identity` is off, `rules.json` is `{ "rules": [...] }`, byte for
  byte identical to today.
- When `agent-identity` is on, `rules.json` adds one top-level key:
  `"identity": { "enabled": true, "posterOn": <boolean> }`.
- `parseTableDoc(text)` validates a plain-object root (`!Array.isArray(raw) &&
  raw !== null && typeof raw === 'object'`) whose keys are a subset of
  `['rules', 'identity']` (with `'rules'` required), validates `rules` with the
  same strict checks as `parseTable`, and validates optional `identity`: when
  present, `identity` must be a plain object with exact keys `['enabled',
  'posterOn']`, `enabled === true`, and `typeof posterOn === 'boolean'`, else
  throws `GuardFailure('table')`. `answerCall` uses `parseTableDoc(text)`, while
  `parseTable(text)` preserves existing backwards-compatible behavior for
  existing callers (`guard.mjs:242`).
- All closed command and option tables below live in `guard.mjs` as frozen
  constants rather than data in `rules.json`, so a table edit cannot weaken
  them.

### Closed subcommand and option tables

- **`GIT_WRITE_SUBCOMMANDS`:** `commit`, `push`, `merge`, `cherry-pick`,
  `revert`, `rebase`, `tag`, `am`.
- **`GIT_BUILTIN_READ_SUBCOMMANDS`:** closed 32-command built-in read set
  (`status`, `log`, `diff`, `show`, `ls-files`, `rev-parse`, `cat-file`,
  `branch`, `remote`, `describe`, `shortlog`, `blame`, `grep`, `help`,
  `version`, `for-each-ref`, `ls-remote`, `ls-tree`, `merge-base`, `name-rev`,
  `reflog`, `show-ref`, `symbolic-ref`, `whatchanged`, `verify-commit`,
  `verify-tag`, `check-ignore`, `check-attr`, `check-ref-format`,
  `count-objects`, `fsck`, `var`). When config-injection env vars
  (`GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_SYSTEM`, or inline /
  non-expected `GIT_CONFIG_GLOBAL`) are active on a `git` segment and `subcmd`
  is outside this set, `parseGitSegment` / Step 4 guards the segment (`deny`,
  never `overwrite_ask`).
- **`GIT_GLOBAL_OPTS` (complete arity table before the subcommand):**
  - Value-taking (separate next token OR attached `-C<dir>`, `-c<k>=<v>`,
    `--<opt>=<val>`): `-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`,
    `--config-env`, `--super-prefix`, `--exec-path`, `--list-cmds`,
    `--attr-source`.
  - No-argument flags: `-p`, `--paginate`, `-P`, `--no-pager`, `--bare`,
    `--no-replace-objects`, `--no-lazy-fetch`, `--no-optional-locks`,
    `--no-advice`, `--literal-pathspecs`, `--glob-pathspecs`,
    `--noglob-pathspecs`, `--icase-pathspecs`, `--version`, `-v`, `--help`,
    `-h`, `--html-path`, `--man-path`, `--info-path`, and `--exec-path` (with
    no `=`).
  - Unknown leading flag before subcommand: fail closed — classify the segment
    as a guarded `git` write (unless the sole argument is `--version` or
    `--help`).
- **`GIT_PUSH_VALUE_FLAGS` (for extracting `git push`'s `<repository>` arg):**
  - Separate-next-token OR `=` value-taking: `-o`/`--push-option`,
    `--receive-pack`, `--exec`, `--repo` (`--repo=<url>` / `--repo <url>` is
    captured as a fallback push target URL; positional `<repository>` overrides
    `--repo` if both are present).
  - `=`-only optional-value flags (NEVER consume the next token when `=` is
    absent): `--force-with-lease`, `--recurse-submodules`, `--signed`.
  - No-argument boolean flags: `-u`, `--set-upstream`, `-f`, `--force`,
    `--force-if-includes`, `--no-force-if-includes`, `--tags`, `--all`,
    `--mirror`, `-d`, `--delete`, `-n`, `--dry-run`, `--atomic`,
    `--no-verify`, `-q`, `--quiet`, `-v`, `--verbose`, `--porcelain`,
    `--no-signed`, `-4`, `--ipv4`, `-6`, `--ipv6`, `--prune`, `--thin`,
    `--no-thin`, `--follow-tags`, `--no-follow-tags`, `--progress`,
    `--no-progress`, `--no-recurse-submodules`, `--no-force-with-lease`.
  - Any other unknown `-...` flag on `git push` fails closed (`ownerScope`
    returns `{ match: true }`).
- **`programAt` `env` option arity:** extend `programAt` in `guard.mjs` so `env`
  matches `/^env(?:\.exe)?$/i.test(base(t))` (covering `/usr/bin/env`,
  `/bin/env`, and `env.exe`) and handles `--` (end of options),
  `-i`/`--ignore-environment`/`-`, `-u`/`--unset` (separate next token, attached
  `-u<var>`, `--unset=<var>`), `-C`/`--chdir` (separate next token, attached
  `-C<dir>`, `--chdir=<dir>`), `-a`/`--argv0` (separate next token, attached
  `-a<arg0>`, `--argv0=<arg0>`), `-0`/`--null`, `-v`/`--debug`, and bundled
  short options (`-iu`, `-iC`, `-vi`, `-0u`). Pass `env -C <dir>` into
  `ownerScope`. For ANY `env -S` / `--split-string` (separate, attached,
  bundled, or `=`), ALWAYS fail closed (`identity-gh` if `gh` appears, else
  `identity-git` deny, with `ownerScope` returning `{ match: true }`) whenever
  its string argument contains `\`, `$`, `'`, `"`, `` ` ``, `gh`, `git`, or
  ambiguous command syntax (whether or not any token follows `-S`), AND
  whenever a following `gh` or `git` segment appears after `env -S`, also force
  `ownerScope` `{ match: true }`. Whenever an unknown `env` flag (such as
  `env -P /usr/bin git push`) appears, do NOT silently stop on its argument:
  inspect the remaining tokens in the segment and fail closed as guarded
  (`identity-gh` if any remaining token has `programName === 'gh'`, else
  `identity-git` if any remaining token has `programName === 'git'`, with
  `ownerScope` returning `{ match: true }`); unknown leading `git` flags
  likewise fail closed in `ownerScope` (`{ match: true }`).
- **`GH_READ_ONLY_GROUPS`:** `status`, `browse`, `search`, `completion`,
  `help`, `version`.
- **`GH_EXEMPT_GROUPS`:** `run`, `workflow` (kept per S2 item 11 while
  `CLAIM_PERMISSIONS` has `actions: read` only).
- **`GH_READ_VERBS` (complete per-group closed read verb lists):**
  - `pr`: `list`, `view`, `status`, `diff`, `checks`
  - `issue`: `list`, `view`, `status`
  - `release`: `list`, `view`, `download`, `verify`, `verify-asset`
  - `repo`: `list`, `view`, `clone`, `gitignore`, `license`, `credits`
  - `label`: `list`
  - `gist`: `list`, `view`, `clone`
  - `secret`: `list`
  - `variable`: `list`, `get`
  - `cache`: `list`
  - `ruleset`: `list`, `view`, `check`
  - `project`: `list`, `view`, `field-list`, `item-list`
  - `org`: `list`
  - `attestation`: `verify`, `download`, `inspect`, `trusted-root`
  - `auth`: `status` ONLY when no token before `--` matches `/^-[A-Za-z]*t/`
    (catching `-t`, `-at`, `-ta`) or `tok === '--show-token' ||
    tok.startsWith('--show-token=')` (`auth token`, `auth login`, `auth logout`,
    `auth refresh`, `auth setup-git`, `auth switch`, and `auth status` with
    any token-printing flag are all classified as guarded writes).
- **`GH_FREE_TEXT_WRITES`:** `pr` (`create`, `comment`, `edit`, `review`) and
  `issue` (`create`, `comment`, `edit`).
- **`GH_ACCOUNT_SCOPED_GROUPS` (always guarded regardless of `cwd`
  `.git/config`):** `auth`, `ssh-key`, `gpg-key`, `alias`, `config`,
  `extension`, `extensions`, `ext`, `codespace`, `repo fork` (exempt ONLY when an
  explicit non-`@me` `--org <org>` matching `LOGIN_RE` with `org.toLowerCase()
  !== pin.owner.login.toLowerCase()` appears before any unknown flag, since `gh
  repo fork stranger/repo` forks into `@me`), `repo create` (exempt ONLY when a
  clean positional `<org>/<name>` — NEVER `-R`/`--repo` and NEVER `GH_REPO` —
  names a non-owner org matching `LOGIN_RE` before any unknown flag), other
  `repo` writes (`delete`, `archive`, `unarchive`, `edit`, `sync`, `set-default`,
  `rename`, `deploy-key`, `autolink`, etc. — where positional `<owner>/<repo>`
  exempts ONLY on `delete`, `archive`, `unarchive`, `edit`, `sync`, and
  `set-default`, and NEVER on `fork`, `deploy-key`, `autolink`, or `rename`,
  since `gh repo delete <name>` without `/` targets `@me`), `gist` writes
  (`create`, `edit`, `delete`, `rename`), `project` writes (unless `--owner` is
  explicitly present, is NOT `@me`, and matches `LOGIN_RE` with a non-owner
  login), `secret`/`variable` writes carrying `-u`, `--user`, `--user=...`,
  `-o`, `-o<org>`, `-o=...`, `--org`, `--org=...`, or any bundled short flag
  matching `/^-[A-Za-z]*[uo]/` before `--` (catching `-nu`, `-no`), and any
  `gh api` write whose query/fragment-stripped endpoint does NOT match clean
  `/^\/?repos\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|\{owner\}|:owner)\//` with
  zero `.`, `..`, or `%` path segments (so `/graphql`, `/user*`, `/orgs*`,
  `/gists*` are NEVER exempted by a third-party `cwd` or `GH_REPO`, while
  `repos/{owner}/...` and `repos/:owner/...` fall through to Step 2 `cwd`
  `.git/config`; `--hostname` exemption applies ONLY when the endpoint is NOT a
  full URL matching `/^[a-z][a-z0-9+.-]*:\/\//i`, every `--hostname` across
  global and `api` slots agrees, and after normalizing
  `host.toLowerCase().replace(/\.+$/, '')` it matches strict non-empty DNS
  hostname syntax
  `HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/`
  and is NEVER `'github.com'` or any `*.github.com` subdomain (`host ===
  'github.com' || host.endsWith('.github.com')`) — rejecting `--hostname ""` and
  malformed host strings).
- **`GH_GLOBAL_VALUE_FLAGS` (accepted before group or verb):** `-R`/`--repo`,
  `--hostname` (separate next token or attached `-R<val>`, `--repo=<val>`,
  `--hostname=<val>`).
- **`GH_API_VALUE_FLAGS`:** `-X`/`--method`, `-H`/`--header`, `-q`/`--jq`,
  `-t`/`--template`, `--hostname`, `--cache`, `--preview`, `-f`/`--raw-field`,
  `-F`/`--field`, `--input` (separate or attached `-XPOST`, `--method=POST`,
  `-f...`, `-F...`, `--input=...`).
- **`GH_API_NOARG_FLAGS`:** `-p`/`--paginate`, `--slurp`, `-i`/`--include`,
  `--silent`, `--verbose`, `--help`, `-h`.

### Precedence and entry point (`answerCall`)

`answerCall({ command, provider, cwd, canOverwrite, env, tableFile, pinFile, platform, shell })`
evaluates one call and returns `null` or one decision object (`shell` accepts
`'bash' | 'powershell' | 'unknown' | undefined`, failing closed with
`GuardFailure('call')` on any other value):

1. **Cleaner rules first** (for `provider !== 'claude'`, since Claude Code
   enforces cleaner via native `permissions.deny`/`ask`): `deny` beats `ask`,
   matching today's `judge(command, rules)`. Any cleaner hit returns
   immediately (`{ decision: 'deny' | 'ask', id }`).
2. **Lazy identity pin gate (read ONLY on candidate `gh`/`git` calls):** if
   `!doc.identity?.enabled`, return `null`. First scan `command` cleanly in both
   shell modes (`segmentsOf(command, true)` and `segmentsOf(command, false)`):
   if there is no candidate `gh` segment, no candidate `git` write/unknown-flag
   segment (checked across all three providers, including `claude`), and no `env -S`
   or unknown `env` flag candidate, return `null` WITHOUT reading `pinFile` (so
   a malformed `github.json` never locks out unrelated shell calls such as `ls`
   or repair commands). Otherwise resolve `pinFile` (default: `../github.json`
   relative to `rules.json`, i.e., `<home>/.pact/github.json`, so `--home`
   installs stay isolated):
   - Call `lstatSync(pinFile)` first:
     - `ENOENT` -> return `null` (no pin file yet).
     - Symlink, directory, non-regular file, or any other `lstatSync` error ->
       throw `GuardFailure('pin')` (so a dangling symlink never fails open).
   - Read `65537` bytes (`cap + 1`) via bounded `openSync`/`readSync` (no BOM
     stripping, matching `gh-app.mjs:readPin`), and throw `GuardFailure('pin')`
     if bytes read `> 65536` (fail closed on oversize instead of parsing a
     truncated prefix).
   - Validate strictly against `gh-app.mjs:readPin`:
     - Plain object with exact keys `['owner', 'apps']`.
     - `owner`: plain object with exact keys `['login', 'id']`,
       `LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/` matching `owner.login`,
       positive safe integer `owner.id`.
     - `apps`: plain object where every key is in `PROVIDERS = ['claude',
       'codex', 'antigravity']` and every value is a plain object with exact
       keys `['app_id', 'slug', 'bot_login', 'bot_id']`, positive safe integers
       `app_id` and `bot_id`, `SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/`
       matching `slug`, and `bot_login === "${slug}[bot]"`.
     - Any mismatch throws `GuardFailure('pin')`.
   - Valid pin without `pin.apps[provider]` -> return `null` (provider
     unpinned).
3. **Plain `gh` write check** (all three providers): beats any `git` identity
   match so a compound command combining `git commit` and `gh pr create` is
   always denied, never rewritten with `force_ask`.
   - Parse `command` with both `segmentsOf(command, true)` and
     `segmentsOf(command, false)` (quotes, heredocs, here-strings and comments
     stay data).
   - For each segment whose `programName(tokens[at]) === 'gh'`:
     - Extract `args = tokens.slice(at + 1)`.
     - Skip if `!args.length`.
     - Skip on `-h` ONLY when `args` is exact `['-h']`, `[group, '-h']`, or
       `[group, verb, '-h']` (after skipping only `GH_GLOBAL_VALUE_FLAGS`) AND
       `group !== 'auth'` (because `-h` is `--hostname` on `gh auth` and a
       prose value on `--body -h`).
     - Skip on `--help` ONLY when `--help` appears at `args[0]` or immediately
       after `group` or `verb` (after skipping only `GH_GLOBAL_VALUE_FLAGS`,
       BEFORE any other flag), OR for `gh api`, when `--help` is parsed as an
       unconsumed `GH_API_NOARG_FLAGS` token.
     - Skip past known `GH_GLOBAL_VALUE_FLAGS` (`-R`/`--repo`, `--hostname`) to
       locate `group` (and record any `-R`/`--repo` value). If an unknown flag
       precedes `group` (other than `--version`), fail closed as a guarded
       write.
     - Skip if `group` is in `GH_READ_ONLY_GROUPS` or `GH_EXEMPT_GROUPS`.
     - Classify `isGhWrite(group, restArgs)` (sharing one `parseGhApi(restArgs)`
       helper between `isGhWrite` and `ownerScope` so bundled/attached flags
       such as `gh api -it repos/stranger/r` parse identically in both):
       - For `api`: walk `restArgs` before `--` using `GH_API_VALUE_FLAGS` and
         `GH_API_NOARG_FLAGS` (normalizing attached `-XPOST`, `--method=POST`,
         `--input=...`, `-f...`, `-F...`, `--raw-field=...`, `--field=...`) to
         extract `method` (taking the LAST `-X`/`--method` upper-cased, or
         failing closed if any `-X`/`--method` is non-`GET`/`HEAD`),
         `endpoint` (first non-flag token), whether any write field flag
         (`-f`, `-F`, `--field`, `--raw-field`, `--input`) is present, and
         whether any `-F`/`--field` value contains `@` or `--input` is set;
         fail closed as a write if ANY unknown flag OR non-decomposable bundled
         short flag (such as `-iX` or `-pX`) appears **anywhere before `--`**
         (both before AND after `endpoint`).
         - If `endpoint` matches `/^\/?graphql$/`: write iff
           `/\bmutation\b/i` appears in any field/arg OR `--input` is set OR
           any `-F`/`--field` value contains `@` (file/stdin query).
         - Else if `method` is set: write iff `method !== 'GET' && method !== 'HEAD'`.
         - Else: write iff any write field flag is present.
       - For any group in `GH_READ_VERBS`: skip past `GH_GLOBAL_VALUE_FLAGS`
         between `group` and `verb`; if `verb` is missing (and didn't pass the
         strict `-h`/`--help` check above), fail closed as a write; else if
         `verb` is in `GH_READ_VERBS[group]` (applying the `auth status`
         `/^-[A-Za-z]*t/` / `--show-token(=|$)` rule) classify as read;
         otherwise classify as write.
       - **Default fail-closed:** any `group` not in `GH_READ_ONLY_GROUPS`,
         `GH_EXEMPT_GROUPS`, or `GH_READ_VERBS` (including `ssh-key`, `gpg-key`,
         `alias`, `config`, `extension`/`extensions`/`ext`, `codespace`, or any
         unrecognized group) is classified as a write.
       - Commands run via `node ~/.pact/tools/gh-app.mjs gh ...` or
         `node ~/.pact/tools/poster.mjs ...` have program `node`, never `gh`,
         so they pass through untouched.
     - Check repo-owner scope (`ownerScope`, below):
       - If the command matches `GH_ACCOUNT_SCOPED_GROUPS` (including non-`repos/`
         `gh api` writes unless `--hostname` is non-`github.com`/`*.github.com`
         on a non-full-URL endpoint), skip third-party exemption (always
         guarded).
       - Otherwise, if `ownerScope` resolves clearly to a non-`github.com` host
         or an owner other than `pin.owner.login` (case-insensitive), skip this
         segment.
     - On match: return `{ decision: 'deny', id: 'identity-gh', reason }` where
       `reason` is one of two exact static literal templates (interpolating
       ONLY the closed-set `provider` name — NEVER `pin.owner.login`, command
       arguments, `.git/config` URLs, or error text):
       - When `doc.identity.posterOn` is true and `(group, verb)` is in
         `GH_FREE_TEXT_WRITES`:
         `Plain gh writes are blocked while agent-identity is on for <provider>. Use node "$HOME/.pact/tools/poster.mjs" for free-text GitHub posts, or node "$HOME/.pact/tools/gh-app.mjs" gh --provider <provider> -R <owner>/<repo> -- <args> for other writes (for assignees, pass --add-assignee <owner> explicitly; @me resolves to the app).`
       - Otherwise:
         `Plain gh writes are blocked while agent-identity is on for <provider>. Use node "$HOME/.pact/tools/gh-app.mjs" gh --provider <provider> -R <owner>/<repo> -- <args> (for assignees, pass --add-assignee <owner> explicitly; @me resolves to the app).`
4. **Plain `git` write check** (all three providers: `'claude'`, `'antigravity'`, `'codex'`; `'claude'` keeps `canOverwrite: false`):
   - Expected gitconfig path: `<pactDir>/gh-app-<provider>.gitconfig` (derived
     from `dirname(pinFile)`, forward-slashed).
   - **Evaluate each shell mode (`bash = true` and `bash = false`) independently**
     — never allow an assignment seen in one shell mode (such as a PowerShell
     `<# ... #>` block comment parsed as Bash) to satisfy a `git` segment in
     the other mode. Track `sawHeredoc`, `sawHereString`, `sawComment`,
     `sawStopParse`, subexpressions, and segment identity keys (`segKey`):
     `shell === 'unknown'` disables both `allowBashExempt` and `allowPsExempt`
     (permitting only inline same-mode assignments or exact `env`), `shell ===
     'bash'` disables `allowPsExempt`, `shell === 'powershell'` disables
     `allowBashExempt`, and when `shell === undefined`, cross-mode exemption
     (`canCrossExempt`) succeeds only when both modes agree on the unquoted
     standalone assignment segment (and prefix segments before the target)
     without comments, heredocs, here-strings, `--%` (`sawStopParse`), or
     embedded substitutions. While exported `segmentsOf` stays backwards-compatible,
     `answerCall` uses an internal separator-preserving walk over `;`, `&&`,
     `||`, `|`, `&`, `(`, `)`, `{`, `}`, and newlines (plus shell control
     keywords `if`, `then`, `elif`, `else`, `fi`, `for`, `while`, `until`,
     `select`, `do`, `done`, `case`, `esac`, `function`, `coproc`) so
     separator/block constraints below are enforced accurately.
   - Within a shell mode, a `git` segment has `GIT_CONFIG_GLOBAL` satisfied
     ONLY when **NONE** of the override disqualifiers below (`-c credential.*`/
     `user.*`/`author.*`/`committer.*`/`core.askPass`/`include.*`/`includeIf.*`/
     `http.*`/`url.*`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`,
     `--config-env`) applies, AND:
     - `env.GIT_CONFIG_GLOBAL` matches the exact expected path (normalized
       slashes, case-folded on Windows) AND none of the disqualifiers below
       applies; OR
     - an inline assignment on that exact `git` segment (`GIT_CONFIG_GLOBAL=...
       git ...` or `env GIT_CONFIG_GLOBAL=... git ...` in Bash, taking last-wins
       on multiple inline assignments) sets the exact expected path AND none of
       the disqualifiers below applies (such as inline `GIT_CONFIG_GLOBAL=...
       env -u GIT_CONFIG_GLOBAL git ...` or `env -i`); OR
     - an earlier unconditional top-level `export` (`export
       GIT_CONFIG_GLOBAL=...` in Bash with exact 2 tokens `['export',
       'GIT_CONFIG_GLOBAL=...']` and NO flags on `export`;
       `$env:GIT_CONFIG_GLOBAL = ...` in PowerShell with exact 3 tokens
       `['$env:GIT_CONFIG_GLOBAL', '=', '<p>']`, rejecting trailing arguments
       or extra variables) sets the exact expected path, AND **EVERY**
       separator in `command` (before, enclosing, AND after the export) is
       strictly `;` or newline with zero conditional/pipeline/subshell/block
       separators or control keywords anywhere in `command`, and none of the
       disqualifiers below applies.
   - **Disqualifiers (invalidate `env.GIT_CONFIG_GLOBAL`, inline assignments on
     the `git` segment, and earlier top-level exports anywhere before or on the
     `git` segment, and reject earlier-export satisfaction whenever non-`;`/
     newline operators appear anywhere in `command`):**
     - Any `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, `--config-env`, or
       parsed-token `-c` override of `credential.*`, `user.*`, `author.*`,
       `committer.*`, `core.askPass`, `include.*`, `includeIf.*`, `http.*`, or
       `url.*` (case-insensitive) disqualifies `GIT_CONFIG_GLOBAL` satisfaction
       as well as `overwrite_ask`;
     - ANY separator/block token `&&`, `||`, `|`, `&`, `(`, `)`, `{`, `}`, or
       shell control keyword (`if`, `then`, `elif`, `else`, `fi`, `for`,
       `while`, `until`, `select`, `do`, `done`, `case`, `esac`, `function`,
       `coproc`) anywhere in `command` disqualifies earlier top-level exports
       (and enclosing/`|`/`&`/subshell boundaries also disqualify
       `env.GIT_CONFIG_GLOBAL`);
     - Any `unset`, `export`/`declare`/`typeset`/`readonly` carrying any flag
       (such as `export -n`, `declare +x`, `typeset +x`, `declare -x +x`,
       `-g`, `-p`, `-r`), or later reassignment touching `GIT_CONFIG_GLOBAL`;
     - Any `env` carrying `-`, `-i`, `--ignore-environment`, `-u`, `--unset`,
       `-S`, or `--split-string` (in any separate, attached `-u<var>`, `=`, or
       bundled form such as `-vi`, `-0u`, `-iu`);
     - PowerShell env-provider / variable cmdlets/aliases (`Remove-Item`,
       `Set-Item`, `Clear-Item`, `New-Item`, `Rename-Item`, `Move-Item`,
       `Copy-Item`, `del`, `rm`, `ri`, `si`, `cli`, `ni`, `erase`, `ren`,
       `rni`, `mv`, `mi`, `move`, `cpi`, `cp`, `copy` targeting `env:`
       case-insensitively; plus `Set-Variable`, `Remove-Variable`,
       `Clear-Variable`, `sv`, `rv`, `clv` targeting `HOME`, `USERPROFILE`, or
       `GIT_CONFIG_GLOBAL`), `${env:...}`, `[Environment]::`,
       `[System.Environment]::`, PowerShell `"$(...)"` subexpressions inside
       double quotes, PowerShell expandable `@"..."@` here-strings containing
       `$` or `$(`, or `cmd` `/c` / `/d`.
   - **Raw-quoting path validation (no expansion on quote-stripped tokens):**
     inspect the raw unstripped right-hand side of the assignment:
     - Never expand `~`, `$HOME`, or `$env:USERPROFILE` inside single quotes
       `'...'`.
     - In PowerShell (`bash = false`): reject ALL unquoted RHS paths/variables
       (expression mode fails non-terminatingly on `C:\...` or `$env:USERPROFILE/...`).
       Accept ONLY single-quoted literal path `'...'` (with `''` unescaped, no
       variable/`~` expansion), double-quoted literal path `"..."` (no `` `$ ``
       escape or `$(`), OR double-quoted `"$env:USERPROFILE/..."` /
       `"$HOME/..."` (no `` `$ `` escape or `$(`) where the matching env var
       (`env.USERPROFILE` case-insensitively on `win32`, or `env.HOME` when
       using `$HOME`) MUST be **present** (non-empty) and normalize to
       `<home>`, and no earlier statement reassigns, `unset`s, or runs any
       PowerShell `env:` or variable deletion/mutation (`Remove-Item`/
       `Clear-Item`/`Set-Item`/`New-Item`/`Rename-Item`/`Move-Item`/
       `Copy-Item`/`ri`/`cli`/`si`/`ni`/`del`/`rm`/`erase`/`ren`/`rni`/`mv`/
       `mi`/`move`/`cpi`/`cp`/`copy`/`Set-Variable`/`Remove-Variable`/
       `Clear-Variable`/`sv`/`rv`/`clv`/`[Environment]::`/
       `[System.Environment]::`) targeting `USERPROFILE` or `HOME`.
     - In Bash (`bash = true`): accept literal resolved path (unquoted,
       single-quoted, or double-quoted with no `\$`), unquoted/double-quoted
       `$HOME/...` (no `\$`, never inside `'...'`), OR unquoted leading `~/`
       ONLY on inline `GIT_CONFIG_GLOBAL=~/... git ...` or unconditional
       `export GIT_CONFIG_GLOBAL=~/...` (NEVER on `env
       GIT_CONFIG_GLOBAL=~/...`), where for BOTH `$HOME/...` and `~/...`,
       `env.HOME` MUST be **present** (non-empty) and normalize to `<home>`
       and no earlier statement reassigns, `unset`s, runs flagged
       `export`/`declare`/`typeset`/`readonly` on, or strips `HOME`.
     - Any assignment to a different path does not satisfy the check.
   - For each segment whose `programName(tokens[at]) === 'git'`:
     - Walk past `GIT_GLOBAL_OPTS` (including attached `-C<dir>`, `-c<k>=<v>`,
       `--<opt>=<val>`), chaining `env -C <dir>` (when present) and every git
       `-C <dir>` cumulatively against `cwd`, and noting `--git-dir` / unknown
       leading flags.
     - If an unknown leading flag appears before the subcommand (unless sole
       `--version`/`--help`), the first non-option token is in
       `GIT_WRITE_SUBCOMMANDS`, OR `envConfigInjectionActive` is set while
       `gitInfo.subcmd` is outside `GIT_BUILTIN_READ_SUBCOMMANDS`:
       - Check repo-owner scope (using chained `-C`, `--git-dir`/active
         `GIT_DIR`, unknown leading flags failing closed, and `git push`'s
         explicit remote/URL arg if any). If the repo clearly belongs to
         another owner or non-`github.com` host, skip.
       - **Runtime gitconfig check (MUST run BEFORE accepting any
         `GIT_CONFIG_GLOBAL`-satisfied segment):** call `lstatSync` on
         `<pactDir>/gh-app-<provider>.gitconfig`. If it is missing, a symlink,
         or not a regular file (`!isSymbolicLink() && isFile()`), return `{
         decision: 'deny', id: 'identity-gitconfig', reason }` with fixed text:
         `The pinned gitconfig for <provider> is missing or unreadable; run node "$HOME/.pact/tools/gh-app.mjs" setup --provider <provider> (or refresh).`
       - If the gitconfig regular-file check passed AND the segment satisfies
         the `GIT_CONFIG_GLOBAL` check above, skip this segment.
       - **Deny-vs-overwrite gate:** check whether `canOverwrite` is true AND
         the command is a single simple `git` command eligible for safe
         rewriting:
         - Path must contain no control chars, newlines, or NUL (and on `win32`
           must pass `WIN_PATH_BAD`).
         - Restrict `overwrite_ask` on **BOTH** `win32` and POSIX to a **single
           simple `git` command** with `at === 0 && programName(tokens[0]) ===
           'git'` (blocking `time`, `call`, `&`, `timeout`, `mise`, `npx`, etc.):
           zero separators/blocks (`;`, `&&`, `||`, `|`, `&`, `(`, `)`, `{`,
           `}`, newlines, leading `#` comments), zero wrappers (`env`, `cmd`),
           zero non-PowerShell syntax on `win32` (`set `, `VAR=val`), zero
           `$(` anywhere in `command` (even outside double quotes), zero
           overrides/unsets anywhere (`GIT_CONFIG_GLOBAL`,
           `GIT_TERMINAL_PROMPT`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`,
           `--config-env`, `unset`, `export`/`declare`/`typeset`/`readonly`
           flags, `Remove-Item`/`Set-Item`/`Clear-Item`/`New-Item`/
           `Rename-Item`/`Move-Item`/`Copy-Item`/`del`/`rm`/`ri`/`si`/`cli`/
           `ni`/`erase`/`ren`/`rni`/`mv`/`mi`/`move`/`cpi`/`cp`/`copy` on
           `env:`, `Set-Variable`/`Remove-Variable`/`Clear-Variable`/`sv`/
           `rv`/`clv`, `${env:...}`, `[Environment]::`,
           `[System.Environment]::`), and (by inspecting **parsed `git`
           tokens**, never raw whitespace substrings) zero PowerShell
           backticks `` ` `` inside `-c` option keys/values and zero
           `-c <k>=<v>` or `-c<k>=<v>` overriding `credential.*`, `user.*`,
           `author.*`, `committer.*`, `core.askPass`, `include.*`,
           `includeIf.*`, `http.*`, or `url.*` (case-insensitive).
         - On `win32`: escape single quotes as `path.replaceAll("'", "''")` and
           build:
           `$env:GIT_CONFIG_GLOBAL = '<escaped>'; $env:GIT_TERMINAL_PROMPT = '0'; <command>`
         - On POSIX: escape single quotes as `path.replaceAll("'", "'\\''")` and
           build:
           `GIT_CONFIG_GLOBAL='<escaped>' GIT_TERMINAL_PROMPT=0 <command>`
         - If eligible: return `{ decision: 'overwrite_ask', id:
           'identity-git', reason, overwriteCommand }` with fixed `reason`:
           `Setting GIT_CONFIG_GLOBAL for <provider> so git writes use the pinned app.`
         - Otherwise (`canOverwrite` is false — `claude`, `manage_task`,
           `send_command_input`, `codex` — OR command is compound, wrapped, or
           overridden): return `{ decision: 'deny', id: 'identity-git',
           reason }` with fixed text naming the exact PowerShell/POSIX
           `GIT_CONFIG_GLOBAL` + `GIT_TERMINAL_PROMPT=0` prefix using
           `"$env:USERPROFILE/.pact/gh-app-<provider>.gitconfig"` (Windows) /
           `"$HOME/.pact/gh-app-<provider>.gitconfig"` (POSIX).

### Plain-text repo-owner resolution (no `git` subprocess)

- **Step 1 (explicit target slots only — asymmetric prose-flag safety):**
  - If any prior segment before the evaluated `gh` or `git` segment changes
    directories (`cd`, `pushd`, `Set-Location`, `sl`, `chdir`), fail closed
    (`{ match: true }`) in `ownerScope`.
  - For `gh`: inspect `-R`/`--repo` value (separate or attached; last flag
    wins), `gh api` endpoint token (extracted via the shared
    `parseGhApi(restArgs)` helper — where any unknown or non-decomposable flag
    in `parseGhApi` also makes `ownerScope` fail closed `{ match: true }` —
    stripping `?query` and `#fragment` BEFORE checking
    `/^\/?repos\/([^/\s]+)\//` and segments), non-flag positional GitHub URL
    arguments (e.g. `gh pr merge https://github.com/<owner>/<repo>/pull/1`,
    `gh issue close <url>`), positional `<owner>/<repo>` args ONLY on `gh repo`
    subcommands `create` (`<org>/<name>` only), `delete`, `archive`,
    `unarchive`, `edit`, `sync`, and `set-default` (NEVER `fork`, `deploy-key`,
    `autolink`, or `rename`), `--owner` on `gh project`, and `GH_REPO` (ONLY
    from `env.GH_REPO`, inline `GH_REPO=... gh ...`, or an unconditional
    top-level 2-token `export GH_REPO=...` in Bash or literal `$env:GH_REPO =
    "..."` in PowerShell, rejecting unexported Bash `GH_REPO=...; gh ...`,
    rejecting `$`, `$(`, `%`, or `` ` `` inside PowerShell `$env:GH_REPO`,
    applying all Step 4 disqualifiers, and letting empty `GH_REPO=` /
    `$env:GH_REPO = ''` / `$null` overwrite and clear any earlier `GH_REPO`
    assignment before returning no target).
  - **Prose-flag exemption rule (fail closed if ambiguous):** An explicit owner
    target (`pin.owner.login`) found in any slot guards (`{ match: true }`).
    Conversely, `-R`/`--repo`, `--owner`, or a positional URL / `<owner>/<repo>`
    may **exempt** (`{ match: false }`) ONLY when it appears BEFORE any
    unrecognized flag (never after `-b`, `-t`, `-n`, `-d`, `--body`, etc.) and
    agrees with all other explicit targets; otherwise fail closed (`{ match:
    true }`).
  - **Shorthand & `gh api` endpoint validation:**
    - `[host/]owner/repo` shorthand in `-R`/`GH_REPO` must validate strictly as
      2 segments (`owner/repo`, `owner` matching `LOGIN_RE`, no `.`/`..`) or 3
      segments (`host/owner/repo`, `host` matching strict DNS `HOST_RE` after
      stripping trailing dots, `owner` matching `LOGIN_RE`, no `.`/`..`), else
      return `{ match: true }`.
    - For `gh api` `repos/<owner>/...`: strip `?query` and `#fragment` BEFORE
      checking segments; reject ANY `%` (percent-encoding such as `%2e%2e` or
      `%61`), `.`, or `..` anywhere in the endpoint path (`{ match: true }`); if
      captured `<owner>` is `{owner}` or `:owner`, fall through to Step 2
      (`cwd`) instead of exempting; if it fails `LOGIN_RE`, return `{ match:
      true }`. Validate `--hostname` across both global and `api` slots against
      `HOST_RE` (all agreeing, failing closed on empty/malformed hostnames).
  - Precedence: explicit command-line targets (`-R`/`--repo`, `gh api
    repos/...`, positional URL/`owner/repo`, `git push` positional
    `<repository>` overriding `--repo`) override `GH_REPO`, which overrides Step
    2 `cwd`.
  - For `git push`: skip ONLY `GIT_PUSH_VALUE_FLAGS` (`-o`/`--push-option`,
    `--receive-pack`, `--exec`, `--repo`, plus the `=`-only and no-arg boolean
    push flags — failing closed `{ match: true }` on any unknown `-...` push
    flag) before reading the positional `<repository>` token (`<repository>`
    overrides `--repo` if both are present; if `<repository>` looks like a URL,
    parse it, else record the remote name for Step 2).
  - **URL parsing & host normalization:**
    - Parse `http(s)://` and `ssh://` URLs with `new URL(...)` using
      `u.hostname` (never `u.host`, so explicit ports like `:443` never bypass
      GitHub detection; reject parse errors, raw `//` in the URL path, any `%`,
      any `.`/`..` segment, or fewer than 2 path segments `<owner>/<repo>` as
      `{ match: true }`), and SCP-style remotes with
      `/^[^@/\s]+@([^:@/\s]+):([^/\s]+)/` (so `https://@github.com/...` and
      `https://a@b@github.com/...` are never misclassified as non-`github.com`,
      also rejecting raw `//`, `%`, `.`/`..` segments, or `< 2` path segments on
      SCP remotes).
    - Validate EVERY extracted GitHub owner (including SCP-style remotes)
      against `LOGIN_RE`, else return `{ match: true }`.
    - Normalize hosts with `host.toLowerCase().replace(/\.+$/, '')`, treating
      `'github.com'` and any subdomain `'*.github.com'` (`host === 'github.com'
      || host.endsWith('.github.com')`) as GitHub.
  - If the winning explicit target resolves to a non-GitHub host or a GitHub
    owner other than `pin.owner.login` (case-insensitive): return
    `{ match: false }`.
  - If an explicit target resolves to `pin.owner.login` or fails to parse:
    return `{ match: true }`.
- **Step 2 (plain-text `.git/config`):**
  - If `--git-dir`, `env.GIT_DIR`, an active inline/earlier `GIT_DIR`
    assignment, `--config-env`, `--exec-path`, active `GIT_CONFIG` /
    `GIT_CONFIG_COUNT` / `GIT_CONFIG_PARAMETERS` / `GIT_COMMON_DIR`, any `-c`
    option touching `remote.*`, `branch.*`, `url.*`, `include.*`, or
    `includeIf.*` (case-insensitive), or any unknown leading `env` or `git` flag
    is present, return `{ match: true }` (fail closed).
  - If `cwd` is absent, non-string, not an absolute path, or (on `win32`) does
    not match `/^[A-Za-z]:[\\/]/` (rejecting drive-less `\foo` which
    `path.isAbsolute` accepts on Windows), NEVER fall back to `process.cwd()` —
    return `{ match: true }` (fail closed).
  - Chain `env -C <dir>` (when present) and all `git -C <dir>` arguments
    cumulatively from `cwd` via `resolveNoSymlinks` to compute `targetDir`.
  - **Root-down network-path and symlink/junction guard:** define
    `resolveNoSymlinks(baseAbs, rawPath)` (never calling lexical
    `path.resolve` before checking `..` so `symlink/..` cannot collapse):
    - Reject empty `rawPath`. Before ANY `fs` call, reject UNC/network/device
      paths (`/^[\\/]{2}/`, `\\?\`, `\\.\`, `\??\`), Windows drive-relative
      paths (`/^[A-Za-z]:(?![\\/])/`), and (on `win32`) single-leading-slash
      drive-less paths (`/^[\\/]/` — every `win32` absolute path must match
      `/^[A-Za-z]:[\\/]/`) on `cwd`, every `-C`/`env -C`, `gitdir:`, and
      `commondir` -> return `{ match: true }`.
    - Walk `rawPath` component-by-component from the filesystem/drive root (if
      absolute) or verified `baseAbs` (if relative): skip `.`; on `..`, verify
      the current directory with `lstatSync` (`!isSymbolicLink() &&
      isDirectory()`) BEFORE popping a segment; and on every named segment call
      `lstatSync` (`!isSymbolicLink()`, and `isDirectory()` for every non-leaf
      segment) BEFORE descending.
    - Enforce `resolveNoSymlinks` on `cwd`, each chained `-C`/`env -C` step,
      every upward `.git` probe directory and `.git` itself, resolved `<gitdir>`
      (whether relative or absolute/cross-drive), `<common>` (whether relative or
      absolute/cross-drive — where ONLY `ENOENT` on `commondir` falls back to
      `<gitdir>`, while any symlink, non-regular file, or other error returns
      `{ match: true }`), and every leaf file (`!isSymbolicLink() && isFile()`)
      BEFORE calling `realpathSync` (checked non-UNC) or bounded
      `openSync`/`readSync` (`1048577` bytes = `1 MiB + 1`, failing closed
      `{ match: true }` if bytes read `> 1048576`). Never spawn `git`. Any
      symlink, junction, UNC/device/drive-relative/drive-less path, oversize
      file, or read error returns `{ match: true }`.
  - Walk upward from `targetDir` to the filesystem root for `.git` (continuing
    upward ONLY when `<dir>/.git` fails `lstatSync` with `ENOENT`; any symlink or
    other error such as `EACCES`, `ELOOP`, or `ENOTDIR` returns `{ match:
    true }`; reaching the filesystem root with no `.git` found also returns
    `{ match: true }` fail closed):
    - Directory `.git`: `<common> = <dir>/.git`, `<gitdir> = <dir>/.git`.
    - Regular file `.git`: read first line `gitdir: <p>`, resolve `<p>` against
      `<dir>` via `resolveNoSymlinks` to `<gitdir>`, `lstatSync`
      `<gitdir>/commondir` (`ENOENT` -> `<common> = <gitdir>`; regular
      non-symlink file -> resolve against `<gitdir>` via `resolveNoSymlinks` to
      `<common>`; else fail closed `{ match: true }`).
    - Read `<common>/config`. Read `<gitdir>/config.worktree` ONLY when
      `<common>/config` sets `[extensions]` `worktreeConfig` to a Git truthy
      value (bare `worktreeConfig` with no `=`, or `true`, `yes`, `on`, `1`,
      case-insensitive).
  - Parse INI section headers and keys case-insensitively:
    - If `<common>/config` or `config.worktree` contains any `[include]` or
      `[includeIf ...]` section, or any `[url "..."]` `insteadOf` or
      `pushInsteadOf`, return `{ match: true }` (fail closed).
    - If `git push` omits an explicit remote name/URL, fail closed
      (`{ match: true }`) whenever the config defines any remote other than
      `"origin"`, or sets `remote.pushDefault`, `branch.*.remote`, or
      `branch.*.pushRemote`.
    - For `gh` commands using Step 2: if the config defines any remote besides
      `"origin"` or sets `gh-resolved`, fail closed (`{ match: true }`) unless
      EVERY defined remote has at least one `url` and EVERY `url` clearly
      resolves to a non-owner / non-GitHub host (a remote with no `url` fails
      closed `{ match: true }`).
    - Target remote `<target>` (`git push`'s explicit remote name if non-URL,
      else `"origin"`):
      - For `gh` commands: collect ONLY `url` values under `[remote "<target>"]`
        (NEVER `pushurl`).
      - For `git push`: collect `pushurl` values under `[remote "<target>"]`
        if any, else `url` values.
      - For all other `git` writes: collect `url` (and `pushurl` if present).
    - If there are no URLs, or ANY URL fails to parse, or ANY URL resolves to
      GitHub (`github.com` / `*.github.com`) + `pin.owner.login`
      (case-insensitive): return `{ match: true }` (fail closed).
    - Only if at least one URL exists and EVERY URL clearly resolves to a
      non-GitHub host or a GitHub owner other than `pin.owner.login`:
      return `{ match: false }`.

## S4 Per-harness wrappers

Every wrapper adds `'pin'` to its closed `FAILURES` list and never echoes
command text, `.git/config` contents, remote URLs, `github.json` fields, or
raw error messages in `reason`, `deny`, or failure outputs (`overwrite.CommandLine`
is emitted only on Antigravity `run_command` to supply the rewritten command).

- **`claude/guard/claude.mjs` (new):**
  - Enforces the same stdin byte cap (`COMMAND_MAX` + envelope overhead,
    matching `antigravity.mjs`/`codex.mjs`) and strict UTF-8 JSON parsing.
  - Validates plain-object root, `tool_name === 'Bash' || tool_name ===
    'PowerShell'`, plain-object `tool_input`, `typeof tool_input.command ===
    'string'`, and optional `typeof input.cwd === 'string'` (any mismatch
    throws `GuardFailure('call')`).
  - Passes `tableFile: new URL('./rules.json', import.meta.url)` and
    `shell: input.tool_name === 'PowerShell' ? 'powershell' : 'bash'` to
    `guard.answerCall({ command: input.tool_input.command, provider: 'claude',
    cwd: typeof input.cwd === 'string' ? input.cwd : undefined, canOverwrite:
    false, env: process.env, tableFile, shell })`, enforcing both `gh` writes
    and `git` override/unset checks while skipping cleaner rules.
  - On `deny`: writes
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`
    to stdout, exits 0.
  - On `null`: writes nothing, exits 0.
  - On any failure: writes the same `PreToolUse` `deny` JSON with
    `The pact's guard failed (<code>); run the pact's dry run.` and exits 0.
- **`claude/guard/antigravity.mjs` (updated):**
  - Resolves `cwd` ONLY for `call.name === 'run_command'`: when `call.args !==
    undefined && Object.hasOwn(call.args, 'Cwd')`, pass `typeof call.args.Cwd
    === 'string' ? call.args.Cwd : undefined` directly to `answerCall` (do NOT
    fall back to `input.cwd` or `workspacePaths` when `Cwd` is present as `""`
    or relative `"./sub"`, so it fails closed); otherwise use `typeof input.cwd
    === 'string' ? input.cwd : (Array.isArray(input.workspacePaths) &&
    input.workspacePaths.length === 1 && typeof input.workspacePaths[0] ===
    'string' ? input.workspacePaths[0] : undefined)` (so multi-root workspaces
    with `workspacePaths.length > 1` fail closed instead of guessing `[0]`).
    For `manage_task` (`send_input`) and `send_command_input`, passes `cwd:
    undefined` (so background task `.git/config` scoping fails closed while
    explicit `-R Stranger/repo` targets still exempt in Step 1).
  - Passes `provider: 'antigravity'`, `cwd`, `canOverwrite: call.name ===
    'run_command'`, `env: process.env`, `shell: call.name === 'run_command' ?
    (process.platform === 'win32' ? 'powershell' : 'bash') : 'unknown'`.
  - On `met.decision === 'overwrite_ask'`: writes
    `{"decision":"force_ask","reason":met.reason,"overwrite":{"CommandLine":met.overwriteCommand}}`
    and exits 0. Never emits `"allow"`. (If the post-T2 live probe shows
    `force_ask` drops `overwrite` or fails to prompt, switch to `deny` with
    the actionable prefix.)
  - On `met.decision === 'deny'` with `met.reason`: uses `met.reason`; for
    cleaner rules (no `met.reason`), keeps the existing fixed `SAYS` text.
  - On `met.decision === 'ask'` (cleaner override): keeps `force_ask` unchanged.
- **`claude/guard/codex.mjs` (updated):**
  - Passes `provider: 'codex'`, `cwd: typeof input.cwd === 'string' ? input.cwd
    : undefined`, `canOverwrite: false`, `env: process.env`,
    `shell: process.platform === 'win32' ? 'powershell' : 'bash'`.
  - On `met.decision === 'deny'`: writes `met.reason` (when present) else the
    existing `The pact's guard blocks this command (rule <id>).` to stderr and
    exits 2.
  - Cleaner `ask` stays unchanged (`This needs the owner: ask them to run it in
    a terminal.`, exit 2).

## S5 Installer, Seam A and rendered rules

### Guard switches, copy set, and hardened Claude Code hook (`gate/install-core.mjs`, `gate/install-run.mjs`, `gate/seam-a-core.mjs`)

- `switches` in `gate/install-run.mjs` collects `'cleaner'` when
  `toolsOn.includes('cleaner')` and `'agent-identity'` when
  `core.identitySwitchOn(parsed)`.
- `GUARD_SCRIPTS` in both `gate/install-core.mjs` and `gate/seam-a-core.mjs`
  becomes `['guard', 'claude', 'codex', 'antigravity']`.
- **Guard copy set, Seam A, and `.cmd` launchers (`builtParts`, `harnessArg`,
  `expectedCopySet`, `seam-a-core.mjs`, `install-run.mjs`):**
  - Keep `builtParts(h).guard` strictly for `GUARD_FORMATS` (`codex`,
    `antigravity`) so `wired` and `harnesses.own` work without breakage, and
    keep `settings: h.id === 'claude' && h.hooks?.format === 'claude'`.
  - `wired` (`codex`, `antigravity`, and `harnesses.own` with guard format)
    activates whenever `switches.length > 0` (`cleaner` or `agent-identity`).
  - `claudeGuardOn` activates whenever `claude` is taken and
    `switches.includes('agent-identity')`.
  - `guardOn = wired.length > 0 || claudeGuardOn`.
  - When `guardOn` is true, `expectedCopySet` (`gate/install-core.mjs:1025`)
    uses the single signature
    `expectedCopySet(stagedRels, commands = [], tools = [], compact = false,
    harnesses = [], guard = false, claudeGuard = false)` with
    `const guarded = (guard && parts.some(p => p.guard)) || (claudeGuard &&
    parts.some(p => p.id === 'claude'))`, and `seam-a-core` (updating
    `GUARD_SCRIPTS` in both `gate/install-core.mjs:87` and
    `gate/seam-a-core.mjs:75`) stages and copies all 4 `GUARD_SCRIPTS`
    (`guard.mjs`, `claude.mjs`, `codex.mjs`, `antigravity.mjs`) into
    `.pact/guard/` (preserving existing behavior in
    `gate/tests/guard-install.test.mjs:144` and `gate/tests/guard.test.mjs:461`).
    Windows `.cmd` launchers are written ONLY for active guarded harnesses
    (`claude.cmd` when `claudeGuardOn` — even when `wired` is empty — plus
    `codex.cmd`/`antigravity.cmd` for active `wired` formats).
  - `harnessArg(harnesses, { guard: wired.length > 0, claudeGuard:
    claudeGuardOn })` adds `guard` to `claude` ONLY when `claudeGuardOn` is
    true and to `wired` harnesses when `wired.length > 0`; `seam-a-core.mjs`
    continues checking `parts.some(p => p.guard)` for both `claude`-only and
    `harnesses.own` installs.
- **Hardened Claude Code `PreToolUse` launcher (`guardLauncherText`,
  `claudeGuardHookEntry`, `claudeGuardPlan`, apply ordering):**
  - Extend `LAUNCH_ANSWERS` in `gate/install-core.mjs` with `claude`:
    `echo {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The pact's guard could not start; run the pact's dry run."}}`
    + `exit /b 0`.
  - On `win32`, `install-run.mjs` writes `.pact/guard/claude.cmd` using
    `guardLauncherText('claude')` (setting `ERRORLEVEL=`, `NODE_OPTIONS=`,
    `NoDefaultCurrentDirectoryInExePath=1`, `call node "%~dp0claude.mjs"`).
  - `claudeGuardHookEntry({ script, platform, systemRoot })` validates paths
    with the same `WIN_PATH_BAD`/`WIN_PATH_UNQUOTED_BAD` (on `win32`) or
    absolute/no-control-char (on POSIX) checks as `guardCommand`, and produces:
    - Windows (`win32`): `{ "type": "command", "command": "<SystemRoot>\\System32\\cmd.exe", "args": ["/d", "/c", "call", "<home>\\.pact\\guard\\claude.cmd"], "timeout": 15 }`
    - POSIX: `{ "type": "command", "command": "/usr/bin/env", "args": ["-u", "NODE_OPTIONS", "node", "<home>/.pact/guard/claude.mjs"], "timeout": 15 }`
  - `claudeGuardPlan` merges one `PreToolUse` group `{ "matcher":
    "Bash|PowerShell", "hooks": [entry] }` into `~/.claude/settings.json`
    **independently of `auto-compact-window`** (works identically when
    `auto-compact-window: 0`; turning `agent-identity` off leaves
    `compact-handoff` hooks untouched, and turning `auto-compact-window` off
    leaves `PreToolUse` untouched). To treat a live group as already in place,
    require BOTH `group.get('matcher') === 'Bash|PowerShell'` AND
    `isClaudeGuardHook`. Following `guardMerge`'s shared-group rule, if a live
    `PreToolUse` group holds BOTH a pact hook AND user hooks under a mismatched
    `matcher`, strip the pact hook from that group (leaving the user hooks and
    their `matcher` untouched) and append a fresh `{ "matcher":
    "Bash|PowerShell", "hooks": [entry] }` group.
  - Refuses (`hooks-shape`) if live `hooks` is present and not a map, or if
    live `hooks.PreToolUse` is present and not an array (never silently skips).
  - Recognizes the pact's entry via `isClaudeGuardHook(h, claudeGuardKey,
    platform)` (validating `isMap(h) && h.size === 4`, `type === 'command'`,
    `timeout` raw `'15'`, exact `command`, and exact `args` prefix `['/d', '/c',
    'call']` on `win32` / `['-u', 'NODE_OPTIONS', 'node']` on POSIX +
    normalized `pathKey` on the script/launcher arg) while leaving all user
    `PreToolUse` hooks (such as an external `identity-guard.mjs`) untouched.
  - Updates `liveSettingsLines` so `PreToolUse` hooks matching
    `isClaudeGuardHook` draw no false "hook the pact did not install" warning
    ONLY when `claudeGuardOn` is true (regardless of `compact.script`, while
    lingering `claude.cmd` hooks when `agent-identity` is off still draw a
    warning), and user hooks in `PreToolUse` continue to warn normally.
  - Records the full `{ matcher, hooks: [entry] }` group in `settingsEntries`
    as `hooks.PreToolUse` (independently of `window > 0`), and updates
    `entryDrift` for `hooks.PreToolUse` using `guardDrift`-style subset matching
    (verifying the expected `{ matcher: "Bash|PowerShell", hooks: [entry] }`
    group is present in live `hooks.PreToolUse`, catching edits to `"matcher"` as
    drift while never failing on user-added `PreToolUse` groups).
  - Keep `'PreToolUse'` **out** of `HOOK_EVENTS` (so `hooksPlan`'s compact-overlay
    non-map `skipped` branch at `gate/install-core.mjs:1522` is unaffected) and
    handle `'PreToolUse'` solely in `claudeGuardPlan` + `mergeSettings`, print
    `hook PreToolUse: added|updated|removed` under `== claude ==` in
    `install-run.mjs` outside `if (identityOn)` (so `PreToolUse: removed` prints
    when turning `agent-identity` off), write updated `settings.json` **BEFORE**
    deleting `.pact/guard/claude.cmd`/`claude.mjs`/`guard.mjs`/`rules.json`
    when removing `PreToolUse` (refreshing `entriesNow` for `hooks.PreToolUse`
    before `p.delete` writes `.pact/install.json`, while adding `PreToolUse`
    remains after `changed` so `claude.cmd` exists first), keep the existing
    corrupt-settings `WARN` line in dry run when `liveSettings === null`, and
    run post-apply `PreToolUse` `entryDrift` only when `liveSettings !== null
    && claudeGuardOn`.
- **Rule table and dry-run output:**
  - `rules.json` is written by `guardTableText(rules, identity)` whenever
    `guardOn` is true (`{ "rules": [...] }` byte-identical when
    `agent-identity` is off; `{ "rules": [...], "identity": { "enabled": true,
    "posterOn": <boolean> } }` when on).
  - Exact dry-run `Guard rules` line formats:
    - `cleaner` alone: existing line unchanged (`Guard rules (.pact/guard/rules.json): worktree-remove (deny), ..., cleaner-override (ask)`).
    - `agent-identity` alone (with non-Claude harness): `Guard rules (.pact/guard/rules.json): identity-gh (deny), identity-git (overwrite-ask/deny)`.
    - `agent-identity` alone (`claude`-only): `Guard rules (.pact/guard/rules.json): identity-gh (deny)`.
    - Both switches on: cleaner rules followed by `, identity-gh (deny)` (and `, identity-git (overwrite-ask/deny)` when a non-Claude harness is wired).
  - Never prints owner or bot logins from `github.json`.
  - Update `TOOL_WARNS['gh-app']` in `gate/install-core.mjs` (and its copy in
    `docs/install.md`) to reflect cross-harness identity guarding.
- **Install-time pin checks:** Claude Code's existing `identityChecks()`
  (`pin.apps.claude` + `gh-app-claude.gitconfig`) stays untouched; align
  `identityPinApp` (`gate/install-core.mjs:1932,1940`) with `gh-app.mjs:readPin`
  (no BOM stripping, lowercase `SLUG_RE`) so an install cannot pass with a pin
  `guard.mjs` rejects. Non-Claude harnesses skip install-time pin checks (S2
  item 6).

### Rendered session guidance (`claude/CLAUDE.md`, `harnesses/known.json`, `gate/`, `builder/`)

- Add `'settings-env'` (distinct from the existing `'identity-env'` refusal
  code in `gate/install-run.mjs:428`) to `CAPABILITIES` in `gate/harnesses.mjs`
  and to `claude`'s `capabilities` list in `harnesses/known.json`.
- In `claude/CLAUDE.md` under `## How the agent helps`, insert **immediately
  after** `tool-cleaner`'s closing `<!-- pact:end -->` (`claude/CLAUDE.md:46`,
  preserving `gate/tests/builder-page.test.mjs:1337`):
  ```markdown
  <!-- pact:unless settings-env -->
  <!-- pact:begin tool-gh-app -->
  <!-- pact:end tool-gh-app -->
  <!-- pact:end -->
  ```
- In `gate/render-core.mjs`:
  - Add `'tool-gh-app'` to `OPEN_MARKS` (not `EDITABLE`).
  - Remove `'gh-app'` from `TOOLS_WITHOUT_PART`.
  - Add `'gh-app'` to `TOOL_PARTS` with `mark: 'tool-gh-app'` and `template`
    declared as a **single-quoted JS string literal** inside
    `Object.freeze(['...'])` (so `builder/build.mjs` `templateLines` parses it):
    `- **Use your pinned GitHub App:** set \`GIT_CONFIG_GLOBAL\` to \`"$env:USERPROFILE/.pact/gh-app-__PACT_PROVIDER__.gitconfig"\` (POSIX: \`"$HOME/.pact/gh-app-__PACT_PROVIDER__.gitconfig"\`) and \`GIT_TERMINAL_PROMPT=0\` on git writes, and run GitHub writes through \`"$HOME/.pact/tools/poster.mjs"\` (when on) or \`node "$HOME/.pact/tools/gh-app.mjs" gh --provider __PACT_PROVIDER__\`.`
    (Explicitly uses double-quoted `"$env:USERPROFILE/..."` / `"$HOME/..."`
    because Windows PowerShell passes `~` literally to native `node.exe`.)
- In `gate/harness-render.mjs`: strip the `tool-gh-app` block for harnesses with
  `'settings-env'` (`claude`) and for custom `harnesses.own` entries whose `h.id`
  is not in `PROVIDERS` (`['claude', 'codex', 'antigravity']`); for
  non-`settings-env` known providers (`codex`, `antigravity`), replace
  `__PACT_PROVIDER__` with `h.id` after `blocksFor`. Note per Codex CLI
  `0.172.0` source, `32768` is `project_doc_max_bytes` for project docs with
  global `AGENTS.md` added separately (keep the rendered rule compact either
  way). Leaving `claude`'s rendered `CLAUDE.md` byte-for-byte unchanged compared
  to the pre-change render with the same `agent-identity` setting, and empty
  for every harness when `agent-identity` is off.
- In `builder/build.mjs` and `builder/scriptorium.html`:
  - In `builder/build.mjs`, add `'tool-gh-app'` to `rulesText` (`[Only while
    agent-identity is on, under Settings:]`) and to `harnessData.templates`.
  - In `builder/scriptorium.html`, update `configuredRules` (line 7414) to set
    `fill['tool-gh-app'] = templates['tool-gh-app']` when
    `set[PACT.identitySwitch.name] === true`, and update the Settings `Agent
    identity` description (line 9259) to describe cross-harness guarding before
    running `node builder/default-config.mjs` and `node builder/build.mjs`.
- Update test helpers/expectations in `gate/tests/text.mjs` (`OPEN_MARKS`,
  `forClaude` stripping `settings-env`), `gate/tests/harnesses.test.mjs`,
  `gate/tests/render-config.test.mjs`, `gate/tests/builder-page.test.mjs`,
  `gate/tests/guard-install.test.mjs`, and `gate/tests/guard.test.mjs`.

## S6 Documentation updates

- `claude/review.md`:
  - Change `run gh-app.mjs status` to `run gh-app.mjs status --provider
    <provider>` (naming `claude`, `codex` or `antigravity`).
  - Update lines 372–374 (`Assigning is the one exception...`) to state that
    assigning runs through `node ~/.pact/tools/gh-app.mjs gh --provider
    <provider> -R <owner>/<repo> -- issue/pr edit <n> --add-assignee <owner>`
    naming the owner's login explicitly (`@me` resolves to the app).
- `AGENTS.md`:
  - Update `The tracker` (`--add-assignee '@me'`) so that while an agent app is
    pinned, assigning uses `gh-app.mjs gh --provider <provider> -R
    mephistopheles4/the-pact -- issue/pr edit <n> --add-assignee <owner>`
    naming the owner's login explicitly.
- `docs/agents/agent-apps.md`:
  - Add `--provider <provider>` on `gh-app.mjs status`.
  - Update "Posting and assigning" to match explicit-login `--add-assignee
    <owner>` via `gh-app.mjs gh`.
- `docs/agents/work-records.md`:
  - Update lines 10–14 (`gh issue edit`/`gh pr edit` assigning and
    unassigning with `'@me'`) to instruct `gh-app.mjs gh --provider <provider>
    -R <owner>/<repo> -- issue/pr edit <n> --add-assignee <owner>` /
    `--remove-assignee <owner>` while an agent app is pinned.
- `docs/agent-identity.md`:
  - Add `--provider <provider>` on `setup` and `status` examples.
  - Document cross-harness identity guarding (`claude.mjs` hardened launcher,
    `antigravity.mjs` `overwrite` + `force_ask` with `deny` fallback,
    `codex.mjs` `deny` fallback), runtime pin + gitconfig checks, and the
    rollback order (turning `agent-identity` off at the newer commit first).
- `docs/install.md`:
  - Update "The guard in Codex and Antigravity" to reflect activation under
    `cleaner` OR `agent-identity`, Claude Code's `PreToolUse` entry in
    `settings.json`, updated `TOOL_WARNS['gh-app']` copy, and rollback / undo
    steps matching `guard-install.test.mjs`.
- `docs/rule-reasons.md`:
  - Add one row for `Use your pinned GitHub App` naming the gap no guardrail
    covers (non-env harnesses lack `settings.json` `env`, so without a turn-1
    rule sessions only discover the exact gitconfig and `gh-app.mjs` routes
    after hitting a hook).
- `docs/reference.md`:
  - Update the `claude/guard/` table row to include Claude Code's identity
    guard wrapper (`claude.mjs` and Windows launcher `claude.cmd`).
- `docs/threat-model.md`:
  - Update **Text into a session** (Controls): guard now runs across Claude
    Code, Codex, and Antigravity under `cleaner` or `agent-identity`, including
    `overwrite` + `force_ask` on Antigravity `run_command`.
  - Update **Code that runs** (Crosses & Controls): `claude.mjs` runs via the
    same hardened Windows launcher / `env -u NODE_OPTIONS` control as Codex and
    Antigravity; plain-text `.git/config` / `gitdir` / `commondir` reads from
    untrusted clones reject UNC paths and symlinks and spawn no `git`.
  - Update **What leaves the machine** (Controls & `Who counts as you`
    residual): cross-harness `identity-gh` and `identity-git` speed bumps, plus
    explicit owner-accepted residuals for unpinned non-Claude provider
    pass-through (S2 items 6–7), exempt `gh run`/`gh workflow` writes (S2 item
    11), `git pull` exclusion (S2 item 9), and `~/.gitconfig` `author.*`
    inheritance (`docs/agent-identity.md`).

## S7 Threat model and security invariants

- **Boundaries touched:** `Text into a session` (PreToolUse guard hooks),
  `Code that runs` (`claude.mjs` hardened launcher and plain-text `.git/config`
  reading), `Merges and installs` (`settings.json` `PreToolUse` merge,
  `entryDrift` matcher verification, and `rules.json` schema), and `What leaves
  the machine` (`git` and `gh` writes).
- **Invariants:**
  1. `antigravity.mjs` never emits `decision: "allow"`; `overwrite` is only
     ever paired with `decision: "force_ask"` (and falls back to `deny` if the
     post-T2 live probe shows `force_ask` drops `overwrite` or fails to
     prompt).
  2. Precedence: `cleaner` `deny`/`ask` and `gh` `deny` always beat `git`
     `overwrite_ask`.
  3. Zero subprocesses in `cwd`, zero network paths, zero symlinks:
     `.git/config`, `gitdir:`, `commondir`, and `config.worktree` reject
     UNC/network/device paths (`/^[\\/]{2}/`, `\\?\`, `\\.\`, `\??\`) and
     Windows drive-relative paths (`/^[A-Za-z]:(?![\\/])/`, plus drive-less
     `\foo` `cwd` by requiring `/^[A-Za-z]:[\\/]/` on `win32`) before any
     `fs` call, enforce `resolveNoSymlinks` segment-by-segment `lstatSync`
     non-symlink checks BEFORE collapsing any `..` on `cwd`, each chained
     `-C`/`env -C` step, every `.git` probe dir/`.git`, `<gitdir>`, `<common>`,
     and every leaf file (`!isSymbolicLink() && isFile()`) BEFORE calling
     `realpathSync` (checked non-UNC), and fail closed on reads exceeding `1
     MiB` (`1048577` byte read; `65537` byte read for `64 KiB` `github.json`).
  4. No leakage in `reason`, `deny`, or failure outputs: command arguments,
     `.git/config` contents, remote URLs, `github.json` logins/IDs, and raw
     error messages are never interpolated into any `reason`, `deny`, or
     failure output across all three wrappers. `overwrite.CommandLine` carries
     the rewritten command only on Antigravity `run_command` (with T5 checking
     that Antigravity does not leak it outside command execution).
  5. Safe command rewriting: `overwriteCommand` uses shell-specific single-quote
     escaping (`''` on PowerShell, `'\''` on POSIX), rejects unsafe paths
     (`WIN_PATH_BAD`/control chars), and falls back to `deny` whenever
     `<command>` contains any override/unset of `GIT_CONFIG_GLOBAL`,
     `GIT_TERMINAL_PROMPT`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`,
     `-c credential.`/`-c user.`, non-PowerShell syntax on `win32`, or
     compound/multiline/comment-leading syntax on POSIX.
  6. Fail-closed on corrupt/symlinked `github.json` (`pin` code), missing or
     unreadable `gh-app-<provider>.gitconfig` (`identity-gitconfig` deny),
     missing/non-absolute `cwd`, `--git-dir`/`GIT_DIR`, `insteadOf` rewrites,
     and unreadable/absent remotes.
  7. Hardened invocation across all three harnesses: `claude.mjs`, `codex.mjs`,
     and `antigravity.mjs` all clear `NODE_OPTIONS` and avoid `cwd` `node`
     lookup on Windows.
  8. Speed bump, not a hard boundary: as ADR 0175 states, the guard catches
     session mistakes and slips, not a hostile local process.
- **Explicit residual paths (Owner's call: security checkpoints):**
  - `gh run` and `gh workflow` writes stay exempt under the owner's `gh` login
    until `CLAIM_PERMISSIONS` gains `actions: write` (`PACT-95`).
  - Unpinned non-Claude providers pass through silently at runtime (`S2` items
    6–7).
  - `git pull` is excluded from `GIT_WRITE_SUBCOMMANDS` (`S2` item 9;
    `git push` stays guarded).
  - Antigravity `overwrite` + `force_ask` remains unverified until the post-T2
    live probe (automatic fallback to `deny`).
- **Accepted speed-bump parser & harness residuals (ADR 0175, not chased past
  design convergence):**
  - Nested shell wrappers (`bash -c`, `pwsh -Command`, `cmd /c`, `command`,
    `nohup`, `Start-Process`), PowerShell Unicode smart quotes (`\u2018-\u201e`),
    Bash mid-word `\\\r?\n` continuations, quoted heredoc delimiter whitespace,
    and `gh api repos/<stranger>/<repo>/forks`.
  - Exotic cross-shell/nested-quoting parser polyglots (nested backticks pairing
    escaped double/single quotes across subshells, `case` appearing as a pattern
    word inside `"$(...)"`, and `$(! case ...)` inside arithmetic `((...))`).
  - Harness-level spawn/timeout fail-open semantics (Codex CLI `0.172.0` and
    Claude Code POSIX when `node` fails to spawn or hits the 15 s timeout;
    Codex remote-command host `cwd`).

## S8 Trade-offs

| Pull | Side taken | Driver |
| --- | --- | --- |
| Antigravity `Overwrite + force_ask` vs uniform `deny` across harnesses | `Overwrite + force_ask` on simple `run_command`, `deny` fallback on compound/shadowed commands, `manage_task`, Codex, or failed probe | Smooth interactive workflow in Antigravity without bypassing permission prompts (headless `agy -p` included) |
| Skip install-time non-Claude pin checks vs refuse unpinned | Skip install checks + runtime pin and gitconfig gate in hooks | One simple config across harnesses without blocking installs before every provider is pinned |
| Plain-text `.git/config` parsing vs spawning `git` | Plain-text parsing with UNC/symlink/size guards | Avoids executing untrusted repo config on the `Code that runs` boundary |
| Exempt `gh run`/`gh workflow` writes vs strict deny | Exempt until `CLAIM_PERMISSIONS` adds `actions: write` (Owner's-call checkpoint) | Keeps CI cancel/rerun usable without widening app permissions in this change |
| Hardened `claude.mjs` launcher vs static `permissions.deny` | Hardened `claude.mjs` (`claude.cmd` on Windows, `env -u NODE_OPTIONS` on POSIX) | Static deny globs cannot print routing reasons, scope by `.git/config`, or check `github.json` at runtime, and bare `node` weakens `Code that runs` |

Business driver: keep all three harnesses under one simple pact configuration
without weakening harness permission prompts; where unspecified, lean to what
is cheaper to reverse.

## S9 Acceptance claims

- **C1 (Rule table):** `guardTableText(rules)` with `agent-identity` off writes
  byte-for-byte the previous `{ rules }` JSON; with `agent-identity` on it
  writes `{ rules, identity: { enabled: true, posterOn } }`; `parseTableDoc`
  enforces a plain-object root with exact allowed keys and throws
  `GuardFailure('table')` on any malformed `identity` block or extra top-level
  key, while `parseTable` preserves backwards compatibility for existing callers.
- **C2 (Runtime pin and gitconfig gate):** default `pinFile` resolves to
  `../github.json` relative to `rules.json` (`<home>/.pact/github.json`,
  verified on `--home` installs) and is read lazily **only** when a candidate
  `gh` or `git` segment (`env -S`/unknown `env` flag included) exists so
  unrelated shell calls (`ls`, repair commands) never fail on a bad pin;
  `identityPinApp` in `gate/install-core.mjs` aligns with `gh-app.mjs:readPin`;
  `lstatSync` `ENOENT` or missing `pin.apps[provider]` passes through silently;
  pinned provider enforces; dangling symlink, non-regular file, BOM, oversize
  (`> 65536` bytes via `cap + 1` read), or any schema mismatch against
  `gh-app.mjs:readPin` (`LOGIN_RE`, `SLUG_RE`, `PROVIDERS`, `isId`,
  `bot_login === "${slug}[bot]"`, exact keys) fails closed with `pin`; for every
  repo-scoped `git` write segment (even when `GIT_CONFIG_GLOBAL` looks
  satisfied), missing or symlinked `gh-app-<provider>.gitconfig` fails closed
  before acceptance and denies with `identity-gitconfig` using
  `"$HOME/.pact/tools/gh-app.mjs"`.
- **C3 (Plain-text repo-owner scoping):** Step 1 fails closed on prior
  directory-changing segments (`cd`/`pushd`/`Set-Location`/`sl`/`chdir`) and
  checks explicit target slots with asymmetric prose-flag safety (`-R`/`--repo`
  last-wins, `gh api` `^/?repos/...` via shared `parseGhApi` propagating unknown/
  non-decomposable flags as `{ match: true }` and stripping `?query`/`#fragment`
  before rejecting `%`/`.`/`..` and falling back on `{owner}`/`:owner`,
  positional `gh` URL/`owner/repo` restricted to `repo` verbs `create`/`delete`/
  `archive`/`unarchive`/`edit`/`sync`/`set-default`, `--owner` rejecting `@me`,
  exported/literal `GH_REPO` with disqualifiers and empty reset, `git push`
  `<repository>` after exact `GIT_PUSH_VALUE_FLAGS` overriding `--repo`) —
  parsing `http(s)://`/`ssh://` via `u.hostname`, validating `--hostname` and
  3-segment `host` against strict `HOST_RE`, normalizing trailing dots and
  `github.com` + `*.github.com`, rejecting raw `//`/`%`/`.`/`..`/`< 2` segments
  (on SCP remotes included), and validating every extracted GitHub owner with
  `LOGIN_RE`; Step 2 fails closed on `--config-env`/`--exec-path`/`-c remote.*`/
  `branch.*`/`url.*`/`include.*`/`includeIf.*`/active `GIT_CONFIG*`, chains
  `env -C` and `git -C` cumulatively via `resolveNoSymlinks` (segment-by-segment
  `lstatSync` BEFORE `..` collapse, requiring `/^[A-Za-z]:[\\/]/` for absolute
  paths and rejecting `/^[\\/]/` on `win32`, `cap + 1` fail-closed reads,
  `ENOENT`-only upward continuation, failing closed `{ match: true }` at root
  with no `.git`), reads standard repos and linked worktrees (`gitdir` +
  `commondir`, plus `config.worktree` when `extensions.worktreeConfig` is bare
  or `true|yes|on|1`), applies multi-remote (all remotes having valid `url`) /
  `gh-resolved` ambiguity checks to both `git push` and `gh`, parses `[remote
  "<target>"]` case-insensitively (`url` only for `gh`; `pushurl` else `url` for
  `git push`) with zero `git` subprocesses, and fails closed on missing/
  non-absolute `cwd`, `--git-dir`/`GIT_DIR`, `[include]`/`[includeIf]`,
  `insteadOf`/`pushInsteadOf`, unknown `git push`/`env`/`git` flags, or missing/
  unreadable remotes.
- **C4 (Plain `gh` write guard):** catches writes across all `GH_READ_VERBS`
  groups, unlisted groups (`auth token`/`login`/`setup-git`, `ssh-key`,
  `gpg-key`, `alias`, `config`, `extension`, `codespace`), `gh auth status`
  with `-t`/`-at`/`--show-token(=|$)`, leading/persistent flags (`gh -R o/r pr
  create`, `gh pr -R o/r create`), and writing `gh api` calls (shared
  `parseGhApi`: glued/`=` flags, multiple `-X` taking last or non-GET/HEAD,
  unknown or non-decomposable bundled flags anywhere before `--` before or
  after `endpoint`, `/graphql`, GraphQL `mutation`, `--input`, and `-F
  ...=@file`); passes closed read verbs, strict `-h` (`['-h']`, `[group, '-h']`,
  `[group, verb, '-h']` excluding `auth`, never `--body -h`), strict `--help`,
  `gh run`/`gh workflow`, `gh-app.mjs gh`, `poster.mjs`, and quoted/heredoc/
  here-string data (with hardened `segmentsOf` `\"`/`\\`/`$'...'`/PowerShell
  `` `` ``/`""`/`''`, `!bash && !started` on `@'`/`@"`, `bash &&` on `<<`,
  heredoc delimiter unquoting, unlimited here-string header scan);
  account-scoped writes (`repo fork` without non-owner `--org`, `repo create`
  without non-owner positional `<org>/<name>`, `deploy-key`/`autolink`/`rename`,
  non-`repos/` `gh api` writes except non-full-URL agreed `HOST_RE` `--hostname`
  != `github.com`/`*.github.com`, `gh project` writes without explicit non-`@me`
  non-owner `--owner`, and `-u`/`--user`/`-o`/`-o<org>`/`--org`/`-nu`
  secrets/variables) stay guarded regardless of `cwd`; static denial reasons
  use `"$HOME/.pact/tools/..."` and follow `posterOn` without interpolating
  `pin.owner.login` or command args.
- **C5 (Plain `git` write guard):** catches `commit`, `push`, `merge`,
  `cherry-pick`, `revert`, `rebase`, `tag`, `am` (including after complete
  `GIT_GLOBAL_OPTS` + `--attr-source`, unknown leading `git` flags, attached
  `-C`/`-c`/`--opt=`, and `env`/`/usr/bin/env`/`env.exe` unknown flags like
  `-P`, strict `-S` fail-closed, `-C`/`-u`/`-i`/`-iu`/`-`/`--`) when
  `GIT_CONFIG_GLOBAL` is absent, unexported (`export -n`, flagged `export`/
  `declare`/`typeset`/`readonly`), shadowed by `-c credential.*`/`--config-env`/
  `GIT_CONFIG_COUNT`/`GIT_CONFIG_PARAMETERS` even when `GIT_CONFIG_GLOBAL` is
  set, inline-disqualified, in commands with trailing/extra args or any non-`;`/
  newline separator (`&&`, `||`, `|`, `&`, `(...)`, `{...}`, or any control
  keyword `if`..`coproc` including `until`/`select`), unquoted in PowerShell,
  passed as `env ~/...`, escaped `` `$ ``/`\$`, missing or mismatched/unset/
  mutated `env.HOME`/`env.USERPROFILE` (applied to `~/...` too), later unset/
  overridden (including `Copy-Item`/`cpi`/`cp`/`copy` `env:`, `Set-Variable`/
  `sv`/`rv`/`clv`, `@"..."@`, `"$(...)"`), or points elsewhere; evaluates Bash
  and PowerShell modes independently with a separator-preserving internal walk
  (honoring optional `shell: 'bash' | 'powershell'` and disabling cross-mode
  exemption on heredocs/here-strings); passes read-only `git`, valid
  unshadowed exact-token assignments (`3` PS / `2` Bash) with verified
  `.gitconfig`, and `claude` normal `git` writes when `env.GIT_CONFIG_GLOBAL`
  matches `<home>/.pact/gh-app-claude.gitconfig` with
  `GIT_TERMINAL_PROMPT=0` while denying `claude` `git` override/unset attempts
  (`identity-git`, `canOverwrite: false`).
- **C6 (Precedence and Antigravity `overwrite`):** `cleaner` `deny`/`ask` and
  `gh` `deny` beat `git` `overwrite_ask` in compound commands; Antigravity
  `run_command` honors explicit `Cwd` without falling back when `""`/relative
  (and fails closed on multi-root `workspacePaths.length > 1`), returning `{
  decision: "force_ask", reason, overwrite: { CommandLine } }` (never `"allow"`)
  ONLY on unambiguous single simple `git` commands with `at === 0 &&
  programName(tokens[0]) === 'git'`, shell-escaped quoting, and zero
  separators/wrappers/overrides/`$(`/PowerShell backticks in `-c`/parsed-token
  `-c credential.|user.|author.|committer.|core.askPass|include.|includeIf.|http.|url.`;
  all compound, wrapped, or overridden commands, `manage_task` (`send_input`),
  `send_command_input`, and Codex `Bash` return `deny` with the actionable
  prefix.
- **C7 (Claude Code wrapper, hardened launcher, and `settings.json` merge):**
  `claude/guard/claude.mjs` validates stdin cap/JSON/fields (`call` on
  mismatch), passes `shell` (`'powershell'`/`'bash'` from `tool_name`) and
  `canOverwrite: false` to `answerCall` (enforcing `identity-gh` and
  `identity-git` overrides/unsets while skipping cleaner rules), answers
  `PreToolUse` in Claude's `hookSpecificOutput` shape, runs
  via `claude.cmd` (`LAUNCH_ANSWERS.claude` added in T2; `cmd.exe` +
  `NoDefaultCurrentDirectoryInExePath=1` + cleared `NODE_OPTIONS` + fail-closed
  denial) on Windows and `/usr/bin/env -u NODE_OPTIONS node` on POSIX, merges
  into `settings.json` via `claudeGuardPlan` + `mergeSettings` (keeping
  `HOOK_EVENTS` untouched) under `agent-identity: true` **independently of
  `auto-compact-window: 0`**, refuses `hooks-shape` on malformed
  `hooks.PreToolUse`, splits shared groups under mismatched `matcher`
  (preserving user hooks and their matcher via `guardMerge`-style logic) without
  false warnings (`isClaudeGuardHook` checks `size === 4` and exact `args`
  prefix, `claudeGuardPlan` requires `matcher === 'Bash|PowerShell'`, and
  `liveSettingsLines` ignores `isClaudeGuardHook` only when `claudeGuardOn`),
  catches `matcher` drift via `guardDrift`-style subset matching in
  `entryDrift`, writes `settings.json` removal (refreshing `entriesNow`) BEFORE
  deleting guard scripts/launchers on turn-off (keeping turn-on after
  `changed`, warning on `liveSettings === null` in dry run while skipping
  post-apply drift), and removes cleanly on `agent-identity: false`.
- **C8 (Multi-harness install, Seam A, and bad-case gate tests):**
  `agent-identity: true` installs all 4 `GUARD_SCRIPTS` (`guard.mjs`,
  `claude.mjs`, `codex.mjs`, `antigravity.mjs` updated in both
  `gate/install-core.mjs` and `gate/seam-a-core.mjs`) when `guardOn` is true
  (with `expectedCopySet` using its single 7-parameter signature), writes `.cmd`
  launchers on `win32` strictly per active guarded harness (`claude.cmd` even
  when `wired` is empty), and merges hooks across active harnesses even with
  `cleaner` off; keeps `builtParts(h).guard` strictly for `GUARD_FORMATS` so
  `wired` and `harnesses.own` work cleanly; Claude's existing install-time
  pin+gitconfig check still runs (and `identityPinApp` matches `readPin`);
  missing non-Claude pins do not block dry run or apply; exact `Guard rules`
  dry-run lines match all 4 switch combinations; `hook PreToolUse: removed`
  prints when turning `agent-identity` off; Seam A checks
  `claude/guard/claude.mjs`; every new gate check family has one planted
  bad-case test.
- **C9 (Rendered session guidance and Scriptorium):** with `agent-identity:
  true`, `codex` and `antigravity` `AGENTS.md` contain the one-line provider
  rule with their harness id and explicit `"$env:USERPROFILE/..."` /
  `"$HOME/..."` syntax (for both gitconfig and `"$HOME/.pact/tools/..."`),
  while `claude` `CLAUDE.md` is byte-for-byte unchanged compared to the
  pre-change render with `agent-identity: true` (`settings-env`), and custom
  `harnesses.own` entries outside `PROVIDERS` strip the block cleanly; with
  `agent-identity: false`, all three rules files are byte-for-byte unchanged
  compared to pre-change renders; `claude/CLAUDE.md` places `tool-gh-app`
  immediately after `tool-cleaner`'s closing `<!-- pact:end -->`; Antigravity
  stays within its `24000`-byte rules cap (Codex global instructions remain
  compact alongside `32768`-byte `project_doc_max_bytes`);
  `TOOL_PARTS['gh-app'].template` uses single-quoted JS string syntax;
  `builder/build.mjs` (`rulesText` and `harnessData`) and
  `builder/scriptorium.html` (`configuredRules` + Settings blurb) preview
  `tool-gh-app` when `agent-identity: true`.
- **C10 (Docs, threat model, and generated files):** `claude/review.md`,
  `AGENTS.md`, `docs/agents/work-records.md`, `docs/agent-identity.md`, and
  `docs/agents/agent-apps.md` carry `--provider <provider>` and explicit-login
  `--add-assignee <owner>` / `--remove-assignee <owner>` via `gh-app.mjs gh`
  (zero plain-`gh` or `'@me'` assigning instructions left while an app is
  pinned); `docs/install.md` documents guard activation on `cleaner` OR
  `agent-identity`, Claude `PreToolUse` merge/rollback matching
  `guard-install.test.mjs`, and updated `TOOL_WARNS['gh-app']`;
  `docs/agent-identity.md` documents cross-harness wrappers, runtime pin +
  gitconfig checks, and rollback order; `docs/rule-reasons.md` and
  `docs/reference.md` are updated; `docs/threat-model.md` updates `Text into a
  session`, `Code that runs`, and `What leaves the machine` (Controls + `Who
  counts as you` residuals); `node docs/toc.mjs --check`, `node
  builder/default-config.mjs`, and `node builder/build.mjs` leave no stale
  generated files.
- **C11 (No leak in reasons/denials and numeric time budget):** no command
  text, `.git/config` URL, `github.json` login/ID, or raw error message appears
  in any `reason`, `deny`, or failure output across all three wrappers
  (`overwrite.CommandLine` carries the rewritten command only on Antigravity
  `run_command`); 1 MiB adversarial inputs complete in `< 3000 ms` per call.
- **C12 (CI verification and automated `--home` end-to-end check):** an
  automated `--home` end-to-end test installs the pact and invokes all three
  rendered wrappers/launchers cleanly; CI's three jobs (`gate`, `gate-macos`,
  `gate-windows`) pass on each ticket's reviewed head.
- **C13 (Live Antigravity probe and redacted dated log):** both T2's early
  live probe dated log and T5's full live Antigravity probe on Windows
  (interactive + headless `agy -p` + allow-listed `git`) confirm `overwrite` +
  `decision: "force_ask"` rewrites `CommandLine` with `GIT_CONFIG_GLOBAL` +
  `GIT_TERMINAL_PROMPT=0`, prompts interactively (never auto-allows, refuses
  headless), does not leak `overwrite.CommandLine` outside command execution,
  commits as the pinned bot in a throwaway local repo, and denies plain `gh`
  writes and `manage_task` `git` writes (or triggers the `"deny"` fallback if
  any check fails); every probe dated log under `docs/log/` follows the
  redaction rule holding pass/fail observations only and zero `gh-app.mjs
  status` output, `github.json` values (`app_id`, `bot_id`, `slug`, `bot_login`,
  `owner.id`), `.gitconfig` contents, personal `author.*` emails, tokens, or
  unredacted `overwriteCommand` paths.

## S10 Tickets

Thorough tier, 5 tickets (each its own Linear sub-issue under `PACT-119` and
its own PR after this spec is approved; per `AGENTS.md`, each PR changing
`claude/` or `gate/` lands with its dated-log entry under `docs/log/`, and T5
adds the live probe entry):

- **T1 Shared identity guard core:** S3 (`claude/guard/guard.mjs`, unit and
  bad-case table tests in `gate/tests/guard.test.mjs`, including optional
  `shell` on `answerCall` and shared `git` override/unset guarding for
  `claude`). Covers C1–C6, C11. Dependencies: none.
- **T2 Harness wrappers and early `force_ask` probe:** S4
  (`claude/guard/claude.mjs`, `claude/guard/antigravity.mjs`,
  `claude/guard/codex.mjs` passing `shell` to `answerCall`, plus
  `LAUNCH_ANSWERS.claude` /
  `guardLauncherText('claude')` in `gate/install-core.mjs`, wrapper/launcher
  tests and updated `guard.mjs` stubs in `gate/tests/guard.test.mjs`), plus the
  quick live Windows probe of Antigravity `overwrite` + `force_ask`
  (interactive + headless `agy -p`) and Claude Code `cmd.exe` `PreToolUse`
  invocation (verifying Windows Bash-tool `cwd` format `/c/Users/...` vs
  `C:\Users\...` and whether `LAUNCH_ANSWERS.claude` using `exit /b 2` +
  stderr is cleaner than `echo {...}` + `exit /b 0`; recorded under `docs/log/`
  with the `C13` redaction rule) before merging T2 so any required fallback to
  `deny` lands before T3. Covers C2, C6, C7, C11, C13.
  Dependencies: T1.
- **T3 Installer, Seam A, rendered rules, and builder:** S5
  (`gate/install-core.mjs`, `gate/install-run.mjs`, `gate/seam-a-core.mjs`,
  `gate/harnesses.mjs`, `gate/render-core.mjs`, `gate/harness-render.mjs`,
  `harnesses/known.json`, `claude/CLAUDE.md`, `builder/build.mjs`,
  `builder/default-config/`, `builder/scriptorium.html`, tests in
  `gate/tests/guard.test.mjs`, `gate/tests/guard-install.test.mjs`,
  `text.mjs`, `harnesses.test.mjs`, `render-config.test.mjs`,
  `builder-page.test.mjs`, `seam-a.test.mjs` — including one planted bad-case
  test per new gate check family and an automated `--home` end-to-end test
  across all three wrappers/launchers). Covers C7, C8, C9, C12.
  Dependencies: T2.
- **T4 Docs, threat model, and `--provider` / `--add-assignee` fixes:** S6
  (`claude/review.md`, `AGENTS.md`, `docs/agents/work-records.md`,
  `docs/agent-identity.md`, `docs/agents/agent-apps.md`, `docs/install.md`,
  `docs/rule-reasons.md`, `docs/reference.md`, `docs/threat-model.md`,
  `node docs/toc.mjs`). Covers C10. Dependencies: T3 (so rollback/undo lines
  match `guard-install.test.mjs` assertions).
- **T5 Full live Antigravity end-to-end probe and redacted dated log:** full
  interactive Windows Antigravity probe against a throwaway `--home` install
  and throwaway local repo + redacted dated log in `docs/log/`. Covers C12,
  C13. Dependencies: T3, T4.

### Target environment vs dev/CI notes

- CI (`gate`, `gate-macos`, `gate-windows`) and `athanor` run isolated
  `--home` temp dirs with fake pin/gitconfig fixtures and unit/wrapper tests.
- The owner's live Windows host runs PowerShell, has an existing user-level
  `PreToolUse` hook (`~/.claude/hooks/identity-guard.mjs`) that must remain
  untouched, uses `mise`-managed `node`, and executes `.cmd` launchers via
  `C:\Windows\System32\cmd.exe`. T3 includes an automated `--home` end-to-end
  test invoking all three launchers (`claude.cmd`, `codex.cmd`,
  `antigravity.cmd` on `win32`; POSIX equivalents on Linux/macOS), and T2/T5
  verify live harness behavior on Windows.

### Needs the owner

| What | Recommendation | When |
| --- | --- | --- |
| Spec approval and flagged security checkpoints | Review Design round 1–2 checkpoints (`force_ask` + `overwrite` gated on probe; `gh run`/`gh workflow` exemption; unpinned non-Claude pass-through; `git pull` exclusion) | Design (before cutting tickets) |
| Early live probe (`force_ask` + `overwrite` and Claude `cmd.exe` hook) | Confirm `force_ask` rewrites `CommandLine` and prompts interactively (refusing headless `agy -p`), and Claude Code runs `claude.cmd` cleanly | Right after T2 (fail fast) |
| Per-ticket Test security-pair review | Run `adversarial-lens` and `data-lens` on each ticket's diff at Test (per S2 item 13) | Test of T1–T5 |
| Pre-T5 `antigravity` pin & probe target | Confirm `gh-app.mjs status --provider antigravity` passes and name the throwaway local repo/branch for the live probe | Before T5 |
| Live install apply | Run dry run, review, and apply once all tickets merge and CI is green | After T5 |

### Stop and ask when

- The post-T2 live probe shows Antigravity `PreToolUse` `overwrite` paired with
  `decision: "force_ask"` fails to rewrite `CommandLine`, fails to prompt, or
  leaks `overwrite.CommandLine` outside execution (fallback: switch Antigravity
  `git` hook action to `deny` with the actionable prefix).
- Claude Code's `PreToolUse` rejects `cmd.exe` + `args` launcher invocation on
  Windows (fallback: adjust launcher invocation form and re-verify).
- Any harness's rendered rules exceed its byte cap (`24000` for Antigravity,
  `32768` shared for Codex) after adding the one-line rule.
- Claude Code's rendered `CLAUDE.md` bytes change relative to the pre-change
  render with the same `agent-identity` setting, or `rules.json` bytes change
  while `agent-identity` is off.

## S11 Rollback

An older installer knows neither `claude/guard/claude.mjs` (`claude.cmd`) nor
the `identity` key in `rules.json`, nor `settings-env` in
`harnesses/known.json`. To roll back:

1. Set `agent-identity` to `false` in `~/.pact/config.json`, run the dry run
   and apply at the newer commit so Claude's `PreToolUse` hook entry, `env`
   keys, and `.pact/guard/claude.mjs` (`claude.cmd`) are removed cleanly.
2. Run the four rollback checks in `docs/install.md#roll-back-to-an-older-version`
   before checking out an older commit.
3. Revert the merged PRs (or check out the verified older commit), run dry run
   and apply on the owner's go-ahead, then re-enable `agent-identity: true` if
   desired.

Done when the apply exits 0 and a follow-up dry run prints `Nothing to do.`

## S12 Out of scope (deferred)

- Linear MCP write guarding across harnesses (`PACT-95`).
- Deciding whether `poster.mjs` checks remain required once an agent app is
  installed (`PACT-95` open question 2).
- Adding `actions: write` to `gh-app.mjs` `CLAIM_PERMISSIONS` (`PACT-95` open
  question 5).
- Linux/macOS implementation of `gh-app.mjs` itself (stays Windows-only;
  `guard.mjs` still formats POSIX `overwriteCommand` for forward compatibility).
- Cloud sessions (`cloud-sessions/`).
