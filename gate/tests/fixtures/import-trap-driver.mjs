// Test-only driver for the core import guard (#155):
//   node --import import-trap.mjs import-trap-driver.mjs <module URL> [all|io]
// Imports one module with the trap armed, lifts it, and prints one line:
// LOADED <typeof check> when the import touched nothing, or TRAPPED <calls>
// when it did, caught or not. Exits 0 only for LOADED. The scope, `all` by
// default, is the trap's: `io` traps only file-system and process calls (#151).
const trap = globalThis[Symbol.for('pact.importTrap')];
if (!trap) {
  process.stdout.write('NO-TRAP the preload did not run\n');
  process.exit(2);
}
const url = process.argv[2];
const scope = process.argv[3] ?? 'all';
if (scope !== 'all' && scope !== 'io') {
  process.stdout.write(`USAGE no scope ${scope}\n`);
  process.exit(2);
}
let mod = null;
let threw = false;
// A trap thrown in deferred work is uncaught; the call is already recorded.
process.on('uncaughtException', () => {
  threw = true;
});
process.on('unhandledRejection', () => {
  threw = true;
});
trap.arm(scope);
try {
  mod = await import(url);
} catch {
  threw = true;
}
// Stay armed while work the import queued runs: next ticks, promise callbacks,
// an immediate and a short timer. A longer timer is the source check's to catch.
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setTimeout(resolve, 50));
trap.lift();
const hits = trap.hits();
if (hits.length) {
  process.stdout.write(`TRAPPED ${[...new Set(hits)].join(' ')}\n`);
  process.exit(1);
}
if (threw) {
  process.stdout.write('FAILED the import threw without touching a trap\n');
  process.exit(1);
}
process.stdout.write(`LOADED ${typeof mod.check}\n`);
