#!/usr/bin/env bash
# Runs inside a throwaway ubuntu:24.04 container. /s = a scratch folder,
# mounted read-only, holding the generated scripts, CLAUDE.cloud.md and repo/:
# an export of tracked files only, made with
#   git archive HEAD claude/agents claude/review.md | tar -x -C <scratch>/repo
# Never mount the working clone or your home folder: the setup runs fetched
# code as root, with the network on. Start the container with that one mount,
# read-only (-v <scratch>:/s:ro), and nothing else: no Docker socket, no
# --privileged, no --network host, and no host environment variables or
# credentials passed in. Nothing is written to the mount. Where the network
# goes only through a proxy, as in a cloud container, pass its address
# (HTTPS_PROXY, HTTP_PROXY) and its CA bundle (SSL_CERT_FILE,
# NODE_EXTRA_CA_CERTS, GIT_SSL_CAINFO), and nothing else. Pass the address
# only when it holds no login; otherwise, or when the proxy listens only on
# the host's loopback, run a forwarder with no login on the Docker bridge and
# pass its address.
# A cloud proxy may add GitHub credentials of its own, so this driver's output
# can carry the proxy line's login: report it only as the owner's, another
# account's or anonymous, never by name (#183 T3).
set -u
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && # curl and gpg: the cloud image has both, and the Node block uses them (#183).
apt-get install -y -qq jq git ca-certificates curl gnupg >/dev/null 2>&1
echo "### tools: $(jq --version), $(git --version), $(curl --version | head -n 1 | cut -d ' ' -f 1-2), npx=$(command -v npx || echo none), claude=$(command -v claude || echo none), HOME=$HOME, user=$(id -un)"

# Stand-in for the plugin step's output, plus an allow rule and env key the overlay lacks.
mkdir -p /root/.claude
cat > /root/.claude/settings.json <<'JSON'
{
  "enabledPlugins": { "superpowers@pact-pinned-plugins": true },
  "extraKnownMarketplaces": { "mephistopheles4": { "source": { "source": "github", "repo": "mephistopheles4/grimoire" } } },
  "permissions": { "allow": ["Bash(git status)"] },
  "env": { "SEEDED_BY_TEST": "1" }
}
JSON

snapshot() {
  echo "### settings.json"; cat /root/.claude/settings.json
  echo "### ~/.claude tree"; (cd /root/.claude && find . -maxdepth 2 -not -path './skills/*' | sort)
  echo "### skills dir entries: $(ls /root/.claude/skills | wc -l)"
  echo "### diff: written CLAUDE.md vs CLAUDE.cloud.md (expect empty)"; diff -u /s/CLAUDE.cloud.md /root/.claude/CLAUDE.md && echo "(identical)"
  echo "### diff: written agents vs repo copies, scout included (expect empty)"
  for f in /s/repo/claude/agents/*.md; do
    diff -u "$f" "/root/.claude/agents/$(basename "$f")" || echo "DIFFERS: $(basename "$f")"
  done
  echo "### agents written: $(ls /root/.claude/agents | wc -l) (expect $(ls /s/repo/claude/agents/*.md | wc -l))"
  echo "### diff: written pact/review.md vs claude/review.md (expect empty)"; diff -u /s/repo/claude/review.md /root/.claude/pact/review.md && echo "(identical)"
  echo "### Node wrappers (#183 C5)"; ls /root/.local/bin
  for w in node npm npx; do echo "# $w"; cat "/root/.local/bin/$w"; done
  # npm and npx start with "env node", so they take the PATH a session has.
  echo "node $(/root/.local/bin/node --version), npm $(PATH="/root/.local/bin:$PATH" npm --version 2>&1), npx $(PATH="/root/.local/bin:$PATH" npx --version 2>&1)"
  echo "mise paranoid: $(cd /tmp && /root/.local/bin/mise settings get paranoid)"
}

echo "################ PASS 1"; sh /s/cloud-setup-wrapper.sh; echo "exit: $?"
snapshot > /tmp/after1.txt; cat /tmp/after1.txt
echo "################ PASS 2"; sh /s/cloud-setup-wrapper.sh; echo "exit: $?"
snapshot > /tmp/after2.txt; cat /tmp/after2.txt
echo "################ snapshot after pass 1 vs after pass 2 (expect empty)"
diff -u /tmp/after1.txt /tmp/after2.txt && echo "(identical)"

echo "################ Node block hand checks (#183 C3, C4, C8, C10)"
# Each tamper case runs a copy of the script with one pin assignment
# rewritten, from a state with no Node installed, so mise really fetches.
node_reset() { rm -rf /root/.local/share/mise /root/.cache/mise; }
# What the block leaves on the PATH: the wrappers, and mise itself.
wrappers_left() { for w in node npm npx mise; do [ -e "/root/.local/bin/$w" ] && printf '%s ' "$w"; done; echo; }
ZERO=0000000000000000000000000000000000000000000000000000000000000000
# tamper <label> <sed expression>: one line of a copy rewritten.
tamper() {
  local copy; copy="$(mktemp)"
  sed "$2" /s/cloud-setup.sh > "$copy"
  echo "### $1: lines changed: $(diff /s/cloud-setup.sh "$copy" | grep -c '^>')"
  node_reset; bash "$copy" 2>&1 | grep -E '^WARN: (mise|Node|node|curl)|^pact cloud copy'
  echo "wrappers left: $(wrappers_left)"
  echo "Node install left: $(ls /root/.local/share/mise/installs/node 2>/dev/null || echo none)"; rm -f "$copy"
}
tamper "wrong mise pin (mise not left)" "s/^MISE_SHA256=.*/MISE_SHA256=$ZERO/"
tamper "wrong Node archive pin" "s/^NODE_TAR_SHA256=.*/NODE_TAR_SHA256=$ZERO/"
tamper "wrong Node binary pin (install removed)" "s/^NODE_BIN_SHA256=.*/NODE_BIN_SHA256=$ZERO/"
tamper "blocked download (no such mise release)" "s/^MISE_VERSION=.*/MISE_VERSION=0.0.1/"
tamper "paranoid off in the config (mise not left)" "s/^paranoid = true$/paranoid = false/"
echo "### not x86_64 (a uname stub)"
mkdir -p /tmp/stub
printf '#!/bin/sh\n[ "$1" = -m ] && { echo aarch64; exit 0; }\nexec /usr/bin/uname "$@"\n' > /tmp/stub/uname; chmod 0755 /tmp/stub/uname
PATH="/tmp/stub:$PATH" bash /s/cloud-setup.sh 2>&1 | grep -E '^WARN: (Node|node)|^pact cloud copy'
echo "wrappers left: $(wrappers_left)"
echo "### the Node block alone, from nothing installed (C8: 30 s or less)"
{ sed -n '/^FETCH_BUDGET=/,/^left() /p' /s/cloud-setup.sh; sed -n '/^echo "== Node"$/,/^echo "== Plugins"$/p' /s/cloud-setup.sh; } > /tmp/node-block.sh
node_reset; start=$(date +%s); bash /tmp/node-block.sh; echo "node block: $(( $(date +%s) - start )) s"
echo "### an untrusted mise.toml (C10)"
mkdir -p /tmp/untrusted && printf '[tools]\nnode = "22"\n' > /tmp/untrusted/mise.toml
(cd /tmp/untrusted && /root/.local/bin/mise install > /tmp/untrusted.log 2>&1; echo "mise install exit: $?")
sed 's/^/  /' /tmp/untrusted.log
grep -q 'are not trusted' /tmp/untrusted.log && echo "refused as untrusted: yes" || echo "refused as untrusted: NO"
echo "Node 22 installed: $(ls /root/.local/share/mise/installs/node | grep -c '^22' || true)"
(cd /tmp/untrusted && echo "node there: $(/root/.local/bin/node --version)")
echo "### another Node for one command (C1): $(cd /tmp && /root/.local/bin/mise exec node@22 -- node --version 2>&1 | tail -n 1)"

echo "################ T3 fetch checks (#183 T3)"
# The Result's own lines from one run, which is what each case reads.
result_of() { grep -E '^(MISSING: |[0-9]+/[0-9]+ skills present|skipped \(time\)|not fetched at pin|skipped \(source\)|not installed|official marketplace|WARN: |ok: |pact cloud copy|github api during setup|[0-9]+ config files written)' "$1" | sed 's/authenticated as .*/authenticated as <a login>/'; }
# Every git the setup runs, logged by a wrapper ahead of the real one.
mkdir -p /tmp/gitlog
printf '#!/bin/sh\necho "$*" >> /tmp/git-calls.log\nexec /usr/bin/git "$@"\n' > /tmp/gitlog/git; chmod 0755 /tmp/gitlog/git
# copy_with <sed expression>: a copy of the setup with lines rewritten.
copy_with() { local c; c="$(mktemp)"; sed "$1" /s/cloud-setup.sh > "$c"; echo "$c"; }
PIN_OF() { sed -n 's/^declare -rA REPO_PIN=.*\["'"${1//\//\\/}"'"\]=\([0-9a-f]\{40\}\).*/\1/p' /s/cloud-setup.sh; }
pinned_tree() { rm -rf "/tmp/pinned/$1"; mkdir -p "/tmp/pinned/$1" && git -C "/tmp/pinned/$1" init -q && git -C "/tmp/pinned/$1" fetch -q --depth 1 "https://github.com/$1" "$(PIN_OF "$1")" && git -C "/tmp/pinned/$1" checkout -q FETCH_HEAD; }

echo "### C3, C14: a pin the repo doesn't hold, and a pin key removed"
pinned_tree mephistopheles4/grimoire
c="$(copy_with 's/\["mephistopheles4\/grimoire"\]=[0-9a-f]\{40\}/["mephistopheles4\/grimoire"]=1111111111111111111111111111111111111111/; s/ \["typesafe-ai\/skills"\]=[0-9a-f]\{40\}//')"
echo "lines changed: $(diff /s/cloud-setup.sh "$c" | grep -c '^>')"
bash "$c" > /tmp/c3.log 2>&1; result_of /tmp/c3.log
echo "git's own output in the log (expect 0): $(grep -ciE '^(fatal|error|warning|hint):|remote:' /tmp/c3.log)"
echo "eagle-eye left as it was (expect identical): $(diff -rq /tmp/pinned/mephistopheles4/grimoire/skills/eagle-eye /root/.claude/skills/eagle-eye >/dev/null && echo identical || echo DIFFERS)"
rm -f "$c"

echo "### C4: a skill holding a link, and one holding .claude-plugin/plugin.json (a fixture repo)"
mkdir -p /tmp/fx/src && cd /tmp/fx/src && git init -q && git config user.email t@t && git config user.name t
mkdir -p skills/good skills/linked skills/plugged/.claude-plugin
printf -- '---\nname: x\n---\n' | tee skills/good/SKILL.md skills/linked/SKILL.md skills/plugged/SKILL.md >/dev/null
ln -s /etc/hostname skills/linked/notes.md; echo '{"name":"p"}' > skills/plugged/.claude-plugin/plugin.json
git add -A && git commit -q -m fx && FX_SHA="$(git rev-parse HEAD)" && git config uploadpack.allowAnySHA1InWant true && cd /
c="$(copy_with '/^SKILLS=($/,/^)$/c SKILLS=(\n  "fx/src skills/good"\n  "fx/src skills/linked"\n  "fx/src skills/plugged"\n)
s/^declare -rA REPO_PIN=.*/declare -rA REPO_PIN=( ["fx\/src"]='"$FX_SHA"' ["anthropics\/claude-plugins-official"]=0000000000000000000000000000000000000000 )/')"
rm -rf /root/.claude/skills/good /root/.claude/skills/linked /root/.claude/skills/plugged
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.file:///tmp/fx/.insteadOf GIT_CONFIG_VALUE_0=https://github.com/ bash "$c" > /tmp/c4.log 2>&1; result_of /tmp/c4.log | grep -E 'MISSING|skills present|good|linked|plugged'
echo "copied: $(ls /root/.claude/skills | grep -xE 'good|linked|plugged' | tr '\n' ' ')(expect good only)"
rm -rf /root/.claude/skills/good "$c"

echo "### C5: the link listing and PLUGIN_SOURCE_CHECK on fixture marketplaces, claude stubbed"
mkdir -p /tmp/stub-claude
printf '#!/bin/sh\necho "$*" >> /tmp/claude-calls.log\nexit 0\n' > /tmp/stub-claude/claude; chmod 0755 /tmp/stub-claude/claude
SHA40=0123456789abcdef0123456789abcdef01234567
# fx_mkt <name> <catalog json>: a fixture marketplace repo with one plugin folder per kind.
fx_mkt() {
  rm -rf "/tmp/fx/$1" && mkdir -p "/tmp/fx/$1/.claude-plugin" && cd "/tmp/fx/$1" && git init -q && git config user.email t@t && git config user.name t
  for p in good escape dep expmon mcp link; do mkdir -p "plugins/$p/.claude-plugin"; echo "{\"name\":\"$p\"}" > "plugins/$p/.claude-plugin/plugin.json"; done
  echo '{"name":"expmon","experimental":{"monitors":"m.json"}}' > plugins/expmon/.claude-plugin/plugin.json
  echo '{}' > plugins/mcp/.mcp.json; ln -s ../good plugins/link/peer
  printf '%s\n' "$2" > .claude-plugin/marketplace.json
  git add -A && git commit -q -m fx && git config uploadpack.allowAnySHA1InWant true && git rev-parse HEAD; cd /
}
CAT='{"name":"up","owner":{"name":"o"},"metadata":{"x":1},"renames":{"a":"b"},"plugins":[
 {"name":"good","source":"./plugins/good"},
 {"name":"nosha","source":{"source":"url","url":"https://example.invalid/x.git"}},
 {"name":"cmdsha","source":{"source":"command","command":"x","sha":"'$SHA40'"}},
 {"name":"npmsha","source":{"source":"npm","package":"x","sha":"'$SHA40'"}},
 {"name":"escape","source":"../outside"},
 {"name":"dep","source":"./plugins/dep","dependencies":["x"]},
 {"name":"expmon","source":"./plugins/expmon"},
 {"name":"mcp","source":"./plugins/mcp"},
 {"name":"link","source":"./plugins/link"},
 {"name":"ext","source":{"source":"github","repo":"a/b","sha":"'$SHA40'"}}]}'
# run_plugins <repo> <plugins...>: the setup's own definitions and install_plugins, on that repo.
run_plugins() {
  local repo="$1" sha="$2"; shift 2
  rm -f /tmp/claude-calls.log; rm -rf /root/.claude/pact-pinned
  { sed -n '1,/^echo "== Node"$/p' /s/cloud-setup.sh | sed '$d' | sed "s/^declare -rA REPO_PIN=.*/declare -rA REPO_PIN=( [\"$repo\"]=$sha )/"
    sed -n '/^install_plugins() {$/,/^}$/p' /s/cloud-setup.sh
    echo "install_plugins $repo pact-pinned-plugins $*"
    echo 'echo "skipped (source): ${SKIPPED_SOURCE[*]}"; echo "not installed: ${NOT_INSTALLED[*]}"; echo "skipped (time): ${SKIPPED_TIME[*]}"'
  } > /tmp/plugins-only.sh
  PATH="/tmp/stub-claude:$PATH" GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.file:///tmp/fx/.insteadOf GIT_CONFIG_VALUE_0=https://github.com/ bash /tmp/plugins-only.sh 2>&1
  echo "claude calls: $(grep -c . /tmp/claude-calls.log 2>/dev/null || echo 0); marketplace add: $(grep -c 'marketplace add' /tmp/claude-calls.log 2>/dev/null || echo 0)"
}
S1="$(fx_mkt fx/mkt "$CAT")"
run_plugins fx/mkt "$S1" good nosha cmdsha npmsha escape dep expmon mcp link ext
echo "installs: $(grep 'plugin install' /tmp/claude-calls.log | tr '\n' ';')"
echo "reduced catalog: $(jq -c '{name, keys: keys, plugins: [.plugins[].name]}' /root/.claude/pact-pinned/pact-pinned-plugins/.claude-plugin/marketplace.json)"
echo "# a link as the catalog file"
S2="$(fx_mkt fx/mkt-linkcat '{}')"; cd /tmp/fx/fx/mkt-linkcat && echo '{"plugins":[]}' > /tmp/fx/outside.json && rm .claude-plugin/marketplace.json && ln -s /tmp/fx/outside.json .claude-plugin/marketplace.json && git add -A && git commit -q -m link && S2="$(git rev-parse HEAD)"; cd /
run_plugins fx/mkt-linkcat "$S2" good mcp
echo "outside file unchanged (expect {\"plugins\":[]}): $(cat /tmp/fx/outside.json)"
echo "# an unparsable catalog"
S3="$(fx_mkt fx/mkt-bad '{"plugins": [ not json')"
run_plugins fx/mkt-bad "$S3" claude-code-setup claude-security code-review coderabbit security-guidance skill-creator superpowers

echo "### C7: PROXY_LINE_PROGRAM on fixture bodies"
eval "$(sed -n "/^IFS= read -r -d '' PROXY_LINE_PROGRAM <<'PROXY_LINE_PROGRAM_EOF'$/,/^PROXY_LINE_PROGRAM_EOF$/p" /s/cloud-setup.sh)"
proxy() { printf '%s\n%s' "$1" "$2" | /root/.local/bin/node -e "$PROXY_LINE_PROGRAM" 2>&1; }
echo "email field: $(proxy '{"login":"octo-cat","email":"leak@example.com"}' 200)   expect: authenticated as octo-cat"
echo "line break in login: $(proxy '{"login":"octo\ncat"}' 200)   expect: unexpected"
echo "401: $(proxy '{"message":"Bad credentials"}' 401)   expect: anonymous"
echo "not JSON, with a marker: $(proxy 'MARKER-7f3a not json at all' 200)   expect: unexpected, and no MARKER"

echo "### C12: FETCH_BUDGET=1"
c="$(copy_with 's/^FETCH_BUDGET=270$/FETCH_BUDGET=1/')"
echo "lines changed: $(diff /s/cloud-setup.sh "$c" | grep -c '^>')"
bash "$c" > /tmp/c12.log 2>&1; result_of /tmp/c12.log | grep -vE '^(ok|WARN): ' ; echo "skipped (time) names: $(grep '^skipped (time): ' /tmp/c12.log | wc -w)"
rm -f "$c"

echo "### C17: INSTALL_ANTHROPIC_SKILLS=1"
INSTALL_ANTHROPIC_SKILLS=1 bash /s/cloud-setup.sh 2>&1 | grep -E '^WARN: INSTALL_'

echo "### C18: no timeout on the PATH"
mv /usr/bin/timeout /usr/bin/timeout.off; rm -f /tmp/git-calls.log
PATH="/tmp/gitlog:$PATH" bash /s/cloud-setup.sh > /tmp/c18.log 2>&1; mv /usr/bin/timeout.off /usr/bin/timeout
result_of /tmp/c18.log | grep -vE '^(ok|WARN): '
echo "git commands run (expect 0): $(grep -c . /tmp/git-calls.log 2>/dev/null || echo 0)"

echo "### C20: an installed skill edited away from its pin"
pinned_tree mattpocock/skills
echo "edited" >> /root/.claude/skills/tdd/SKILL.md; echo stray > /root/.claude/skills/tdd/stray.md
bash /s/cloud-setup.sh > /tmp/c20.log 2>&1
echo "tdd equals its pinned path: $(diff -r /tmp/pinned/mattpocock/skills/skills/engineering/tdd /root/.claude/skills/tdd >/dev/null && echo yes || echo NO)"
echo "nested or leftover folders (expect none): $(find /root/.claude/skills -maxdepth 2 \( -name 'tdd' -path '*/tdd/tdd' -o -name '.pact-*' \) | tr '\n' ' ')"
echo "every setup-copied skill equals its pinned path:"
for r in cloudflare/skills humanlayer/skills mattpocock/skills mephistopheles4/grimoire typesafe-ai/skills; do [ -d "/tmp/pinned/$r" ] || pinned_tree "$r"; done
n=0; d=0
for e in $(sed -n '/^SKILLS=($/,/^)$/p' /s/cloud-setup.sh | sed -n 's/^  "\(.*\) \(.*\)"$/\1:\2/p'); do
  r="${e%%:*}"; p="${e#*:}"; n=$((n+1)); diff -r "/tmp/pinned/$r/$p" "/root/.claude/skills/$(basename "$p")" >/dev/null || { d=$((d+1)); echo "  DIFFERS: $p"; }
done
echo "  $n checked, $d differ"

echo "################ merge unit tests"
# Pull the overlay-independent merge code out of the script and load it.
sed -n "/^MERGE_PROGRAM='/,/^}/p" /s/cloud-setup.sh > /tmp/merge.sh
source /tmp/merge.sh
t() { export CLAUDE_HOME="$(mktemp -d)"; CONFIG_WRITTEN=0; }

t; echo '{"permissions":{"allow":["A","B"]}}' > "$CLAUDE_HOME/settings.json"
merge_settings '{"permissions":{"allow":["B","C"],"deny":["D"]}}'
echo "join+dedupe: $(jq -c .permissions "$CLAUDE_HOME/settings.json")   expect {\"allow\":[\"A\",\"B\",\"C\"],\"deny\":[\"D\"]}"

t; merge_settings '{"model":"x"}'
echo "absent file: $(jq -c . "$CLAUDE_HOME/settings.json")   expect {\"model\":\"x\"}"

t; printf 'not json' > "$CLAUDE_HOME/settings.json"; merge_settings '{"model":"x"}'
echo "invalid file now: $(cat "$CLAUDE_HOME/settings.json")   expect: not json; leftover temp files: $(ls -A "$CLAUDE_HOME" | grep -c '^\.settings')"

t; echo '{"enabledPlugins":{"p@m":true}}' > "$CLAUDE_HOME/settings.json"
merge_settings '{"enabledPlugins":{"p@m":false,"q@m":true}}'
echo "plugin key conflict: $(jq -c .enabledPlugins "$CLAUDE_HOME/settings.json")   expect {\"p@m\":true}"

t; echo '{}' > "$CLAUDE_HOME/settings.json"; PATH_SAVE="$PATH"; PATH=/nonexistent
merge_settings '{"model":"x"}'; PATH="$PATH_SAVE"
echo "no jq: $(cat "$CLAUDE_HOME/settings.json")   expect {}"
