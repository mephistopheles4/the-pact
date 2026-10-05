import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withRetry } from '../src/retry.mjs';

test('returns the value on success', async () => assert.equal(await withRetry(async () => 7), 7));
