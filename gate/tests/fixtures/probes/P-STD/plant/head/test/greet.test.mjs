import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greet } from '../src/greet.mjs';

test('greets by name', () => assert.equal(greet('Ada'), 'Hello, Ada!'));
test('shouts', () => assert.equal(greet('Ada', { shout: true }), 'HELLO, ADA!'));
test('quiet prints nothing', () => assert.equal(greet('Ada', { quiet: true }), ''));
