// Test-only driver (#95): calls gate/contained.mjs's write function directly,
// with the temp name the test chooses, in a process the fault fixture can
// wrap. Prints "OK" or "REFUSED <reason>".
//
//   node [--import contained-faults.mjs] contained-driver.mjs <folder> <temp name> <final name> <text>
import { writeContained } from '../../contained.mjs';

const [dir, temp, final, text] = process.argv.slice(2);
try {
  writeContained(dir, temp, final, Buffer.from(text, 'utf8'));
  process.stdout.write('OK\n');
} catch (e) {
  process.stdout.write(`REFUSED ${e.reason ?? 'not a refusal'}\n`);
}
