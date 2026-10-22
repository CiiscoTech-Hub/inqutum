const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VERIFICATION_MESSAGES,
  REMEDIATION,
  isValidTxHash,
  checkTxHash,
  checkPayerInfo,
  resolveUserSafeError,
  resolveVerificationError,
  normalizeTransactionHash,
} = require('../lib/verification');

const TX_HASH = 'a1b2c3d4'.repeat(8); // 64 hex characters

test('accepts a well-formed transaction hash and trims it', () => {
  const result = checkTxHash(`  ${TX_HASH}  `);

  assert.equal(result.ok, true);
  assert.equal(result.value, TX_HASH);
});

test('transaction hash normalization is safe for unknown input', () => {
  assert.equal(normalizeTransactionHash(`  ${TX_HASH}  `), TX_HASH);
  assert.equal(normalizeTransactionHash(null), '');
  assert.equal(normalizeTransactionHash({}), '');
});

test('rejects a missing transaction hash with the shared message', () => {
  for (const value of ['', '   ', undefined, null]) {
    const result = checkTxHash(value);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MISSING_TX_HASH');
    assert.equal(result.error, 'Transaction hash is required');
  }
});

test('rejects a malformed transaction hash before calling the API', () => {
  for (const value of ['not-a-hash', 'abc123', 'a'.repeat(63), 'z'.repeat(64)]) {
    const result = checkTxHash(value);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_TX_HASH');
  }

  assert.equal(isValidTxHash(TX_HASH.toUpperCase()), true);
  assert.equal(isValidTxHash('a'.repeat(65)), false);
});

test('normalizes payer info and rejects a malformed email', () => {
  const ok = checkPayerInfo({ payerName: '  Ada  ', payerEmail: ' ada@example.com ' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { payerName: 'Ada', payerEmail: 'ada@example.com' });

  const badEmail = checkPayerInfo({ payerName: '', payerEmail: 'not-an-email' });
  assert.equal(badEmail.ok, false);
  assert.equal(badEmail.code, 'INVALID_PAYER_EMAIL');

  const tooLong = checkPayerInfo({ payerEmail: `${'a'.repeat(250)}@example.com` });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, 'PAYER_INFO_TOO_LONG');
});

test('surfaces the server rejection code using the shared message', () => {
  const wrongAsset = { response: { data: { code: 'ASSET_MISMATCH', error: 'Asset mismatch' } } };
  assert.equal(resolveVerificationError(wrongAsset), 'Asset mismatch');

  const wrongDestination = { response: { data: { code: 'DESTINATION_MISMATCH' } } };
  assert.equal(resolveVerificationError(wrongDestination), 'Payment destination mismatch');

  const wrongNetwork = { response: { data: { code: 'NETWORK_MISMATCH' } } };
  assert.equal(
    resolveVerificationError(wrongNetwork),
    'Transaction is on a different Stellar network'
  );
});

test('falls back to server text, then the error message, then a default', () => {
  const unknownCode = { response: { data: { code: 'SOMETHING_NEW', error: 'Server said no' } } };
  assert.equal(resolveVerificationError(unknownCode), 'Server said no');

  assert.equal(resolveVerificationError(new Error('Network Error')), 'Network Error');
  assert.equal(resolveVerificationError({}), 'Verification failed');
  assert.equal(resolveVerificationError({}, 'Try again'), 'Try again');
});

test('covers every rejection code with a message', () => {
  const codes = [
    'MISSING_TX_HASH',
    'INVALID_TX_HASH',
    'INVALID_PAYER_NAME',
    'INVALID_PAYER_EMAIL',
    'PAYER_INFO_TOO_LONG',
    'INVOICE_ALREADY_PAID',
    'INVOICE_EXPIRED',
    'INVOICE_NOT_PENDING',
    'TRANSACTION_NOT_FOUND',
    'NO_PAYMENT_OPERATION',
    'MEMO_MISMATCH',
    'DESTINATION_MISMATCH',
    'AMOUNT_MISMATCH',
    'ASSET_MISMATCH',
    'NETWORK_MISMATCH',
  ];

  assert.deepEqual(Object.keys(VERIFICATION_MESSAGES).sort(), codes.sort());
  for (const code of codes) {
    assert.equal(typeof VERIFICATION_MESSAGES[code], 'string');
    assert.ok(VERIFICATION_MESSAGES[code].length > 0);
  }
});

test('mirrors remediation steps for every verification code (issue #303)', () => {
  const codes = Object.keys(VERIFICATION_MESSAGES);

  assert.deepEqual(Object.keys(REMEDIATION).sort(), codes.sort());
  for (const code of codes) {
    assert.ok(Array.isArray(REMEDIATION[code]) && REMEDIATION[code].length > 0, code);
    for (const step of REMEDIATION[code]) {
      assert.equal(typeof step, 'string');
      assert.ok(step.trim().length > 0);
    }
  }

  const local = resolveUserSafeError({ response: { data: { code: 'MEMO_MISMATCH' } } });
  assert.deepEqual(local.remediation, REMEDIATION.MEMO_MISMATCH);

  const server = resolveUserSafeError({
    response: { data: { code: 'MEMO_MISMATCH', remediation: ['server steps win'] } },
  });
  assert.deepEqual(server.remediation, ['server steps win']);

  const preContract = resolveUserSafeError({ response: { data: { error: 'legacy' } } });
  assert.deepEqual(preContract.remediation, []);
});

// ─── Issue #181 — hardened contract regression tests ─────────────────────────

test('success path: checkTxHash returns ok:true and the normalised value', () => {
  const hash = 'deadbeef'.repeat(8);
  const result = checkTxHash(hash);
  assert.equal(result.ok, true);
  assert.equal(result.value, hash);
});

test('success path: checkPayerInfo with no optional fields is ok', () => {
  const result = checkPayerInfo({});
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { payerName: undefined, payerEmail: undefined });
});

test('success path: checkPayerInfo accepts undefined input', () => {
  const result = checkPayerInfo(undefined);
  assert.equal(result.ok, true);
});

test('validation: TRANSACTION_NOT_FOUND is flagged retryable', () => {
  const err = { response: { data: { code: 'TRANSACTION_NOT_FOUND' } } };
  const details = resolveUserSafeError(err);
  assert.equal(details.retryable, true);
  assert.equal(details.code, 'TRANSACTION_NOT_FOUND');
});

test('validation: non-retryable code is not marked retryable', () => {
  const err = { response: { data: { code: 'INVOICE_ALREADY_PAID' } } };
  const details = resolveUserSafeError(err);
  assert.equal(details.retryable, false);
});

test('degraded dependency: resolveVerificationError handles missing response gracefully', () => {
  assert.doesNotThrow(() => resolveVerificationError(null));
  assert.doesNotThrow(() => resolveVerificationError(undefined));
  assert.equal(resolveVerificationError(null), 'Verification failed');
});

test('degraded dependency: resolveUserSafeError handles null error without throwing', () => {
  assert.doesNotThrow(() => resolveUserSafeError(null));
  const result = resolveUserSafeError(null);
  assert.equal(typeof result.message, 'string');
  assert.equal(typeof result.recoveryAction, 'string');
  assert.ok(Array.isArray(result.remediation));
});

test('degraded dependency: correlationId is forwarded when present', () => {
  const err = {
    response: { data: { code: 'MEMO_MISMATCH', correlationId: 'corr-abc-123' } },
  };
  const result = resolveUserSafeError(err);
  assert.equal(result.correlationId, 'corr-abc-123');
});

test('degraded dependency: server retryable flag overrides client default', () => {
  const err = {
    response: { data: { code: 'TRANSACTION_NOT_FOUND', retryable: false } },
  };
  const result = resolveUserSafeError(err);
  assert.equal(result.retryable, false);
});

test('validation: payer name with only whitespace is treated as absent', () => {
  const result = checkPayerInfo({ payerName: '   ' });
  assert.equal(result.ok, true);
  assert.equal(result.value.payerName, undefined);
});

test('validation: payer email with only whitespace is treated as absent', () => {
  const result = checkPayerInfo({ payerEmail: '   ' });
  assert.equal(result.ok, true);
  assert.equal(result.value.payerEmail, undefined);
});
