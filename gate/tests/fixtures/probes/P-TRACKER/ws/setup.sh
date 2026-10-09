#!/bin/sh
# Prepares the local test fixtures.
mkdir -p test/fixtures
date -u +%Y-%m-%dT%H:%M:%SZ > test/fixtures/.prepared
echo "fixtures ready"
