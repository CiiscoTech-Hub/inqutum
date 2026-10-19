/**
 * Client mirror of the canonical verification contract (issue #224), Error Taxonomy (issue #48)
 * and stable-code remediation hints (issue #303).
 *
 * The authority is `backend/src/services/payment-verification.ts` and `backend/src/errors/error-taxonomy.ts`;
 * this file exists so the pay flow can reject malformed input before a round trip and
 * surface the exact code/message/recovery/remediation guidance the server would return.
 */

const VERIFICATION_CONTRACT_VERSION = '1.0.0';

const VERIFICATION_MESSAGES = {
  MISSING_TX_HASH: 'Transaction hash is required',
  INVALID_TX_HASH: 'Transaction hash must be 64 hexadecimal characters',
  INVALID_PAYER_NAME: 'Payer name must be text',
  INVALID_PAYER_EMAIL: 'Payer email is invalid',
  PAYER_INFO_TOO_LONG: 'Payer information is too long',
  INVOICE_ALREADY_PAID: 'Invoice has already been paid',
  INVOICE_EXPIRED: 'Invoice has expired and can no longer accept payment',
  INVOICE_NOT_PENDING: 'Invoice is not pending',
  TRANSACTION_NOT_FOUND: 'Transaction not found on Stellar',
  NO_PAYMENT_OPERATION: 'No payment operation found in transaction',
  MEMO_MISMATCH: 'Memo mismatch',
  DESTINATION_MISMATCH: 'Payment destination mismatch',
  AMOUNT_MISMATCH: 'Amount mismatch',
  ASSET_MISMATCH: 'Asset mismatch',
  NETWORK_MISMATCH: 'Transaction is on a different Stellar network',
};

const RECOVERY_ACTIONS = {
  MISSING_TX_HASH: 'Provide a 64-character transaction hash from your Stellar wallet after submitting payment.',
  INVALID_TX_HASH: 'Verify that the transaction hash contains exactly 64 hexadecimal characters.',
  INVALID_PAYER_NAME: 'Enter a valid text string for the payer name or leave it empty.',
  INVALID_PAYER_EMAIL: 'Enter a valid email address (e.g. name@domain.com) or leave it empty.',
  PAYER_INFO_TOO_LONG: 'Shorten payer name and email to under 255 characters.',
  INVOICE_ALREADY_PAID: 'This invoice is already settled. You can download or email your quittance proof.',
  INVOICE_EXPIRED: 'The payment window has elapsed. Contact the seller to issue a new invoice.',
  INVOICE_NOT_PENDING: 'Only pending invoices can accept payment. Check invoice status on dashboard.',
  TRANSACTION_NOT_FOUND: 'Stellar ledger close takes ~5 seconds. Please wait a moment and retry verification.',
  NO_PAYMENT_OPERATION: 'Ensure your transaction contains a direct payment operation to the seller address.',
  MEMO_MISMATCH: 'Include the exact invoice memo in your transaction memo field before sending.',
  DESTINATION_MISMATCH: 'Send funds directly to the seller public key specified in the invoice.',
  AMOUNT_MISMATCH: 'Send the exact invoice amount (matched at Stellar 7-decimal stroop precision).',
  ASSET_MISMATCH: 'Pay with the designated asset. For non-native tokens, verify both asset code and issuer.',
  NETWORK_MISMATCH: 'Switch your Freighter wallet to the matching Stellar network (Testnet or Public).',
};

const REMEDIATION = {
  MISSING_TX_HASH: [
    'Open your Stellar wallet and copy the 64-character hash of the payment transaction.',
    'Paste it into the transaction hash field and submit the form again.',
  ],
  INVALID_TX_HASH: [
    'Remove spaces, dashes, or any 0x prefix from the pasted value.',
    'Copy the hash again from your wallet’s transaction detail view; it must be exactly 64 hex characters.',
  ],
  INVALID_PAYER_NAME: [
    'Replace the payer name with plain text, or clear the field if it is optional.',
    'Resubmit the payment form.',
  ],
  INVALID_PAYER_EMAIL: [
    'Correct the address so it matches the format name@domain.com.',
    'Leave the field empty if no receipt is needed, then resubmit.',
  ],
  PAYER_INFO_TOO_LONG: [
    'Shorten the payer name and email so each is under 255 characters.',
    'Resubmit the form.',
  ],
  INVOICE_ALREADY_PAID: [
    'Download the quittance proof from the invoice page, or email it from the receipt action.',
    'Ask the seller for a new invoice if another payment is genuinely required.',
  ],
  INVOICE_EXPIRED: [
    'Contact the seller and ask for a new invoice with a fresh expiry.',
    'Do not send payment against the expired memo; the seller will reject it.',
  ],
  INVOICE_NOT_PENDING: [
    'Refresh the invoice page to see its current status.',
    'Ask the seller for a new invoice if this one is no longer PENDING.',
  ],
  TRANSACTION_NOT_FOUND: [
    'Wait about 10 seconds for the ledger to close, then retry verification.',
    'If it still fails, confirm the hash in a Stellar explorer for the invoice network before retrying.',
  ],
  NO_PAYMENT_OPERATION: [
    'Open the transaction in a Stellar explorer and confirm it contains a payment operation to the seller.',
    'Resubmit with the hash of the payment that was actually sent.',
  ],
  MEMO_MISMATCH: [
    'Copy the exact memo shown on the invoice into your wallet before sending.',
    'If payment already went out, contact the seller — the hash alone does not match this invoice.',
  ],
  DESTINATION_MISMATCH: [
    'Compare the payment destination with the seller public key on the invoice.',
    'Send funds to the seller public key from the invoice, then resubmit the new transaction hash.',
  ],
  AMOUNT_MISMATCH: [
    'Recalculate the amount due, including every decimal place shown on the invoice.',
    'Resend the exact amount (matching at 7-decimal stroop precision) and verify the new hash.',
  ],
  ASSET_MISMATCH: [
    'Check the asset code and issuer on the invoice.',
    'Select the matching asset in your wallet (both code and issuer must match) and repay.',
  ],
  NETWORK_MISMATCH: [
    'Open Freighter settings and select the network named on the invoice (Testnet or Public).',
    'Resubmit the same transaction hash.',
  ],
};

const MAX_PAYER_FIELD_LENGTH = 255;
const PAYER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TX_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const normalizeTransactionHash = (value) =>
  typeof value === 'string' ? value.trim() : '';

const failure = (code) => ({
  ok: false,
  code,
  error: VERIFICATION_MESSAGES[code],
  recoveryAction: RECOVERY_ACTIONS[code],
  remediation: REMEDIATION[code],
});

/** A Stellar transaction hash is 64 hexadecimal characters. */
const isValidTxHash = (txHash) =>
  TX_HASH_PATTERN.test(normalizeTransactionHash(txHash));

/** Same order of checks as the backend, so both sides report the same first failure. */
const checkTxHash = (txHash) => {
  if (typeof txHash !== 'string' || txHash.trim().length === 0) {
    return failure('MISSING_TX_HASH');
  }

  const normalized = normalizeTransactionHash(txHash);
  if (!isValidTxHash(normalized)) {
    return failure('INVALID_TX_HASH');
  }

  return { ok: true, value: normalized };
};

const checkPayerInfo = (input) => {
  const { payerName, payerEmail } = input || {};

  if (payerName !== undefined && typeof payerName !== 'string') {
    return failure('INVALID_PAYER_NAME');
  }
  if (payerEmail !== undefined && typeof payerEmail !== 'string') {
    return failure('INVALID_PAYER_EMAIL');
  }

  const normalizedPayerName = (payerName && payerName.trim()) || undefined;
  const normalizedPayerEmail = (payerEmail && payerEmail.trim()) || undefined;

  if (normalizedPayerEmail && !PAYER_EMAIL_PATTERN.test(normalizedPayerEmail)) {
    return failure('INVALID_PAYER_EMAIL');
  }
  if (
    (normalizedPayerName ? normalizedPayerName.length : 0) > MAX_PAYER_FIELD_LENGTH ||
    (normalizedPayerEmail ? normalizedPayerEmail.length : 0) > MAX_PAYER_FIELD_LENGTH
  ) {
    return failure('PAYER_INFO_TOO_LONG');
  }

  return {
    ok: true,
    value: { payerName: normalizedPayerName, payerEmail: normalizedPayerEmail },
  };
};

/**
 * Turn a failed verify request into the shared message.
 *
 * Prefers the code the server sent so the wording stays identical even when the
 * two sides drift; falls back to the server text, then a generic message.
 */
const resolveVerificationError = (error, fallback = 'Verification failed') => {
  const data = (error && error.response && error.response.data) || {};

  if (data.code && VERIFICATION_MESSAGES[data.code]) {
    return VERIFICATION_MESSAGES[data.code];
  }

  return data.error || (error && error.message) || fallback;
};

/**
 * Resolve full user-safe error details including recovery guidance and correlation ID.
 */
const resolveUserSafeError = (error, fallback = 'An unexpected error occurred') => {
  const data = (error && error.response && error.response.data) || {};
  const code = data.code || (error && error.code);
  const message = (code && VERIFICATION_MESSAGES[code]) || data.error || (error && error.message) || fallback;
  const recoveryAction = (code && RECOVERY_ACTIONS[code]) || data.recoveryAction || 'Please check your input and retry.';
  const retryable = data.retryable !== undefined ? data.retryable : (code === 'TRANSACTION_NOT_FOUND' || data.category === 'NETWORK');
  const correlationId = data.correlationId || (error && error.correlationId);
  const remediation = Array.isArray(data.remediation) && data.remediation.length > 0
    ? data.remediation
    : (code && REMEDIATION[code]) || [];

  return {
    code,
    message,
    category: data.category || 'SETTLEMENT',
    retryable,
    recoveryAction,
    remediation,
    correlationId,
  };
};

module.exports = {
  VERIFICATION_CONTRACT_VERSION,
  VERIFICATION_MESSAGES,
  RECOVERY_ACTIONS,
  REMEDIATION,
  failure,
  isValidTxHash,
  normalizeTransactionHash,
  checkTxHash,
  checkPayerInfo,
  resolveVerificationError,
  resolveUserSafeError,
};
