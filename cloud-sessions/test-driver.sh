#!/usr/bin/env bash
# Runs inside a throwaway ubuntu:24.04 container. /s = a scratch folder (ro)
# holding the generated scripts and CLAUDE.cloud.md; /repo = this repo (ro).
# Never mount your home folder. Nothing is written to either mount.
set -u
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq jq git ca-certificates >/dev/null 2>&1
echo "### tools: $(jq --version), $(git --version), npx=$(command -v npx || echo none), claude=$(command -v claude || echo none), HOME=$HOME, user=$(id -un)"

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
  for f in /repo/claude/agents/*.md /repo/familiars/scout.md; do
    diff -u "$f" "/root/.claude/agents/$(basename "$f")" || echo "DIFFERS: $(basename "$f")"
  done
  echo "### agents written: $(ls /root/.claude/agents | wc -l) (expect $(( $(ls /repo/claude/agents/*.md | wc -l) + 1 )))"
  echo "### diff: written pact/cross.mjs vs cross/cross.mjs (expect empty)"; diff -u /repo/cross/cross.mjs /root/.claude/pact/cross.mjs && echo "(identical)"
}

echo "################ PASS 1"; bash /s/cloud-setup.sh; echo "exit: $?"
snapshot > /tmp/after1.txt; cat /tmp/after1.txt
echo "################ PASS 2"; bash /s/cloud-setup.sh; echo "exit: $?"
snapshot > /tmp/after2.txt; cat /tmp/after2.txt
echo "################ snapshot after pass 1 vs after pass 2 (expect empty)"
diff -u /tmp/after1.txt /tmp/after2.txt && echo "(identical)"

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
