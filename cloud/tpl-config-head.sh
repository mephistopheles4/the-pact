echo "== Config"
CLAUDE_HOME="$HOME/.claude"
CONFIG_WRITTEN=0
mkdir -p "$CLAUDE_HOME/agents" || echo "WARN: cannot create $CLAUDE_HOME/agents"

# write_config <path under ~/.claude>, body on stdin. Script-owned: overwrites.
write_config() {
  if cat > "$CLAUDE_HOME/$1"; then
    CONFIG_WRITTEN=$((CONFIG_WRITTEN + 1)); echo "wrote ~/.claude/$1"
  else
    echo "WARN: could not write ~/.claude/$1"
  fi
}

