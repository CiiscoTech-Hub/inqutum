/**
 * Generates the code catalog table in docs/ERRORS.md from DOMAIN_ERROR_TAXONOMY
 * so the published remediation hints can never drift from the implementation.
 *
 *   npm run errors:catalog      rewrite the generated section
 *   tests/error-remediation.test.ts renders the same content in memory and
 *   fails when docs/ERRORS.md is stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN_ERROR_TAXONOMY, type DomainErrorDefinition } from '../src/errors/error-taxonomy';

export const BEGIN_MARKER =
  '<!-- BEGIN GENERATED CATALOG: run `npm run errors:catalog` after editing DOMAIN_ERROR_TAXONOMY -->';
export const END_MARKER = '<!-- END GENERATED CATALOG -->';

export const CATALOG_GROUPS: ReadonlyArray<{ title: string; codes: readonly string[] }> = [
  {
    title: 'Settlement & verification',
    codes: [
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
    ],
  },
  {
    title: 'General API domain errors',
    codes: [
      'VALIDATION_FAILED',
      'SELLER_REQUIRED',
      'INVALID_STATUS',
      'INVALID_CURSOR',
      'UNAUTHORIZED_SELLER',
      'INVOICE_NOT_FOUND',
      'INVOICE_CANNOT_CANCEL',
      'CORS_ORIGIN_DENIED',
      'HORIZON_UNAVAILABLE',
      'RATE_LIMITED',
      'CONFLICT',
      'INTERNAL_ERROR',
    ],
  },
  {
    title: 'Global & transport-level',
    codes: ['NOT_FOUND', 'INVALID_FILTER'],
  },
  {
    title: 'Authorization & admin surface',
    codes: ['UNAUTHORIZED', 'JOBS_ADMIN_DISABLED', 'APPROVALS_DISABLED', 'CAPABILITIES_DISABLED'],
  },
  {
    title: 'Sessions & impersonation',
    codes: ['SESSION_NOT_FOUND', 'IMPERSONATION_REJECTED'],
  },
  {
    title: 'Ops tooling (replay, projector, repair, receipts)',
    codes: [
      'REPLAY_REFUSED',
      'REPLAY_IN_PROGRESS',
      'NOTHING_TO_ROLL_BACK',
      'INVALID_PROJECTOR_VERSION',
      'DRY_RUN_UNAVAILABLE',
      'RECEIPT_NOT_FOUND',
      'REPAIR_JOB_NOT_FOUND',
      'REFERENCE_NOT_FOUND',
      'TARGET_INVALID',
    ],
  },
  {
    title: 'Partial-failure retry outcomes',
    codes: ['USER_ACTION_REQUIRED', 'RETRY_IN_PROGRESS', 'NOT_RETRYABLE_STATE', 'NOT_FAILED'],
  },
  {
    title: 'Job inspection & queue',
    codes: ['JOBS_UNAVAILABLE', 'JOB_NOT_FOUND', 'JOB_NOT_DEAD'],
  },
  {
    title: 'Invoice & notification paths',
    codes: [
      'INVOICE_NOT_PAID',
      'IDEMPOTENCY_KEY_REUSED',
      'INVALID_IDEMPOTENCY_KEY',
      'RECIPIENT_EMAIL_REQUIRED',
      'NOTIFICATION_NOT_FOUND',
      'RECIPIENT_REQUIRED',
    ],
  },
  {
    title: 'Email delivery',
    codes: [
      'EMAIL_AUTH_FAILED',
      'EMAIL_QUOTA_EXCEEDED',
      'EMAIL_TRANSIENT_FAILURE',
      'EMAIL_INVALID_RECIPIENT',
      'EMAIL_NOT_CONFIGURED',
      'EMAIL_SEND_IN_PROGRESS',
      'EMAIL_OUTCOME_IN_DOUBT',
      'EMAIL_IDEMPOTENCY_KEY_REUSED',
      'EMAIL_FAILED',
      'EMAIL_REQUEST_INVALID',
      'EMAIL_DELIVERY_NOT_FOUND',
      'EMAIL_WEBHOOK_INVALID',
    ],
  },
  {
    title: 'Exports',
    codes: [
      'EXPORT_EXPIRED',
      'EXPORT_FAILED',
      'EXPORT_FORBIDDEN',
      'EXPORT_NOT_FOUND',
      'EXPORT_TIMED_OUT',
      'INVALID_EXPORT_REQUEST',
      'REQUESTER_REQUIRED',
    ],
  },
  {
    title: 'Inbound webhooks',
    codes: ['MALFORMED_WEBHOOK', 'STALE_TIMESTAMP', 'INVALID_SIGNATURE', 'DUPLICATE_EVENT'],
  },
  {
    title: 'Capability tokens',
    codes: [
      'CAPABILITY_REQUEST_INVALID',
      'UNKNOWN_CAPABILITY_ACTION',
      'CAPABILITY_REQUIRED',
      'CAPABILITY_INVALID',
      'CAPABILITY_EXPIRED',
      'CAPABILITY_SCOPE_MISMATCH',
      'CAPABILITY_IN_USE',
      'CAPABILITY_ALREADY_USED',
      'CAPABILITY_LEDGER_FULL',
    ],
  },
];

const escapeCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const renderRow = (def: DomainErrorDefinition): string => {
  const hints = def.remediation.map((step, index) => `${index + 1}. ${step}`).join('<br>');
  return [
    `| \`${def.code}\``,
    def.httpStatus,
    def.category,
    def.retryable ? 'yes' : 'no',
    escapeCell(def.recoveryAction),
    escapeCell(hints),
    '|',
  ].join(' | ');
};

/** Renders the full generated section (markers included). Throws on drift. */
export function renderCatalogSection(): string {
  const catalogKeys = new Set(Object.keys(DOMAIN_ERROR_TAXONOMY));
  const grouped = new Set<string>();
  const lines: string[] = [BEGIN_MARKER];

  for (const group of CATALOG_GROUPS) {
    lines.push('', `### ${group.title} (${group.codes.length} codes)`, '');
    lines.push('| Code | HTTP | Category | Retryable | Recovery action | Remediation hints |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const code of group.codes) {
      const def = DOMAIN_ERROR_TAXONOMY[code];
      if (!def) {
        throw new Error(`Catalog group "${group.title}" lists unknown code ${code}`);
      }
      if (grouped.has(code)) {
        throw new Error(`Code ${code} appears in more than one catalog group`);
      }
      grouped.add(code);
      lines.push(renderRow(def));
    }
  }

  const ungrouped = [...catalogKeys].filter((code) => !grouped.has(code)).sort();
  if (ungrouped.length > 0) {
    throw new Error(
      `DOMAIN_ERROR_TAXONOMY contains codes missing from CATALOG_GROUPS: ${ungrouped.join(', ')}`
    );
  }

  lines.push('', END_MARKER);
  return lines.join('\n');
}

export function renderDocsErrorFile(existing: string): string {
  const begin = existing.indexOf(BEGIN_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error('docs/ERRORS.md is missing the generated-catalog markers');
  }
  const suffix = existing.slice(end + END_MARKER.length);
  return existing.slice(0, begin) + renderCatalogSection() + suffix;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const docPath = path.join(__dirname, '../../docs/ERRORS.md');
  const current = fs.readFileSync(docPath, 'utf8');
  const next = renderDocsErrorFile(current);
  if (next === current) {
    console.log('docs/ERRORS.md catalog is up to date.');
  } else {
    fs.writeFileSync(docPath, next, 'utf8');
    console.log('docs/ERRORS.md catalog regenerated.');
  }
}
