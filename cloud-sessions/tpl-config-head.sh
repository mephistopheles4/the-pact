echo "== Config"
CLAUDE_HOME="$HOME/.claude"
CONFIG_WRITTEN=0
mkdir -p "$CLAUDE_HOME/agents" || echo "WARN: cannot create $CLAUDE_HOME/agents"
# A written path: .pact/ paths sit under the home folder, the rest under ~/.claude.
config_file() { case "$1" in .pact/*) printf '%s' "$HOME/$1" ;; *) printf '%s' "$CLAUDE_HOME/$1" ;; esac; }
config_shown() { case "$1" in .pact/*) printf '~/%s' "$1" ;; *) printf '~/.claude/%s' "$1" ;; esac; }

# write_config <path>, body on stdin. Script-owned: overwrites.
write_config() {
  local file; file="$(config_file "$1")"
  if mkdir -p "${file%/*}" && cat > "$file"; then
    CONFIG_WRITTEN=$((CONFIG_WRITTEN + 1)); echo "wrote $(config_shown "$1")"
  else
    echo "WARN: could not write $(config_shown "$1")"
  fi
}

