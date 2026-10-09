#!/usr/bin/env node
// The command line for the renderer (#155): runs the check in render-core.mjs
// on this process's arguments, prints its lines and sets the exit code. Nothing
// else lives here; render-core.mjs says what the check does.
import { check } from './render-core.mjs';

const report = check(process.argv.slice(2));
process.stdout.write(`${report.lines.join('\n')}\n`);
process.exitCode = report.failed ? 1 : 0;
