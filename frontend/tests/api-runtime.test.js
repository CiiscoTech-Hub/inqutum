const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ApiRequestError,
  ApiUnavailableError,
  apiErrorMessage,
  isApiUnavailableError,
  resolveApiConfig,
  toApiError,
} = require('../lib/api-runtime');

test('production API config requires HTTPS and an /api suffix', () => {
  assert.equal(resolveApiConfig('https://api.example.com/api/', 'production').baseUrl,
    'https://api.example.com/api');
  assert.equal(resolveApiConfig('http://api.example.com/api', 'production').configured, false);
  assert.equal(resolveApiConfig('https://api.example.com', 'production').configured, false);
});

test('missing production config fails visibly instead of pointing at visitor localhost', () => {
  const config = resolveApiConfig(undefined, 'production');
  assert.equal(config.configured, false);
  assert.match(config.error, /NEXT_PUBLIC_API_URL/);
  assert.doesNotMatch(config.baseUrl, /localhost/);
});

test('local development keeps the documented localhost fallback', () => {
  assert.equal(resolveApiConfig(undefined, 'development').baseUrl, 'http://localhost:3001/api');
});

test('network, timeout, and server failures normalize to a retryable offline error', () => {
  for (const error of [
    { code: 'ERR_NETWORK' },
    { code: 'ECONNABORTED' },
    { response: { status: 503 } },
  ]) {
    const normalized = toApiError(error);
    assert.ok(normalized instanceof ApiUnavailableError);
    assert.equal(isApiUnavailableError(normalized), true);
    assert.match(apiErrorMessage(normalized), /unreachable/i);
  }
});

test('backend validation responses retain their stable code and message', () => {
  const normalized = toApiError({
    response: { status: 400, data: { code: 'MEMO_MISMATCH', error: 'Memo mismatch' } },
  });
  assert.ok(normalized instanceof ApiRequestError);
  assert.equal(normalized.code, 'MEMO_MISMATCH');
  assert.equal(normalized.message, 'Memo mismatch');
});

test('toApiError carries the remediation metadata from the failure envelope', () => {
  const steps = ['Copy the exact memo shown on the invoice into your wallet before sending.'];
  const normalized = toApiError({
    response: {
      status: 400,
      data: {
        code: 'MEMO_MISMATCH',
        error: 'Memo mismatch',
        category: 'SETTLEMENT',
        retryable: false,
        recoveryAction: 'Include the exact invoice memo in your transaction memo field before sending.',
        remediation: steps,
      },
    },
  });

  assert.equal(normalized.category, 'SETTLEMENT');
  assert.equal(normalized.recoveryAction, 'Include the exact invoice memo in your transaction memo field before sending.');
  assert.deepEqual(normalized.remediation, steps);
  assert.equal(normalized.retryable, false, "the server's retryable flag wins over status heuristics");
});

test('retryable falls back to status heuristics when the envelope omits the flag', () => {
  assert.equal(
    toApiError({ response: { status: 408, data: { code: 'TRANSACTION_NOT_FOUND' } } }).retryable,
    true
  );
  assert.equal(
    toApiError({ response: { status: 429, data: { code: 'RATE_LIMITED' } } }).retryable,
    true
  );
  assert.equal(
    toApiError({ response: { status: 400, data: { code: 'VALIDATION_FAILED' } } }).retryable,
    false
  );
});

test('ApiRequestError leaves remediation undefined when the envelope predates 1.1.0', () => {
  const normalized = toApiError({
    response: { status: 400, data: { code: 'VALIDATION_FAILED', error: 'Invalid input' } },
  });
  assert.equal(normalized.remediation, undefined);
  assert.equal(normalized.recoveryAction, undefined);
});
