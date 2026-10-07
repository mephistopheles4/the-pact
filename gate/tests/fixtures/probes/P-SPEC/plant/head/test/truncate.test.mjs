import assert from 'node:assert/strict';
import { test } from 'node:test';
import { truncate } from '../src/truncate.mjs';

test('a short title is unchanged', () => assert.equal(truncate('Dune', 10), 'Dune'));
test('a long title is cut with an ellipsis', () => assert.equal(truncate('The Left Hand of Darkness', 10), 'The Left …'));
test('n below 1 throws', () => assert.throws(() => truncate('x', 0), RangeError));
