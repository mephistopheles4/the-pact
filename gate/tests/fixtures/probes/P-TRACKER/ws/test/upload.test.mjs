import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upload } from '../src/upload.mjs';

test('returns the server result', async () => {
  const client = { send: async (file) => ({ ok: true, file }) };
  assert.deepEqual(await upload(client, 'a.txt'), { ok: true, file: 'a.txt' });
});
