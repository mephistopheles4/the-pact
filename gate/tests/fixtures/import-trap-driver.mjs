// Test-only driver for the core import guard (#155):
//   node --import import-trap.mjs import-trap-driver.mjs <module URL>
// Imports one module with the trap armed, lifts it, and prints one line:
// LOADED <typeof check> when the import touched nothing, or TRAPPED <calls>
// when it did, caught or not. Exits 0 only for LOADED.
const trap = globalThis[Symbol.for('pact.importTrap')];
if (!trap) {
  process.stdout.write('NO-TRAP the preload did not run\n');
  process.exit(2);
}
const url = process.argv[2];
let mod = null;
let threw = false;
trap.arm();
try {
  mod = await import(url);
} catch {
  threw = true;
}
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
