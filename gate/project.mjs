#!/usr/bin/env node
// The command line for the project install (#155): runs the check in
// project-core.mjs on this process's arguments, prints its lines and sets the
// exit code. Nothing else lives here; project-core.mjs says what the check
// does.
import { check } from './project-core.mjs';

const report = check(process.argv.slice(2));
process.stdout.write(`${report.lines.join('\n')}\n`);
process.exitCode = report.failed ? 1 : 0;
