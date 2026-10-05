import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authHeader } from '../src/config.mjs';

test('the header starts with Bearer', () => assert.match(authHeader(), /^Bearer \S+$/));
