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
set -u
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && # curl and gpg: the cloud image has both, and the Node block uses them (#183).
apt-get install -y -qq jq git ca-certificates curl gnupg >/dev/null 2>&1
echo "### tools: $(jq --version), $(git --version), $(curl --version | head -n 1 | cut -d ' ' -f 1-2), npx=$(command -v npx || echo none), claude=$(command -v claude || echo none), HOME=$HOME, user=$(id -un)"

# Stand-in for the plugin step's output, plus an allow rule and env key the overlay lacks.
mkdir -p /root/.claude
cat > /root/.claude/settings.json <<'JSON'
{
  "enabledPlugins": { "superpowers@claude-plugins-official": true },
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

echo "################ PASS 1"; bash /s/cloud-setup.sh; echo "exit: $?"
snapshot > /tmp/after1.txt; cat /tmp/after1.txt
echo "################ PASS 2"; bash /s/cloud-setup.sh; echo "exit: $?"
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
{ echo 'T="timeout 300"'; sed -n '/^echo "== Node"$/,/^echo "== Skills"$/p' /s/cloud-setup.sh; } > /tmp/node-block.sh
node_reset; start=$(date +%s); bash /tmp/node-block.sh; echo "node block: $(( $(date +%s) - start )) s"
echo "### an untrusted mise.toml (C10)"
mkdir -p /tmp/untrusted && printf '[tools]\nnode = "22"\n' > /tmp/untrusted/mise.toml
(cd /tmp/untrusted && /root/.local/bin/mise install > /tmp/untrusted.log 2>&1; echo "mise install exit: $?")
sed 's/^/  /' /tmp/untrusted.log
grep -q 'are not trusted' /tmp/untrusted.log && echo "refused as untrusted: yes" || echo "refused as untrusted: NO"
echo "Node 22 installed: $(ls /root/.local/share/mise/installs/node | grep -c '^22' || true)"
(cd /tmp/untrusted && echo "node there: $(/root/.local/bin/node --version)")
echo "### another Node for one command (C1): $(cd /tmp && /root/.local/bin/mise exec node@22 -- node --version 2>&1 | tail -n 1)"

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
