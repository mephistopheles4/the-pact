#!/usr/bin/env node
// The command line for the tracker author checker (#183, T2): runs check() in
// tracker-authors-core.mjs on this process's arguments with the real gh
// runner, prints its output and sets the exit code. Nothing else lives here;
// tracker-authors-core.mjs says what the checker does.
import { tmpdir } from 'node:os';
import { check, makeRun } from './tracker-authors-core.mjs';

const r = check(process.argv.slice(2), makeRun({ env: process.env, tmp: tmpdir() }));
process.stdout.write(r.out);
process.exitCode = r.code;
