#!/usr/bin/env node
// The command line for the tracker author checker (#183, T2): runs check() in
// tracker-authors-core.mjs on this process's arguments with the real gh
// runner, prints its output and sets the exit code. Nothing else lives here;
// tracker-authors-core.mjs says what the checker does. It reads the home's pin
// file and whether the agent-identity helper is installed (#599) and hands both
// to check(); a pinned app also takes the token variables out of gh's environment.
import * as fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { check, isPinned, makeRun, pinInputFrom } from './tracker-authors-core.mjs';

const pinInput = pinInputFrom({ home: homedir(), fs });
const r = check(process.argv.slice(2), makeRun({ env: process.env, tmp: tmpdir(), strip: isPinned(pinInput) }), pinInput);
process.stdout.write(r.out);
process.exitCode = r.code;
