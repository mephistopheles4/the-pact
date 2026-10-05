import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slug } from '../src/slug.mjs';

test('words join with single hyphens', () => assert.equal(slug('Hello  big World'), 'hello-big-world'));
test('no hyphen at either end', () => assert.equal(slug('  !Hi! '), 'hi'));
