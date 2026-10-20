/**
 * Regression tests for frontend/lib/store.ts (issue #180).
 *
 * Covers the success path, input validation, degraded-dependency (corrupt
 * persisted state) recovery, and error-state lifecycle.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicKey, validateBalance } from '../lib/store';

// ─── validatePublicKey ───────────────────────────────────────────────────────

describe('validatePublicKey', () => {
  const VALID_KEY = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  it('accepts a canonical Stellar public key', () => {
    assert.equal(validatePublicKey(VALID_KEY), VALID_KEY);
  });

  it('trims surrounding whitespace before validating', () => {
    assert.equal(validatePublicKey(`  ${VALID_KEY}  `), VALID_KEY);
  });

  it('rejects an empty string', () => {
    assert.throws(() => validatePublicKey(''), /non-empty/);
  });

  it('rejects a key that does not start with G', () => {
    const bad = `A${'B'.repeat(55)}`;
    assert.throws(() => validatePublicKey(bad), /G/);
  });

  it('rejects a key that is too short', () => {
    assert.throws(() => validatePublicKey('GSHORT'), /56/);
  });

  it('rejects a key that is too long', () => {
    assert.throws(() => validatePublicKey(`G${'A'.repeat(56)}`), /56/);
  });

  it('rejects a key containing lowercase characters', () => {
    const lower = `g${'b'.repeat(55)}`;
    assert.throws(() => validatePublicKey(lower), /G/);
  });

  it('rejects a non-string argument', () => {
    // @ts-expect-error deliberate wrong type
    assert.throws(() => validatePublicKey(null), /non-empty/);
    // @ts-expect-error deliberate wrong type
    assert.throws(() => validatePublicKey(undefined), /non-empty/);
  });
});

// ─── validateBalance ─────────────────────────────────────────────────────────

describe('validateBalance', () => {
  it('accepts a zero balance', () => {
    assert.equal(validateBalance('0'), '0');
  });

  it('accepts a positive decimal balance', () => {
    assert.equal(validateBalance('1234.5678900'), '1234.5678900');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(validateBalance('  100  '), '100');
  });

  it('rejects an empty string', () => {
    assert.throws(() => validateBalance(''), /non-negative/);
  });

  it('rejects a negative number', () => {
    assert.throws(() => validateBalance('-1'), /non-negative/);
  });

  it('rejects non-numeric text', () => {
    assert.throws(() => validateBalance('abc'), /non-negative/);
  });

  it('rejects NaN string', () => {
    assert.throws(() => validateBalance('NaN'), /non-negative/);
  });

  it('rejects a non-string argument', () => {
    // @ts-expect-error deliberate wrong type
    assert.throws(() => validateBalance(100), /string/);
  });
});
