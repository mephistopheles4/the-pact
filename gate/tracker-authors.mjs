#!/usr/bin/env node
// The command line for the tracker author checker (#183, T2): runs checkAtHome()
// in tracker-authors-core.mjs on this process's arguments with the real gh
// runner, prints its output and sets the exit code. Nothing else lives here;
// tracker-authors-core.mjs says what the checker does, the home's pin file and
// the stripping of token variables for a pinned app included (#599).
import * as fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { checkAtHome } from './tracker-authors-core.mjs';

const r = checkAtHome({ argv: process.argv.slice(2), env: process.env, home: homedir(), fs, tmp: tmpdir() });
process.stdout.write(r.out);
process.exitCode = r.code;
