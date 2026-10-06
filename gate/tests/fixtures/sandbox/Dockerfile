# The isolated sandbox for the QA pair's security-set runs and the P-QA probe (#47).
#
# A run happens inside this container, which holds only the run's own folders
# and the installed pact files it needs, mounted read-only. The-pact's checkout,
# with every expected answer, is never mounted, so a run cannot read it.
# Nothing secret goes into the image: the owner signs Claude Code in inside the
# container, and the sign-in lives in a named volume, never in a layer.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The same Claude Code version as the owner's machine on 2026-10-06.
RUN npm install -g @anthropic-ai/claude-code@2.1.291 && npm cache clean --force

RUN useradd --create-home --shell /bin/bash runner
USER runner
RUN mkdir -p /home/runner/.claude/agents /home/runner/.claude/pact /home/runner/ws /home/runner/in \
 && git config --global user.name runner \
 && git config --global user.email runner@localhost \
 && git config --global init.defaultBranch main
WORKDIR /home/runner/ws
CMD ["bash"]
