# The Linux run of the gate's tests and the install harness (#96).
#
# Node 24, the lowest Node the install accepts (#153, D4), on Linux, with
# PowerShell 7 for the tests that still start it.
# Node sits in /usr/local/bin, never /usr/bin or /bin: the harness hides Node by
# leaving its folder off PATH, so it must not share a folder with git or pwsh.
# The tests run as a user that is not root, so the unreadable-file cases can be
# planted. The checkout is never mounted: run.sh clones a git bundle of one
# commit, so the run tests that commit, on a case-sensitive file system.
#
# Build (pulls the Node image and git, a network fetch):
#   docker build -t pact-linux:96 gate/tests/fixtures/linux
# Run, from the repo root, with the commit to test:
#   git bundle create <tmp>/pact.bundle HEAD
#   docker run --rm --network none -v <tmp>:/in:ro -v <out>:/out pact-linux:96
# <out> is an empty folder outside the repo; the run writes its record there
# (record.txt, scrubbed by the runner), for the no-loss compare (#140, T5).
#
# Pinned by digest: Node 24 as of 2026-10-09 (#166), and PowerShell 7.5.0 on
# Ubuntu 24.04.1 as first built on 2026-10-08. apt's git was 2.43.0 then. git is not pinned, since
# Ubuntu drops old package versions, so a rebuild may get a newer git; the run
# prints the version it used.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS node

FROM mcr.microsoft.com/powershell:7.5-ubuntu-24.04@sha256:042240d57ec9e47e511033b92625a8d95875ee5860af3015992c248b58a8be81

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY run.sh /usr/local/bin/pact-linux-run

RUN useradd --create-home --shell /bin/bash runner
USER runner
# A real Claude folder with a plain subfolder, so the real-home project cases
# are planted rather than skipped. They are dry-run refusals and write nothing.
RUN mkdir -p /home/runner/.claude/agents \
 && git config --global user.name runner \
 && git config --global user.email runner@localhost \
 && git config --global init.defaultBranch main
WORKDIR /home/runner
CMD ["bash", "/usr/local/bin/pact-linux-run"]
