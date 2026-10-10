// S15 CI probe (#166): fails on purpose. Never merge.
import { test } from 'node:test';
test('S15 probe: a red check', () => { throw new Error('S15 probe: red on purpose'); });
