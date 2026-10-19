/**
 * Structured Domain Error Taxonomy for Quittance.
 *
 * Defines standardized error categories, domain error codes, HTTP status mappings,
 * retryability metadata, user-safe error messages, and actionable recovery guidance.
 */

import { VerificationCode, VERIFICATION_MESSAGES } from '../services/payment-verification';
import { redactErrorMessage, sanitizeObject } from '../security/redaction';

export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'SETTLEMENT'
  | 'LIFECYCLE'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'INTERNAL';

export interface DomainErrorDefinition {
  code: string;
  category: ErrorCategory;
  httpStatus: number;
  retryable: boolean;
  userSafeMessage: string;
  recoveryAction: string;
  /**
   * Ordered, actionable remediation steps for this code (issue #303).
   * More granular than `recoveryAction`: each entry is one concrete action a
   * user or operator can perform, so clients can render a checklist instead of
   * a single sentence. Published in the failure envelope as `remediation`.
   */
  remediation: string[];
}

/**
 * Canonical taxonomy mapping for all verification codes and domain errors.
 */
export const DOMAIN_ERROR_TAXONOMY: Record<string, DomainErrorDefinition> = {
  // --- Settlement / Verification Codes ---
  MISSING_TX_HASH: {
    code: 'MISSING_TX_HASH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.MISSING_TX_HASH,
    recoveryAction: 'Provide a 64-character transaction hash from your Stellar wallet after submitting payment.',
    remediation: [
      'Open your Stellar wallet and copy the 64-character hash of the payment transaction.',
      'Paste it into the transaction hash field and submit the form again.',
    ],
  },
  INVALID_TX_HASH: {
    code: 'INVALID_TX_HASH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVALID_TX_HASH,
    recoveryAction: 'Verify that the transaction hash contains exactly 64 hexadecimal characters.',
    remediation: [
      'Remove spaces, dashes, or any 0x prefix from the pasted value.',
      'Copy the hash again from your wallet’s transaction detail view; it must be exactly 64 hex characters.',
    ],
  },
  INVALID_PAYER_NAME: {
    code: 'INVALID_PAYER_NAME',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVALID_PAYER_NAME,
    recoveryAction: 'Enter a valid text string for the payer name or leave it empty.',
    remediation: [
      'Replace the payer name with plain text, or clear the field if it is optional.',
      'Resubmit the payment form.',
    ],
  },
  INVALID_PAYER_EMAIL: {
    code: 'INVALID_PAYER_EMAIL',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVALID_PAYER_EMAIL,
    recoveryAction: 'Enter a valid email address (e.g. name@domain.com) or leave it empty.',
    remediation: [
      'Correct the address so it matches the format name@domain.com.',
      'Leave the field empty if no receipt is needed, then resubmit.',
    ],
  },
  PAYER_INFO_TOO_LONG: {
    code: 'PAYER_INFO_TOO_LONG',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.PAYER_INFO_TOO_LONG,
    recoveryAction: 'Shorten payer name and email to under 255 characters.',
    remediation: [
      'Shorten the payer name and email so each is under 255 characters.',
      'Resubmit the form.',
    ],
  },
  INVOICE_ALREADY_PAID: {
    code: 'INVOICE_ALREADY_PAID',
    category: 'LIFECYCLE',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVOICE_ALREADY_PAID,
    recoveryAction: 'This invoice is already settled. You can download or email your quittance proof.',
    remediation: [
      'Download the quittance proof from the invoice page, or email it from the receipt action.',
      'Ask the seller for a new invoice if another payment is genuinely required.',
    ],
  },
  INVOICE_EXPIRED: {
    code: 'INVOICE_EXPIRED',
    category: 'LIFECYCLE',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVOICE_EXPIRED,
    recoveryAction: 'The payment window has elapsed. Contact the seller to issue a new invoice.',
    remediation: [
      'Contact the seller and ask for a new invoice with a fresh expiry.',
      'Do not send payment against the expired memo; the seller will reject it.',
    ],
  },
  INVOICE_NOT_PENDING: {
    code: 'INVOICE_NOT_PENDING',
    category: 'LIFECYCLE',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.INVOICE_NOT_PENDING,
    recoveryAction: 'Only pending invoices can accept payment. Check invoice status on dashboard.',
    remediation: [
      'Refresh the invoice page to see its current status.',
      'Ask the seller for a new invoice if this one is no longer PENDING.',
    ],
  },
  TRANSACTION_NOT_FOUND: {
    code: 'TRANSACTION_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: true,
    userSafeMessage: VERIFICATION_MESSAGES.TRANSACTION_NOT_FOUND,
    recoveryAction: 'Stellar ledger close takes ~5 seconds. Please wait a moment and retry verification.',
    remediation: [
      'Wait about 10 seconds for the ledger to close, then retry verification.',
      'If it still fails, confirm the hash in a Stellar explorer for the invoice network before retrying.',
    ],
  },
  NO_PAYMENT_OPERATION: {
    code: 'NO_PAYMENT_OPERATION',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.NO_PAYMENT_OPERATION,
    recoveryAction: 'Ensure your transaction contains a direct payment operation to the seller address.',
    remediation: [
      'Open the transaction in a Stellar explorer and confirm it contains a payment operation to the seller.',
      'Resubmit with the hash of the payment that was actually sent.',
    ],
  },
  MEMO_MISMATCH: {
    code: 'MEMO_MISMATCH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.MEMO_MISMATCH,
    recoveryAction: 'Include the exact invoice memo in your transaction memo field before sending.',
    remediation: [
      'Copy the exact memo shown on the invoice into your wallet before sending.',
      'If payment already went out, contact the seller — the hash alone does not match this invoice.',
    ],
  },
  DESTINATION_MISMATCH: {
    code: 'DESTINATION_MISMATCH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.DESTINATION_MISMATCH,
    recoveryAction: 'Send funds directly to the seller public key specified in the invoice.',
    remediation: [
      'Compare the payment destination with the seller public key on the invoice.',
      'Send funds to the seller public key from the invoice, then resubmit the new transaction hash.',
    ],
  },
  AMOUNT_MISMATCH: {
    code: 'AMOUNT_MISMATCH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.AMOUNT_MISMATCH,
    recoveryAction: 'Send the exact invoice amount (matched at Stellar 7-decimal stroop precision).',
    remediation: [
      'Recalculate the amount due, including every decimal place shown on the invoice.',
      'Resend the exact amount (matching at 7-decimal stroop precision) and verify the new hash.',
    ],
  },
  ASSET_MISMATCH: {
    code: 'ASSET_MISMATCH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.ASSET_MISMATCH,
    recoveryAction: 'Pay with the designated asset. For non-native tokens, verify both asset code and issuer.',
    remediation: [
      'Check the asset code and issuer on the invoice.',
      'Select the matching asset in your wallet (both code and issuer must match) and repay.',
    ],
  },
  NETWORK_MISMATCH: {
    code: 'NETWORK_MISMATCH',
    category: 'SETTLEMENT',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: VERIFICATION_MESSAGES.NETWORK_MISMATCH,
    recoveryAction: 'Switch your Freighter wallet to the matching Stellar network (Testnet or Public).',
    remediation: [
      'Open Freighter settings and select the network named on the invoice (Testnet or Public).',
      'Resubmit the same transaction hash.',
    ],
  },

  // --- General Domain Errors ---
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Invalid input provided',
    recoveryAction: 'Review the input parameters, ensuring valid numbers, addresses, and formats.',
    remediation: [
      'Read the field named in the error message and correct its value.',
      'Resubmit the request; if the message stays unclear, report the correlationId.',
    ],
  },
  SELLER_REQUIRED: {
    code: 'SELLER_REQUIRED',
    category: 'AUTHORIZATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'sellerPublicKey query parameter is required',
    recoveryAction: 'Connect your Freighter wallet to supply the seller public key.',
    remediation: [
      'Add ?sellerPublicKey=<G...> to the request, or connect Freighter so the UI supplies it.',
      'Retry once the seller public key is present.',
    ],
  },
  INVALID_STATUS: {
    code: 'INVALID_STATUS',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'status filter is not a known invoice status',
    recoveryAction: 'Filter by PENDING, PAID, EXPIRED or CANCELLED, or omit status to list every invoice.',
    remediation: [
      'Use one of PENDING, PAID, EXPIRED, CANCELLED as the status value.',
      'Omit the status parameter entirely to list every invoice.',
    ],
  },
  INVALID_CURSOR: {
    code: 'INVALID_CURSOR',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'cursor is not valid; restart from the first page',
    recoveryAction: 'Drop the cursor and request the first page again.',
    remediation: [
      'Remove the cursor parameter and request the first page.',
      'Use the nextCursor value from the previous response instead of hand-editing it.',
    ],
  },
  UNAUTHORIZED_SELLER: {
    code: 'UNAUTHORIZED_SELLER',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'You are not authorized to modify this invoice',
    recoveryAction: 'Connect the Freighter wallet that created this invoice.',
    remediation: [
      'Switch Freighter to the wallet that created the invoice.',
      'Retry the action after the wallet is connected.',
    ],
  },
  INVOICE_NOT_FOUND: {
    code: 'INVOICE_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Invoice not found',
    recoveryAction: 'Check the invoice ID in the URL and ensure it has not been deleted.',
    remediation: [
      'Check the invoice id in the URL for typos.',
      'List your invoices from the dashboard to confirm it still exists.',
    ],
  },
  INVOICE_CANNOT_CANCEL: {
    code: 'INVOICE_CANNOT_CANCEL',
    category: 'LIFECYCLE',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Only pending invoices can be cancelled',
    recoveryAction: 'Invoices that are already paid or expired cannot be cancelled.',
    remediation: [
      'Refresh the invoice to confirm its current status.',
      'Take no further action if it is PAID or EXPIRED; only PENDING invoices can be cancelled.',
    ],
  },
  CORS_ORIGIN_DENIED: {
    code: 'CORS_ORIGIN_DENIED',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'Origin is not allowed by Quittance CORS policy',
    recoveryAction: 'Configure the frontend origin in FRONTEND_URL environment variables.',
    remediation: [
      'Add the frontend origin to the FRONTEND_URL environment variable.',
      'Restart the backend and retry the request from the allowed origin.',
    ],
  },
  HORIZON_UNAVAILABLE: {
    code: 'HORIZON_UNAVAILABLE',
    category: 'NETWORK',
    httpStatus: 503,
    retryable: true,
    userSafeMessage: 'Stellar Horizon is temporarily unreachable',
    recoveryAction: 'Stellar network is experiencing a transient delay. Please retry in a few seconds.',
    remediation: [
      'Retry the request after a few seconds; Horizon outages are transient.',
      'Check the Stellar status page before retrying again if the outage lasts.',
    ],
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    category: 'RATE_LIMIT',
    httpStatus: 429,
    retryable: true,
    userSafeMessage: 'Too many requests. Please slow down.',
    recoveryAction: 'Wait a few seconds before retrying the operation.',
    remediation: [
      'Wait for any Retry-After window before sending the next request.',
      'Add exponential backoff to your client and reduce request frequency.',
    ],
  },
  CONFLICT: {
    code: 'CONFLICT',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: true,
    userSafeMessage: 'Invoice was modified by another session. Please refresh and try again.',
    recoveryAction: 'Refresh the invoice to get the latest version, then retry the operation.',
    remediation: [
      'Reload the invoice so you are working against its latest version.',
      'Re-apply your change and resubmit.',
    ],
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    category: 'INTERNAL',
    httpStatus: 500,
    retryable: true,
    userSafeMessage: 'An internal server error occurred',
    recoveryAction: 'Please retry your request. If the problem persists, contact support with the correlation ID.',
    remediation: [
      'Retry the request once; transient failures often clear up.',
      'If the failure repeats, report the correlationId to support so the logs can be traced.',
    ],
  },

  // --- Global & transport-level errors ---
  NOT_FOUND: {
    code: 'NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Endpoint not found',
    recoveryAction: 'Check the HTTP method and path against docs/API_CONTRACTS.md.',
    remediation: [
      'Compare the method and path with the route table in docs/API_CONTRACTS.md.',
      'Remove trailing segments or version prefixes the client may have added.',
    ],
  },
  INVALID_FILTER: {
    code: 'INVALID_FILTER',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Filter value is not valid for this endpoint',
    recoveryAction: 'Fix the filter value or omit it to list every item.',
    remediation: [
      'Remove the rejected filter parameter and retry.',
      'Compare the filter with the values documented for this endpoint.',
    ],
  },

  // --- Authorization / admin surface ---
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    category: 'AUTHORIZATION',
    httpStatus: 401,
    retryable: false,
    userSafeMessage: 'Invalid or missing admin token',
    recoveryAction: 'Send Authorization: Bearer <JOBS_ADMIN_TOKEN> from the server environment.',
    remediation: [
      'Copy the current JOBS_ADMIN_TOKEN value from the deployment environment.',
      'Send it as an Authorization: Bearer header and retry.',
    ],
  },
  JOBS_ADMIN_DISABLED: {
    code: 'JOBS_ADMIN_DISABLED',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'Job inspection is not enabled',
    recoveryAction: 'Set JOBS_ADMIN_TOKEN in the environment to enable job inspection.',
    remediation: [
      'Set JOBS_ADMIN_TOKEN and restart the server to enable the job surface.',
      'Until then, read job state from the application logs.',
    ],
  },
  APPROVALS_DISABLED: {
    code: 'APPROVALS_DISABLED',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'High-impact actions require maintainer approval',
    recoveryAction: 'Set MAINTAINER_INTENT_SECRET to enable high-impact actions.',
    remediation: [
      'Set MAINTAINER_INTENT_SECRET (32+ characters) and restart the server.',
      'Retry the action; it will now require the maintainer intent flow.',
    ],
  },
  CAPABILITIES_DISABLED: {
    code: 'CAPABILITIES_DISABLED',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'Capability tokens are not enabled',
    recoveryAction: 'Set CAPABILITY_TOKEN_SECRET (32+ characters) to enable sensitive admin actions.',
    remediation: [
      'Set CAPABILITY_TOKEN_SECRET to a random value of at least 32 characters.',
      'Restart the server, then request a capability token before retrying.',
    ],
  },
  SESSION_NOT_FOUND: {
    code: 'SESSION_NOT_FOUND',
    category: 'AUTHORIZATION',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'No active session with that id for this maintainer',
    recoveryAction: 'Start a new impersonation session; sessions do not survive restarts.',
    remediation: [
      'Request a new impersonation session and use the id it returns.',
      'Check that the session id was copied without truncation.',
    ],
  },
  IMPERSONATION_REJECTED: {
    code: 'IMPERSONATION_REJECTED',
    category: 'AUTHORIZATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Impersonation session rejected',
    recoveryAction: 'Correct the rejected field (reason or target) and start the session again.',
    remediation: [
      'Read the message to learn which field was rejected and correct it.',
      'Start a new session with the corrected request.',
    ],
  },

  // --- Ops: replay, projector, repair, receipts ---
  REPLAY_REFUSED: {
    code: 'REPLAY_REFUSED',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Replay was refused',
    recoveryAction: 'Read the reasons in the response, repair the listed blockers, then replay again.',
    remediation: [
      'Inspect the reasons array returned with the failure.',
      'Repair each listed blocker (for example stale checkpoints) and request the replay again.',
    ],
  },
  REPLAY_IN_PROGRESS: {
    code: 'REPLAY_IN_PROGRESS',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: true,
    userSafeMessage: 'A replay is already running',
    recoveryAction: 'Wait for the running replay to finish, then retry.',
    remediation: [
      'Poll the replay status until the current run settles.',
      'Retry the request once it is no longer running.',
    ],
  },
  NOTHING_TO_ROLL_BACK: {
    code: 'NOTHING_TO_ROLL_BACK',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'There is no applied change to roll back',
    recoveryAction: 'Nothing was applied, so no rollback is needed; verify the current version first.',
    remediation: [
      'Read the current configuration version to confirm no change landed.',
      'Stop the rollback flow — there is no earlier state to restore.',
    ],
  },
  INVALID_PROJECTOR_VERSION: {
    code: 'INVALID_PROJECTOR_VERSION',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'projectorVersion must be a known integer',
    recoveryAction: 'Pass an integer projectorVersion from the supported list.',
    remediation: [
      'Request the supported projector versions from the ops surface.',
      'Resend the request with a supported integer version.',
    ],
  },
  DRY_RUN_UNAVAILABLE: {
    code: 'DRY_RUN_UNAVAILABLE',
    category: 'INTERNAL',
    httpStatus: 503,
    retryable: false,
    userSafeMessage: 'Storage cannot enumerate invoices, so impact cannot be evaluated',
    recoveryAction: 'Deploy storage that supports enumeration, or proceed without the impact preview.',
    remediation: [
      'Run the action without the dry-run impact block, or',
      'Restore the storage adapter capability and retry the dry run.',
    ],
  },
  RECEIPT_NOT_FOUND: {
    code: 'RECEIPT_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Receipt not found',
    recoveryAction: 'Receipts exist only after a recorded maintainer action; check the receipt id.',
    remediation: [
      'Verify the receipt id against the audit log.',
      'List recent audit events to find the correct receipt id.',
    ],
  },
  REPAIR_JOB_NOT_FOUND: {
    code: 'REPAIR_JOB_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Repair job not found',
    recoveryAction: 'List repair jobs for current ids; finished jobs are pruned.',
    remediation: [
      'Call GET /api/ops/repair-records/jobs for live ids.',
      'Start a new repair job if the old one was pruned.',
    ],
  },
  REFERENCE_NOT_FOUND: {
    code: 'REFERENCE_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'External reference verification record not found',
    recoveryAction: 'Re-run the external reference verification to create a record.',
    remediation: [
      'Submit the verification request again so a record is stored.',
      'Check the reference id for typos.',
    ],
  },
  TARGET_INVALID: {
    code: 'TARGET_INVALID',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'targetId must be a valid Stellar public key',
    recoveryAction: 'Supply a 56-character G... public key as targetId.',
    remediation: [
      'Copy the target public key from the invoice or account view.',
      'Resend the request with the corrected targetId.',
    ],
  },

  // --- Partial-failure job retry outcomes ---
  USER_ACTION_REQUIRED: {
    code: 'USER_ACTION_REQUIRED',
    category: 'LIFECYCLE',
    httpStatus: 422,
    retryable: false,
    userSafeMessage: 'Job requires user action before it can be retried',
    recoveryAction: 'Complete the user action named in the message, then retry.',
    remediation: [
      'Read the message for the required action (for example re-authenticate or provide input).',
      'Complete the action and retry the operation.',
    ],
  },
  RETRY_IN_PROGRESS: {
    code: 'RETRY_IN_PROGRESS',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: true,
    userSafeMessage: 'A retry for this job is already running',
    recoveryAction: 'Wait for the running retry to finish before requesting another.',
    remediation: [
      'Poll the job record until its state settles.',
      'Retry the request afterward; duplicate retries are refused.',
    ],
  },
  NOT_RETRYABLE_STATE: {
    code: 'NOT_RETRYABLE_STATE',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Job is not in a state that accepts manual retries',
    recoveryAction: 'Let the scheduler handle it, or dead-letter the job first.',
    remediation: [
      'Check the job status shown in the message.',
      'Wait for automatic retry, or move the job to the dead-letter state for a manual retry.',
    ],
  },
  NOT_FAILED: {
    code: 'NOT_FAILED',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Job has not failed',
    recoveryAction: 'Only failed or dead-lettered jobs can be retried.',
    remediation: [
      'Refresh the job state to confirm it failed.',
      'Target a job that is failed or dead-lettered.',
    ],
  },
  JOB_NOT_FOUND: {
    code: 'JOB_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Job not found',
    recoveryAction: 'List jobs to get a current id; ids rotate when the queue is pruned.',
    remediation: [
      'Call GET /api/jobs for live ids.',
      'Check the id for truncation before retrying.',
    ],
  },
  JOB_NOT_DEAD: {
    code: 'JOB_NOT_DEAD',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Only dead-lettered jobs can be retried',
    recoveryAction: 'Wait for the retry budget to exhaust, or dead-letter the job first.',
    remediation: [
      'Check the job status; it is not dead yet.',
      'Wait for automatic retries to exhaust, then retry this action.',
    ],
  },
  JOBS_UNAVAILABLE: {
    code: 'JOBS_UNAVAILABLE',
    category: 'INTERNAL',
    httpStatus: 503,
    retryable: false,
    userSafeMessage: 'Job store not configured',
    recoveryAction: 'Configure the job store (or use the server variant that includes it) before this endpoint.',
    remediation: [
      'Provision the job store this deployment expects, or call the server variant that includes it.',
      'Retry after the server reports the job store as available.',
    ],
  },

  // --- Invoice idempotency & payment-proof paths ---
  INVOICE_NOT_PAID: {
    code: 'INVOICE_NOT_PAID',
    category: 'LIFECYCLE',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Payment proof is only available for paid invoices',
    recoveryAction: 'Complete the payment first, then request the proof.',
    remediation: [
      'Open the payment page and submit payment for this invoice.',
      'Request the proof again once the invoice status is PAID.',
    ],
  },
  IDEMPOTENCY_KEY_REUSED: {
    code: 'IDEMPOTENCY_KEY_REUSED',
    category: 'VALIDATION',
    httpStatus: 422,
    retryable: false,
    userSafeMessage: 'Idempotency key was already used for a different request',
    recoveryAction: 'Use a fresh Idempotency-Key for a new request, or resend the original request to get its result.',
    remediation: [
      'Generate a new random key for this new operation.',
      'To read the previous outcome, resend the original request with its original key.',
    ],
  },
  INVALID_IDEMPOTENCY_KEY: {
    code: 'INVALID_IDEMPOTENCY_KEY',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Idempotency-Key must be 1-200 characters',
    recoveryAction: 'Send a key between 1 and 200 characters, or omit the header.',
    remediation: [
      'Trim or regenerate the key so it is 1-200 characters.',
      'Omit the header entirely if retry deduplication is not needed.',
    ],
  },
  RECIPIENT_EMAIL_REQUIRED: {
    code: 'RECIPIENT_EMAIL_REQUIRED',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Recipient email address is required',
    recoveryAction: 'Set customerEmail on the invoice or pass recipientEmail in the request.',
    remediation: [
      'Add recipientEmail to the request body, or',
      'Set the customer email on the invoice, then retry.',
    ],
  },

  // --- Notifications ---
  NOTIFICATION_NOT_FOUND: {
    code: 'NOTIFICATION_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Notification not found',
    recoveryAction: 'Reload the notification list; this id may have been pruned.',
    remediation: [
      'Refresh the notification list for current ids.',
      'Mark-read only ids returned by the list endpoint.',
    ],
  },
  RECIPIENT_REQUIRED: {
    code: 'RECIPIENT_REQUIRED',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'recipient must be a valid Stellar public key',
    recoveryAction: 'Pass a 56-character G... public key as the recipient parameter.',
    remediation: [
      'Copy the recipient public key from the account view.',
      'Resend the request with a valid recipient query/body parameter.',
    ],
  },

  // --- Email delivery (docs/EMAIL_DELIVERY.md) ---
  EMAIL_AUTH_FAILED: {
    code: 'EMAIL_AUTH_FAILED',
    category: 'AUTHORIZATION',
    httpStatus: 502,
    retryable: false,
    userSafeMessage: 'Email provider rejected our credentials',
    recoveryAction: 'The email provider rejected our credentials. A maintainer must fix the provider API key or SMTP username.',
    remediation: [
      'Rotate the provider API key or SMTP password in the deployment secrets.',
      'Restart the server and send a test email to confirm the fix.',
    ],
  },
  EMAIL_QUOTA_EXCEEDED: {
    code: 'EMAIL_QUOTA_EXCEEDED',
    category: 'RATE_LIMIT',
    httpStatus: 429,
    retryable: true,
    userSafeMessage: 'Email provider rate limited or out of quota',
    recoveryAction: 'The email provider is rate limiting or out of quota. Try again later or upgrade the sending plan.',
    remediation: [
      'Wait for the provider window to reset (honour Retry-After when present).',
      'Retry the send, or raise the provider plan if this recurs.',
    ],
  },
  EMAIL_TRANSIENT_FAILURE: {
    code: 'EMAIL_TRANSIENT_FAILURE',
    category: 'NETWORK',
    httpStatus: 503,
    retryable: true,
    userSafeMessage: 'Email provider is temporarily unreachable',
    recoveryAction: 'The email provider is temporarily unreachable. Try again in a few minutes.',
    remediation: [
      'Wait a few minutes for the provider to recover.',
      'Retry with the same idempotency key so the message cannot duplicate.',
    ],
  },
  EMAIL_INVALID_RECIPIENT: {
    code: 'EMAIL_INVALID_RECIPIENT',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Recipient address is not a valid email address',
    recoveryAction: 'Check the recipient address and try again.',
    remediation: [
      'Correct the address so it is a plain name@domain.com value.',
      'Resend the message.',
    ],
  },
  EMAIL_NOT_CONFIGURED: {
    code: 'EMAIL_NOT_CONFIGURED',
    category: 'INTERNAL',
    httpStatus: 503,
    retryable: false,
    userSafeMessage: 'Email delivery is not configured for this deployment',
    recoveryAction: 'Email delivery is not configured for this deployment. See docs/EMAIL_DELIVERY.md.',
    remediation: [
      'Configure the provider credentials described in docs/EMAIL_DELIVERY.md.',
      'Restart the server, then retry the send.',
    ],
  },
  EMAIL_SEND_IN_PROGRESS: {
    code: 'EMAIL_SEND_IN_PROGRESS',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: true,
    userSafeMessage: 'A send with this idempotency key is still running',
    recoveryAction: 'A send with this idempotency key is still running. Retry in a moment to get its result.',
    remediation: [
      'Wait a moment for the in-flight send to settle.',
      'Retry with the same idempotency key to read its result.',
    ],
  },
  EMAIL_OUTCOME_IN_DOUBT: {
    code: 'EMAIL_OUTCOME_IN_DOUBT',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Previous send stopped before its outcome was recorded',
    recoveryAction: 'A previous send stopped before its outcome was recorded. Check the provider log, then resolve the checkpoint (docs/RECOVERY_CHECKPOINTS.md).',
    remediation: [
      'Search the provider logs for the message id to learn whether it was delivered.',
      'Resolve the checkpoint per docs/RECOVERY_CHECKPOINTS.md, then resend only if it was not delivered.',
    ],
  },
  EMAIL_IDEMPOTENCY_KEY_REUSED: {
    code: 'EMAIL_IDEMPOTENCY_KEY_REUSED',
    category: 'VALIDATION',
    httpStatus: 422,
    retryable: false,
    userSafeMessage: 'Idempotency key was already used for a different email',
    recoveryAction: 'This idempotency key was already used for a different email. Use a new key for a new message.',
    remediation: [
      'Generate a new key for the new message.',
      'Resend the original request instead if you wanted the original result.',
    ],
  },
  EMAIL_FAILED: {
    code: 'EMAIL_FAILED',
    category: 'NETWORK',
    httpStatus: 502,
    retryable: false,
    userSafeMessage: 'Email provider rejected this message',
    recoveryAction: 'The email provider rejected this message. Check the address and content, then try again.',
    remediation: [
      'Read the provider response for the rejection reason (address, content, attachments).',
      'Fix the message and send again with a new idempotency key.',
    ],
  },
  EMAIL_REQUEST_INVALID: {
    code: 'EMAIL_REQUEST_INVALID',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Email request payload is invalid',
    recoveryAction: 'Correct the invalid field described in the message and resend the email request.',
    remediation: [
      'Validate the payload against the /email/send schema in docs/API_CONTRACTS.md.',
      'Resend with the corrected fields.',
    ],
  },
  EMAIL_DELIVERY_NOT_FOUND: {
    code: 'EMAIL_DELIVERY_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'No delivery matches that message id',
    recoveryAction: 'Check the messageId; only provider-confirmed ids resolve.',
    remediation: [
      'Copy the messageId returned by the original send.',
      'List deliveries via GET /api/email/deliveries to find the id.',
    ],
  },
  EMAIL_WEBHOOK_INVALID: {
    code: 'EMAIL_WEBHOOK_INVALID',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Email provider webhook payload is invalid',
    recoveryAction: 'Send messageId, event (bounce|complaint|delivered), and an optional reason.',
    remediation: [
      'Fix the payload so event is one of bounce, complaint, delivered.',
      'Resend the provider callback.',
    ],
  },

  // --- Exports (docs/EXPORTS.md) ---
  EXPORT_EXPIRED: {
    code: 'EXPORT_EXPIRED',
    category: 'LIFECYCLE',
    httpStatus: 410,
    retryable: false,
    userSafeMessage: 'This export has expired and was deleted',
    recoveryAction: 'Generate a new export; expired artifacts are pruned.',
    remediation: [
      'Request a new export with the same filters.',
      'Download exports promptly; artifacts are pruned after their TTL.',
    ],
  },
  EXPORT_FAILED: {
    code: 'EXPORT_FAILED',
    category: 'INTERNAL',
    httpStatus: 500,
    retryable: true,
    userSafeMessage: 'Failed to generate export',
    recoveryAction: 'Retry the export; if it fails again, narrow the filters.',
    remediation: [
      'Retry the same request once.',
      'Narrow the filter window if the retry fails, and report the correlationId.',
    ],
  },
  EXPORT_FORBIDDEN: {
    code: 'EXPORT_FORBIDDEN',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'Export requester is not allowed to read this range',
    recoveryAction: 'Request exports only for keys you control; pass a requester you own.',
    remediation: [
      'Sign the request with the requester public key that owns the data.',
      'Ask a maintainer to grant access to the requested range.',
    ],
  },
  EXPORT_NOT_FOUND: {
    code: 'EXPORT_NOT_FOUND',
    category: 'NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    userSafeMessage: 'Export not found',
    recoveryAction: 'Check the export id; expired exports are deleted.',
    remediation: [
      'List exports to find a live id.',
      'Create a new export if the old one expired.',
    ],
  },
  EXPORT_TIMED_OUT: {
    code: 'EXPORT_TIMED_OUT',
    category: 'NETWORK',
    httpStatus: 503,
    retryable: true,
    userSafeMessage: 'Export took too long and was cancelled',
    recoveryAction: 'Narrow the filters and try again.',
    remediation: [
      'Reduce the date range or row count of the export.',
      'Retry with the narrower filters.',
    ],
  },
  INVALID_EXPORT_REQUEST: {
    code: 'INVALID_EXPORT_REQUEST',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Export request payload is invalid',
    recoveryAction: 'Fix the request fields listed in the message.',
    remediation: [
      'Read the field errors joined in the message body.',
      'Resend a corrected export request.',
    ],
  },
  REQUESTER_REQUIRED: {
    code: 'REQUESTER_REQUIRED',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'requester must be a valid Stellar public key',
    recoveryAction: 'Add ?requester=<public key> so the export can be scoped to you.',
    remediation: [
      'Append the requester query parameter with your public key.',
      'Resend the request.',
    ],
  },

  // --- Inbound webhooks (docs/API_CONTRACTS.md, hmac mode) ---
  MALFORMED_WEBHOOK: {
    code: 'MALFORMED_WEBHOOK',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Required webhook headers are missing',
    recoveryAction: 'Send X-Webhook-Signature, X-Webhook-Timestamp and X-Webhook-Event-Id headers.',
    remediation: [
      'Add all three webhook headers to the request.',
      'Resend the event.',
    ],
  },
  STALE_TIMESTAMP: {
    code: 'STALE_TIMESTAMP',
    category: 'VALIDATION',
    httpStatus: 408,
    retryable: true,
    userSafeMessage: 'Webhook timestamp is outside the allowed window',
    recoveryAction: 'Sign the payload again with the current time and retry.',
    remediation: [
      'Regenerate X-Webhook-Timestamp with the current epoch seconds.',
      'Re-sign the body with the fresh timestamp and resend.',
    ],
  },
  INVALID_SIGNATURE: {
    code: 'INVALID_SIGNATURE',
    category: 'AUTHORIZATION',
    httpStatus: 401,
    retryable: false,
    userSafeMessage: 'Webhook signature verification failed',
    recoveryAction: 'Sign the raw body with the shared secret using the documented scheme.',
    remediation: [
      'Recompute the signature over the exact raw body with WEBHOOK_SIGNING_SECRET.',
      'Confirm the header format sha256=<hex>, then resend.',
    ],
  },
  DUPLICATE_EVENT: {
    code: 'DUPLICATE_EVENT',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Webhook event has already been processed',
    recoveryAction: 'This event id was already processed; use a new event id for a new event.',
    remediation: [
      'Treat the event as successfully handled.',
      'Generate a fresh X-Webhook-Event-Id only for genuinely new events.',
    ],
  },

  // --- Capability tokens (docs/CAPABILITY_TOKENS.md) ---
  CAPABILITY_REQUEST_INVALID: {
    code: 'CAPABILITY_REQUEST_INVALID',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Capability request payload is invalid',
    recoveryAction: 'Request the capability with a valid action, target, and TTL.',
    remediation: [
      'Fix the invalid field in the capability request.',
      'Request a new token and retry the action.',
    ],
  },
  UNKNOWN_CAPABILITY_ACTION: {
    code: 'UNKNOWN_CAPABILITY_ACTION',
    category: 'VALIDATION',
    httpStatus: 400,
    retryable: false,
    userSafeMessage: 'Capability action is not in the supported list',
    recoveryAction: 'Use an action name from the capability scope list in docs/CAPABILITY_TOKENS.md.',
    remediation: [
      'Check the supported action names in docs/CAPABILITY_TOKENS.md.',
      'Request a token scoped to the correct action.',
    ],
  },
  CAPABILITY_REQUIRED: {
    code: 'CAPABILITY_REQUIRED',
    category: 'AUTHORIZATION',
    httpStatus: 401,
    retryable: false,
    userSafeMessage: 'This action requires a capability token',
    recoveryAction: 'Add the X-Capability-Token header from POST /api/ops/capabilities.',
    remediation: [
      'Request a capability token for this action.',
      'Send it in the X-Capability-Token header and retry.',
    ],
  },
  CAPABILITY_INVALID: {
    code: 'CAPABILITY_INVALID',
    category: 'AUTHORIZATION',
    httpStatus: 401,
    retryable: false,
    userSafeMessage: 'Capability token is malformed or forged',
    recoveryAction: 'Request a fresh capability token.',
    remediation: [
      'Request a new token from POST /api/ops/capabilities.',
      'Retry the action with the new token.',
    ],
  },
  CAPABILITY_EXPIRED: {
    code: 'CAPABILITY_EXPIRED',
    category: 'AUTHORIZATION',
    httpStatus: 401,
    retryable: false,
    userSafeMessage: 'Capability token has expired',
    recoveryAction: 'Tokens are short-lived; request a new one immediately before use.',
    remediation: [
      'Request a new token right before performing the action.',
      'Retry with the fresh token.',
    ],
  },
  CAPABILITY_SCOPE_MISMATCH: {
    code: 'CAPABILITY_SCOPE_MISMATCH',
    category: 'AUTHORIZATION',
    httpStatus: 403,
    retryable: false,
    userSafeMessage: 'Capability token does not cover this action or target',
    recoveryAction: 'Request a token scoped to this action and target.',
    remediation: [
      'Check the action and target your current token was issued for.',
      'Request a token with the required scope, then retry.',
    ],
  },
  CAPABILITY_IN_USE: {
    code: 'CAPABILITY_IN_USE',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: true,
    userSafeMessage: 'Capability token is already being used by an in-flight action',
    recoveryAction: 'Wait for the in-flight action to finish; single-use tokens refuse concurrency.',
    remediation: [
      'Wait for the original request that holds this token to complete.',
      'Retry once it settles.',
    ],
  },
  CAPABILITY_ALREADY_USED: {
    code: 'CAPABILITY_ALREADY_USED',
    category: 'LIFECYCLE',
    httpStatus: 409,
    retryable: false,
    userSafeMessage: 'Capability token was already used',
    recoveryAction: 'Each token is single-use; request a new one for another action.',
    remediation: [
      'Request a new capability token.',
      'Retry with the new token.',
    ],
  },
  CAPABILITY_LEDGER_FULL: {
    code: 'CAPABILITY_LEDGER_FULL',
    category: 'INTERNAL',
    httpStatus: 503,
    retryable: true,
    userSafeMessage: 'Capability token ledger is at capacity',
    recoveryAction: 'The token ledger is at capacity; retry shortly.',
    remediation: [
      'Retry after a few seconds as in-flight tokens expire.',
      'If it persists, raise the ledger capacity so reserved tokens can be tracked.',
    ],
  },
};

/**
 * Typed Application Domain Error class.
 */
export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly recoveryAction: string;
  readonly remediation: string[];
  readonly details?: any;

  constructor(
    codeOrDef: string | DomainErrorDefinition,
    customMessage?: string,
    details?: any
  ) {
    const def =
      typeof codeOrDef === 'string'
        ? DOMAIN_ERROR_TAXONOMY[codeOrDef] || DOMAIN_ERROR_TAXONOMY.INTERNAL_ERROR
        : codeOrDef;

    super(customMessage || def.userSafeMessage);
    this.name = 'AppError';
    this.code = def.code;
    this.category = def.category;
    this.httpStatus = def.httpStatus;
    this.retryable = def.retryable;
    this.recoveryAction = def.recoveryAction;
    this.remediation = def.remediation;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Classify any error into a structured DomainErrorDefinition.
 */
export function classifyError(error: any): DomainErrorDefinition & { customMessage?: string } {
  if (error instanceof AppError) {
    return {
      code: error.code,
      category: error.category,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
      userSafeMessage: error.message,
      recoveryAction: error.recoveryAction,
      remediation: error.remediation,
    };
  }

  const code = error?.code as string | undefined;
  if (code && DOMAIN_ERROR_TAXONOMY[code]) {
    return DOMAIN_ERROR_TAXONOMY[code];
  }

  // Zod validation errors
  if (error?.name === 'ZodError' || Array.isArray(error?.issues)) {
    const firstIssue = error?.issues?.[0];
    const field = firstIssue?.path?.join('.') || 'input';
    const message = firstIssue?.message || 'Invalid input';
    return {
      ...DOMAIN_ERROR_TAXONOMY.VALIDATION_FAILED,
      customMessage: `${field}: ${message}`,
    };
  }

  // Common network / connection errors
  if (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ECONNRESET' ||
    error?.message?.includes('Horizon') ||
    error?.message?.includes('network')
  ) {
    return DOMAIN_ERROR_TAXONOMY.HORIZON_UNAVAILABLE;
  }

  // Specific message heuristics
  if (typeof error?.message === 'string') {
    const msg = error.message;
    if (msg.includes('not found') || msg.includes('Invoice not found')) {
      return DOMAIN_ERROR_TAXONOMY.INVOICE_NOT_FOUND;
    }
    if (msg.includes('sellerPublicKey') || msg.includes('Seller public key')) {
      return DOMAIN_ERROR_TAXONOMY.SELLER_REQUIRED;
    }
    if (msg.includes('already processed') || msg.includes('cannot be cancelled')) {
      return DOMAIN_ERROR_TAXONOMY.INVOICE_CANNOT_CANCEL;
    }
    if (msg.includes('expired')) {
      return DOMAIN_ERROR_TAXONOMY.INVOICE_EXPIRED;
    }
  }

  return DOMAIN_ERROR_TAXONOMY.INTERNAL_ERROR;
}

/**
 * Build a user-safe API error response payload.
 */
export function buildUserSafeErrorResponse(
  error: any,
  correlationId?: string
): {
  success: false;
  error: string;
  code: string;
  category: ErrorCategory;
  retryable: boolean;
  recoveryAction: string;
  remediation?: string[];
  correlationId?: string;
  timestamp: string;
  details?: any;
} {
  const classified = classifyError(error);

  let userMessage = classified.userSafeMessage;
  if (classified.customMessage) {
    userMessage = classified.customMessage;
  } else if (classified.code !== 'INTERNAL_ERROR' && typeof error?.message === 'string' && error.message.length > 0 && !error.message.includes('\n')) {
    userMessage = error.message;
  }

  userMessage = redactErrorMessage(userMessage);

  return {
    success: false,
    error: userMessage,
    code: classified.code,
    category: classified.category,
    retryable: classified.retryable,
    recoveryAction: classified.recoveryAction,
    ...(classified.remediation?.length ? { remediation: classified.remediation } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(error?.details ? { details: sanitizeObject(error.details) } : {}),
    timestamp: new Date().toISOString(),
  };
}
