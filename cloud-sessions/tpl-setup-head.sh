#!/usr/bin/env bash
# Reinstall global Claude Code skills, plugins and config in a fresh cloud container.
# Every run fetches each third-party repo at its pinned commit and replaces
# what it copies from it (#183 T3, ADR 0090). One failure never stops the
# rest, so there is deliberately no `set -e`.

# The third-party repos' pinned commits, written by gen.mjs. Read-only, and
# the first code line, so no line can declare the name before it or change a
# pin after it.
__CLOUD_REPO_PINS__

set -u

export HOME="${HOME:-/root}"
export GIT_TERMINAL_PROMPT=0      # a missing repo errors instead of prompting
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

# The fetch budget: every network step below is timed against what is left of
# it, so the whole setup stays under the five minutes a cached setup allows.
FETCH_BUDGET=270
FETCH_DEADLINE=$(( $(date +%s) + FETCH_BUDGET ))
HAVE_TIMEOUT=0; command -v timeout >/dev/null 2>&1 && HAVE_TIMEOUT=1
T=""
left() { local n=$(( FETCH_DEADLINE - $(date +%s) )); [ "$n" -lt 0 ] && n=0; [ "$n" -gt 300 ] && n=300; echo "$n"; }
HAVE_GIT=0; command -v git >/dev/null 2>&1 && HAVE_GIT=1

# The opt-ins went with the skills CLI: claude.ai syncs what they installed.
for v in INSTALL_ANTHROPIC_SKILLS INSTALL_KNOWLEDGE_WORK_PLUGINS; do
  [ "${!v+set}" = set ] && echo "WARN: $v is no longer read; claude.ai syncs these"
done

# "<owner/repo> <path of the skill folder inside the repo>"
# The folder's basename is the skill name.
SKILLS=(
  "cloudflare/skills skills/agents-sdk"
  "cloudflare/skills skills/cloudflare"
  "cloudflare/skills skills/durable-objects"
  "cloudflare/skills skills/sandbox-migrate-to-next"
  "cloudflare/skills skills/sandbox-next"
  "cloudflare/skills skills/sandbox-stable"
  "cloudflare/skills skills/turnstile-spin"
  "cloudflare/skills skills/web-perf"
  "cloudflare/skills skills/workers-best-practices"
  "cloudflare/skills skills/wrangler"
  "humanlayer/skills plugins/show-me/skills/show-me"
  "mattpocock/skills skills/engineering/ask-matt"
  "mattpocock/skills skills/engineering/code-review"
  "mattpocock/skills skills/engineering/codebase-design"
  "mattpocock/skills skills/engineering/diagnosing-bugs"
  "mattpocock/skills skills/engineering/domain-modeling"
  "mattpocock/skills skills/engineering/grill-with-docs"
  "mattpocock/skills skills/engineering/implement"
  "mattpocock/skills skills/engineering/implement-spec"
  "mattpocock/skills skills/engineering/improve-codebase-architecture"
  "mattpocock/skills skills/engineering/pr"
  "mattpocock/skills skills/engineering/prototype"
  "mattpocock/skills skills/engineering/research"
  "mattpocock/skills skills/engineering/retro"
  "mattpocock/skills skills/engineering/setup-matt-pocock-skills"
  "mattpocock/skills skills/engineering/tdd"
  "mattpocock/skills skills/engineering/to-spec"
  "mattpocock/skills skills/engineering/to-tickets"
  "mattpocock/skills skills/engineering/triage"
  "mattpocock/skills skills/engineering/wayfinder"
  "mattpocock/skills skills/engineering/wizard"
  "mattpocock/skills skills/in-progress/claude-handoff"
  "mattpocock/skills skills/in-progress/loop-me"
  "mattpocock/skills skills/in-progress/setup-ts-deep-modules"
  "mattpocock/skills skills/in-progress/writing-beats"
  "mattpocock/skills skills/in-progress/writing-fragments"
  "mattpocock/skills skills/in-progress/writing-shape"
  "mattpocock/skills skills/misc/git-guardrails-claude-code"
  "mattpocock/skills skills/misc/migrate-to-shoehorn"
  "mattpocock/skills skills/misc/scaffold-exercises"
  "mattpocock/skills skills/misc/setup-pre-commit"
  "mattpocock/skills skills/productivity/grill-me"
  "mattpocock/skills skills/productivity/grilling"
  "mattpocock/skills skills/productivity/handoff"
  "mattpocock/skills skills/productivity/teach"
  "mattpocock/skills skills/productivity/to-questionnaire"
  "mattpocock/skills skills/productivity/wait-what"
  "mattpocock/skills skills/productivity/writing-for-agents"
  "mephistopheles4/grimoire skills/eagle-eye"
  "mephistopheles4/grimoire skills/groundtrack"
  "typesafe-ai/skills skills/typesafe-ai"
)

present() { [ -f "$SKILLS_DIR/$1/SKILL.md" ]; }

# What the Result section names. Each holds names, never fetched text.
SKIPPED_TIME=(); NOT_FETCHED=(); SKIPPED_SOURCE=(); NOT_INSTALLED=()
BAD_SKILLS=" "
OFFICIAL_PRESENT=0
# A step's folder and its logs: new temp folders outside every kept or moved
# folder. The logs hold the steps' own output, which is never printed, and
# both go at the end of setup.
PACT_STEP_DIR="$(mktemp -d)"
PACT_LOG_DIR="$(mktemp -d)"

# third_party [-o <file>] <cmd...>: the only way the setup runs a third-party
# command. It refuses, setting TP_REFUSED and printing nothing, without
# timeout or with 10 seconds or fewer left. Otherwise it runs the command
# from the step folder, with the GitHub token variables unset and timed
# against what is left, its stdout to <file> (else the log) and its stderr to
# the log. Its status is the command's; 124 is timeout's. Never call it in a
# subshell or a pipe, which would lose TP_REFUSED or its status.
TP_REFUSED=
third_party() {
  local out="$PACT_LOG_DIR/steps.log" secs
  if [ "${1:-}" = "-o" ]; then out="$2"; shift 2; fi
  if [ "$HAVE_TIMEOUT" != "1" ]; then TP_REFUSED=no-timeout; return 1; fi
  secs="$(left)"
  if [ "$secs" -le 10 ]; then TP_REFUSED=time; return 1; fi
  TP_REFUSED=
  (cd "$PACT_STEP_DIR" && env -u GH_TOKEN -u GITHUB_TOKEN GIT_TERMINAL_PROMPT=0 timeout "$secs" "$@") >>"$out" 2>>"$PACT_LOG_DIR/steps.log" </dev/null
}
# After a failed third_party step: "time" when it was refused for time or
# timed out, else "fail".
tp_why() { if [ "$TP_REFUSED" = "time" ] || [ "$1" -eq 124 ]; then echo time; else echo fail; fi; }
# note <why> <names...>: time goes under skipped (time); a fetch failure under
# not fetched at pin; an install failure under not installed.
note() {
  local why="$1"; shift
  case "$why" in
    time) SKIPPED_TIME+=("$@") ;;
    fetch) NOT_FETCHED+=("$@") ;;
    source) SKIPPED_SOURCE+=("$@") ;;
    *) NOT_INSTALLED+=("$@") ;;
  esac
}
# replace_dir <new> <dest>: moves <new> to <dest>, replacing it whole; on
# failure <dest> is left as it was.
replace_dir() {
  local new="$1" dest="$2" old=""
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    old="$(mktemp -d "${dest%/*}/.pact-old.XXXXXX")" || return 1
    mv -T "$dest" "$old/d" 2>>"$PACT_LOG_DIR/steps.log" || { rm -rf "$old"; return 1; }
  fi
  if mv -T "$new" "$dest" 2>>"$PACT_LOG_DIR/steps.log"; then
    [ -n "$old" ] && rm -rf "$old"
    return 0
  fi
  [ -n "$old" ] && mv -T "$old/d" "$dest" 2>>"$PACT_LOG_DIR/steps.log" && rm -rf "$old"
  return 1
}

# fetch_pinned <repo> <dest>: the only way the setup fetches a third-party
# repo, at REPO_PIN[<repo>], into a new folder beside <dest> that replaces it
# only once the checkout is at the pin. Git's object-id check ties the
# checkout to the pin; rev-parse is a backstop. On failure FETCH_WHY is
# "time" or "fetch", and <dest> is left as it was.
FETCH_WHY=
fetch_pinned() {
  local repo="$1" dest="$2" tmp st
  FETCH_WHY=fetch
  if [ "$HAVE_GIT" != "1" ] || [[ ! -v REPO_PIN[$repo] ]]; then
    echo "WARN: $repo not fetched at its pin"; return 1
  fi
  mkdir -p "${dest%/*}" && tmp="$(mktemp -d "${dest%/*}/.pact-fetch.XXXXXX")" || { echo "WARN: $repo not fetched at its pin"; return 1; }
  : > "$PACT_LOG_DIR/head"
  third_party git -C "$tmp" init -q \
    && third_party git -C "$tmp" fetch -q --depth 1 "https://github.com/$repo" "${REPO_PIN[$repo]}" \
    && third_party git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD \
    && third_party -o "$PACT_LOG_DIR/head" git -C "$tmp" rev-parse HEAD
  st=$?
  if [ "$st" -eq 0 ] && [ "$(cat "$PACT_LOG_DIR/head")" = "${REPO_PIN[$repo]}" ] && replace_dir "$tmp" "$dest"; then
    return 0
  fi
  [ "$st" -ne 0 ] && [ "$(tp_why "$st")" = "time" ] && FETCH_WHY=time
  rm -rf "$tmp"
  if [ "$FETCH_WHY" = "time" ]; then echo "WARN: $repo not fetched at its pin (time)"; else echo "WARN: $repo not fetched at its pin"; fi
  return 1
}

# PLUGIN_SOURCE_CHECK <folder> <local-name> <links file> <plugins...>: reads
# the fetched catalog and writes it back reduced to the listed plugins that
# pass, under <local-name>. It prints "reduced", then each passing name, and
# nothing of the catalog. A plugin passes with a contained path source, or a
# github, url or git-subdir source carrying a 40-hex sha; nothing declared of
# dependencies, servers, monitors or settings; and, for a path source, no
# undeclared server, LSP, monitor or settings file, no bin/ and no link.
IFS= read -r -d '' PLUGIN_SOURCE_CHECK <<'PLUGIN_SOURCE_CHECK_EOF'
const fs = require('node:fs');
const path = require('node:path');
try {
  const [dir, local, linksFile, ...want] = process.argv.slice(1);
  const root = fs.realpathSync(dir);
  const meta = path.join(root, '.claude-plugin');
  const catPath = path.join(meta, 'marketplace.json');
  if (!fs.lstatSync(meta).isDirectory() || !fs.lstatSync(catPath).isFile()) process.exit(1);
  const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  if (!cat || typeof cat !== 'object' || Array.isArray(cat) || !Array.isArray(cat.plugins)) process.exit(1);
  const links = fs.readFileSync(linksFile, 'utf8').split('\n').filter(Boolean);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const declares = o => isObj(o) && (['dependencies', 'mcpServers', 'lspServers', 'monitors', 'settings'].some(k => Object.hasOwn(o, k)) || (isObj(o.experimental) && Object.hasOwn(o.experimental, 'monitors')));
  const exists = p => { try { fs.lstatSync(p); return true; } catch { return false; } };
  const passes = e => {
    if (!isObj(e) || declares(e)) return false;
    const s = e.source;
    if (isObj(s)) return ['github', 'url', 'git-subdir'].includes(s.source) && typeof s.sha === 'string' && /^[0-9a-f]{40}$/.test(s.sha);
    if (typeof s !== 'string') return false;
    const at = path.resolve(root, s);
    const rel = path.relative(root, at);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const st = fs.lstatSync(at);
    if (!st.isDirectory() || fs.realpathSync(at) !== at) return false;
    const relPosix = rel.split(path.sep).join('/');
    if (links.some(l => l === relPosix || l.startsWith(`${relPosix}/`))) return false;
    if (['.mcp.json', '.lsp.json', 'settings.json', 'bin', path.join('monitors', 'monitors.json')].some(f => exists(path.join(at, f)))) return false;
    const man = path.join(at, '.claude-plugin', 'plugin.json');
    if (exists(man) && declares(JSON.parse(fs.readFileSync(man, 'utf8')))) return false;
    return true;
  };
  const pass = [];
  const entries = [];
  for (const name of want) {
    const found = cat.plugins.filter(p => isObj(p) && p.name === name);
    let ok = false;
    try { ok = found.length === 1 && passes(found[0]); } catch { ok = false; }
    if (ok) { pass.push(name); entries.push(found[0]); }
  }
  const out = { name: local, owner: cat.owner, description: cat.description, plugins: entries };
  const tmp = path.join(meta, `.marketplace.json.${process.pid}`);
  fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(tmp, catPath);
  process.stdout.write(['reduced', ...pass].join('\n') + '\n');
} catch {
  process.exit(1);
}
PLUGIN_SOURCE_CHECK_EOF

# PROXY_LINE_PROGRAM reads a response body and, after it, its status line
# from stdin, and prints only a login of GitHub's shape, anonymous or
# unexpected; never the body or a header.
IFS= read -r -d '' PROXY_LINE_PROGRAM <<'PROXY_LINE_PROGRAM_EOF'
let d = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { if (d.length < 1000000) d += c; });
process.stdin.on('end', () => {
  let out = 'unexpected';
  try {
    const i = d.lastIndexOf('\n');
    const code = d.slice(i + 1).trim();
    if (code === '200') {
      const j = JSON.parse(d.slice(0, i));
      if (j && typeof j.login === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(j.login)) out = `authenticated as ${j.login}`;
    } else if (code === '401') {
      out = 'anonymous';
    }
  } catch {
    out = 'unexpected';
  }
  process.stdout.write(`github api during setup: ${out}\n`);
});
PROXY_LINE_PROGRAM_EOF

# Node 24 (#183, ADR 0088). A pinned, hash-checked mise installs the pinned
# Node against a lockfile hash, and the installed binary is checked too. Only
# when every check passes do wrappers for node, npm and npx in /root/.local/bin
# put it ahead of the image's Node; any failure leaves none, so the image's
# Node stays, and the Result section turns the marker INCOMPLETE with the
# reason. The pins are plain assignments, so setup's environment can't
# replace one. Every fetch runs with the GitHub token variables unset, and is
# timed against the fetch budget.
echo "== Node"
__CLOUD_PINS__
NODE_FAILED=
MISE_OK=0
MISE_BIN=/root/.local/bin/mise
MISE_CONF=/root/.config/mise
NODE_HOME="/root/.local/share/mise/installs/node/$NODE_VERSION"
NODE_WRAPPER_TAG='# pact cloud node wrapper'
NODE_TMP=""

node_fail() { NODE_FAILED="$1"; echo "WARN: $2"; }
# Before each network step: T is the time left, or "" without timeout. With
# 10 seconds or fewer left, the step is skipped and the block fails as time.
node_time() {
  if [ "$(left)" -le 10 ]; then node_fail time "Node $NODE_VERSION skipped: the fetch budget is spent"; return 1; fi
  if [ "$HAVE_TIMEOUT" = "1" ]; then T="timeout $(left)"; else T=""; fi
}
sha256_of() { sha256sum "$1" 2>/dev/null | cut -d ' ' -f 1; }
# Removes only the wrappers this block wrote, by their tag line.
remove_node_wrappers() {
  local w
  for w in node npm npx; do
    if grep -qxF "$NODE_WRAPPER_TAG" "/root/.local/bin/$w" 2>/dev/null; then rm -f "/root/.local/bin/$w"; fi
  done
}

if [ "$(uname -m)" != "x86_64" ]; then
  node_fail arch "Node $NODE_VERSION skipped: this machine is $(uname -m), and the pins are for x86_64"
fi
if [ -z "$NODE_FAILED" ]; then
  NODE_TMP="$(mktemp -d)"
  if ! command -v curl >/dev/null 2>&1; then
    node_fail download "curl not found; mise not downloaded"
  elif ! node_time; then
    :
  elif ! env -u GH_TOKEN -u GITHUB_TOKEN $T curl -fsSL --proto '=https' --tlsv1.2 -o "$NODE_TMP/mise.tar.gz" \
      "https://github.com/jdx/mise/releases/download/v$MISE_VERSION/mise-v$MISE_VERSION-linux-x64.tar.gz"; then
    node_fail download "mise download failed"
  fi
fi
# The archive's hash is checked before anything in it is unpacked.
if [ -z "$NODE_FAILED" ]; then
  if [ "$(sha256_of "$NODE_TMP/mise.tar.gz")" != "$MISE_SHA256" ]; then
    rm -f "$NODE_TMP/mise.tar.gz"
    node_fail hash "mise sha256 mismatch"
  elif tar -xzf "$NODE_TMP/mise.tar.gz" -C "$NODE_TMP" mise/bin/mise \
      && mkdir -p /root/.local/bin && install -m 0755 "$NODE_TMP/mise/bin/mise" "$MISE_BIN"; then
    MISE_OK=1
  else
    node_fail install "mise could not be unpacked"
  fi
fi
# paranoid: a project's mise.toml or .tool-versions is refused until someone
# runs mise trust on it. lockfile: a reinstall of this Node checks its hash.
if [ -z "$NODE_FAILED" ]; then
  mkdir -p "$MISE_CONF"
  cat > "$MISE_CONF/config.toml" <<MISE_CONFIG_EOF
[settings]
paranoid = true
lockfile = true
use_versions_host = false
node.verify = true
node.gpg_verify = true
node.mirror_url = "https://nodejs.org/dist/"

[tools]
node = "$NODE_VERSION"
MISE_CONFIG_EOF
  if [ "$(cd "$NODE_TMP" && env -u GH_TOKEN -u GITHUB_TOKEN "$MISE_BIN" settings get paranoid 2>/dev/null)" != "true" ]; then
    MISE_OK=0
    node_fail config "mise does not report paranoid on"
  fi
fi
# MISE_LOCKED refuses any tool not in the lockfile: safe mode outranks
# paranoid and still reads tools from configs above the working folder.
if [ -z "$NODE_FAILED" ]; then
  cat > "$MISE_CONF/mise.lock" <<MISE_LOCK_EOF
lockfile_version = 3

[[tools.node]]
version = "$NODE_VERSION"
backend = "core:node"
specifiers = ["$NODE_VERSION"]

[tools.node."platforms.linux-x64"]
checksum = "sha256:$NODE_TAR_SHA256"
url = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz"
MISE_LOCK_EOF
  if ! node_time; then
    :
  elif ! (cd "$NODE_TMP" && env -u GH_TOKEN -u GITHUB_TOKEN MISE_SAFE=1 MISE_LOCKED=1 $T "$MISE_BIN" install) >"$NODE_TMP/install.log" 2>&1; then
    tail -n 5 "$NODE_TMP/install.log" | sed 's/^/  /'
    if grep -qi 'checksum' "$NODE_TMP/install.log"; then
      node_fail hash "Node archive sha256 mismatch"
    else
      node_fail install "mise install of Node $NODE_VERSION failed"
    fi
  fi
fi
if [ -z "$NODE_FAILED" ] && [ "$(sha256_of "$NODE_HOME/bin/node")" != "$NODE_BIN_SHA256" ]; then
  # mise's aliases (24, lts, latest) would be left pointing at nothing.
  rm -rf "$NODE_HOME" && find "${NODE_HOME%/*}" -maxdepth 1 -xtype l -delete 2>/dev/null
  node_fail hash "node binary sha256 mismatch"
fi
# The wrappers point straight at the pinned install, not mise's shims, which
# refuse in a folder holding an untrusted mise config.
if [ -z "$NODE_FAILED" ]; then
  for w in node npm npx; do
    printf '#!/bin/sh\n%s\nexec "%s" "$@"\n' "$NODE_WRAPPER_TAG" "$NODE_HOME/bin/$w" > "/root/.local/bin/$w" \
      && chmod 0755 "/root/.local/bin/$w" || node_fail install "could not write the $w wrapper"
  done
fi
if [ -n "$NODE_FAILED" ]; then
  remove_node_wrappers
  [ "$MISE_OK" = "1" ] || rm -f "$MISE_BIN"
else
  export PATH="/root/.local/bin:$PATH"
  echo "ok: node, npm and npx run Node $NODE_VERSION"
fi
[ -n "$NODE_TMP" ] && rm -rf "$NODE_TMP"

echo "== Plugins"
# install_plugins <repo> <local-name> <plugins...>: the repo at its pin, kept in
# ~/.claude/pact-pinned/<local-name> (plugins from a local marketplace load in
# place), its catalog reduced by PLUGIN_SOURCE_CHECK, added by path under
# <local-name>, and each passing plugin installed from it. The step never adds
# a marketplace from GitHub.
install_plugins() {
  local repo="$1" local_name="$2"; shift 2
  local folder="$HOME/.claude/pact-pinned/$local_name" stage p st src passed=() failed=()
  : > "$PACT_LOG_DIR/mkts"
  third_party -o "$PACT_LOG_DIR/mkts" claude plugin marketplace list; st=$?
  if [ "$st" -ne 0 ]; then
    OFFICIAL_PRESENT=unknown
  elif grep -q 'claude-plugins-official' "$PACT_LOG_DIR/mkts"; then
    OFFICIAL_PRESENT=1
  fi
  # Fetched and checked in a stage beside the kept folder, which is replaced
  # only by a checked tree; any refusal leaves the last checked tree in place.
  mkdir -p "${folder%/*}" && stage="$(mktemp -d "${folder%/*}/.pact-stage.XXXXXX")" || { echo "WARN: the plugin catalog could not be staged; no plugin installed"; note install "$@"; return; }
  if ! fetch_pinned "$repo" "$stage/m"; then note "$FETCH_WHY" "$@"; rm -rf "$stage"; return; fi
  # Every link in the tree, listed NUL-separated so git quotes no name. One
  # under .claude-plugin/ refuses the step; a plugin whose folder holds one is
  # skipped by the check.
  : > "$PACT_LOG_DIR/tree.z"
  third_party -o "$PACT_LOG_DIR/tree.z" git -C "$stage/m" ls-tree -r -z HEAD; st=$?
  if [ "$st" -ne 0 ]; then
    rm -rf "$stage"
    [ "$(tp_why "$st")" = "time" ] && { note time "$@"; return; }
    echo "WARN: the plugin catalog could not be listed; no plugin installed"; note source "$@"; return
  fi
  tr '\0' '\n' < "$PACT_LOG_DIR/tree.z" | awk -F '\t' '$1 ~ /^120000 / { print $2 }' > "$PACT_LOG_DIR/links"
  if grep -qE '^\.claude-plugin(/|$)' "$PACT_LOG_DIR/links"; then
    rm -rf "$stage"
    echo "WARN: the plugin catalog holds a link; no plugin installed"; note source "$@"; return
  fi
  # A missing node, a failed check or no reduced catalog refuses the step.
  : > "$PACT_LOG_DIR/passed"; st=1; TP_REFUSED=
  if command -v node >/dev/null 2>&1; then
    third_party -o "$PACT_LOG_DIR/passed" node -e "$PLUGIN_SOURCE_CHECK" "$stage/m" "$local_name" "$PACT_LOG_DIR/links" "$@"; st=$?
  fi
  if [ "$st" -ne 0 ] || [ "$(head -n 1 "$PACT_LOG_DIR/passed")" != "reduced" ]; then
    rm -rf "$stage"
    [ "$st" -ne 0 ] && [ "$(tp_why "$st")" = "time" ] && { note time "$@"; return; }
    echo "WARN: the plugin catalog could not be checked; no plugin installed"; note source "$@"; return
  fi
  if ! replace_dir "$stage/m" "$folder"; then
    rm -rf "$stage"
    echo "WARN: the plugin catalog could not be put in place; no plugin installed"; note install "$@"; return
  fi
  rm -rf "$stage"
  # Only a listed name counts as passing.
  for p in "$@"; do
    if grep -qxF -- "$p" <(tail -n +2 "$PACT_LOG_DIR/passed"); then passed+=("$p"); else echo "WARN: $p has no pinned source; skipped"; note source "$p"; failed+=("$p"); fi
  done
  # The marketplace entry names this folder, or it is replaced.
  src=""
  if command -v jq >/dev/null 2>&1; then
    src="$(jq -r --arg n "$local_name" 'if (.[$n] | type) == "object" then ((.[$n].source.source // "") + ":" + (.[$n].source.path // "")) else "" end' "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null)"
  else
    src="unknown"
  fi
  # A listed plugin that no longer passes is uninstalled, in case an earlier
  # run installed it from this marketplace.
  if [ "$src" = "directory:$folder" ]; then
    for p in "${failed[@]}"; do third_party claude plugin uninstall "$p@$local_name" --scope user; done
  fi
  if [ -n "$src" ] && [ "$src" != "directory:$folder" ]; then
    # Listed with another source (or not known without jq): remove it first.
    third_party claude plugin marketplace remove "$local_name"
  fi
  [ "${#passed[@]}" -gt 0 ] || return
  if [ "$src" != "directory:$folder" ]; then
    third_party claude plugin marketplace add "$folder"; st=$?
    if [ "$st" -ne 0 ]; then
      if [ "$(tp_why "$st")" = "time" ]; then note time "${passed[@]}"; else echo "WARN: marketplace $local_name not added"; note install "${passed[@]}"; fi
      return
    fi
  fi
  for p in "${passed[@]}"; do
    third_party claude plugin install "$p@$local_name" --scope user -y; st=$?
    if [ "$st" -eq 0 ]; then
      echo "ok: $p@$local_name"
    elif [ "$(tp_why "$st")" = "time" ]; then
      note time "$p"
    else
      echo "WARN: plugin $p failed"; note install "$p"
    fi
  done
}
if command -v claude >/dev/null 2>&1; then
  install_plugins anthropics/claude-plugins-official pact-pinned-plugins \
    claude-code-setup claude-security code-review coderabbit \
    security-guidance skill-creator superpowers
else
  echo "WARN: claude CLI not on PATH; plugins skipped"
  note install claude-code-setup claude-security code-review coderabbit security-guidance skill-creator superpowers
fi

echo "== Skills"
# Every run, each repo at its pin, and each listed skill copied from it over
# the installed folder. A path with no SKILL.md, a link or a .claude-plugin
# entry is not copied and counts as missing. Nothing searches by name.
REPOS="$(for e in "${SKILLS[@]}"; do echo "${e%% *}"; done | sort -u)"
for repo in $REPOS; do
  names=(); paths=()
  for e in "${SKILLS[@]}"; do
    [ "${e%% *}" = "$repo" ] || continue
    paths+=("${e#* }"); names+=("$(basename "${e#* }")")
  done
  work="$(mktemp -d)"
  if ! fetch_pinned "$repo" "$work/repo"; then note "$FETCH_WHY" "${names[@]}"; rm -rf "$work"; continue; fi
  copied=0
  for i in "${!paths[@]}"; do
    p="${paths[$i]}"; n="${names[$i]}"
    : > "$PACT_LOG_DIR/tree.z"
    third_party -o "$PACT_LOG_DIR/tree.z" git -C "$work/repo" ls-tree -r -z "${REPO_PIN[$repo]}" -- "$p"; st=$?
    if [ "$st" -ne 0 ]; then
      if [ "$(tp_why "$st")" = "time" ]; then note time "$n"; else note fetch "$n"; fi
      continue
    fi
    tr '\0' '\n' < "$PACT_LOG_DIR/tree.z" > "$PACT_LOG_DIR/tree"
    if ! awk -F '\t' -v f="$p/SKILL.md" '$2 == f && $1 ~ /^100[0-7]+ blob / { found = 1 } END { exit !found }' "$PACT_LOG_DIR/tree" \
        || awk -F '\t' -v d="$p/.claude-plugin" '$1 ~ /^120000 / || $2 == d || index($2, d "/") == 1 { bad = 1 } END { exit !bad }' "$PACT_LOG_DIR/tree"; then
      echo "WARN: $n not at $p in $repo's pin, or holds a link or .claude-plugin; not copied"; BAD_SKILLS+="$n "; continue
    fi
    if stage="$(mktemp -d "$SKILLS_DIR/.pact-new.XXXXXX" 2>>"$PACT_LOG_DIR/steps.log")" && cp -R "$work/repo/$p" "$stage/$n" 2>>"$PACT_LOG_DIR/steps.log" && replace_dir "$stage/$n" "$SKILLS_DIR/$n"; then
      copied=$((copied + 1))
    else
      echo "WARN: copy of $n failed"; note install "$n"
    fi
    [ -n "${stage:-}" ] && rm -rf "$stage"; stage=""
  done
  echo "ok: $repo at its pin, $copied of ${#paths[@]} skills copied"
  rm -rf "$work"
done
