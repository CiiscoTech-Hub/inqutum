/**
 * Issue #303 — stable error codes with documented remediation hints.
 *
 * Guards the whole vertical slice:
 *   1. Every DOMAIN_ERROR_TAXONOMY entry ships actionable remediation steps.
 *   2. Every code literal emitted by routes, servers and webhook middleware
 *      exists in the taxonomy (no silent, undocumented failure codes).
 *   3. Envelope helpers (apiFailure, sendVerificationFailure,
 *      buildUserSafeErrorResponse) surface remediation to clients.
 *   4. docs/ERRORS.md — including the generated catalog — matches the code.
 *   5. The frontend verification mirror agrees with the taxonomy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DOMAIN_ERROR_TAXONOMY,
  AppError,
  buildUserSafeErrorResponse,
} from '../src/errors/error-taxonomy';
import { apiFailure, sendVerificationFailure } from '../src/types/api';
import { renderCatalogSection, renderDocsErrorFile } from '../scripts/generate-error-catalog';

const REPO_ROOT = path.join(__dirname, '../..');
const BACKEND_ROOT = path.join(__dirname, '..');
const ERRORS_DOC = path.join(REPO_ROOT, 'docs/ERRORS.md');
const API_CONTRACT_DOC = path.join(REPO_ROOT, 'docs/API_CONTRACTS.md');

/** Codes whose literal appearance is expected without a taxonomy entry. */
const SCAN_ALLOWLIST = new Set<string>([]);

describe('error remediation catalog (issue #303)', () => {
  it('gives every catalog entry non-empty, distinct remediation steps', () => {
    const codes = Object.keys(DOMAIN_ERROR_TAXONOMY);
    assert.ok(codes.length >= 89, `expected the expanded catalog, found ${codes.length} codes`);

    for (const code of codes) {
      const def = DOMAIN_ERROR_TAXONOMY[code];
      assert.ok(
        Array.isArray(def.remediation) && def.remediation.length > 0,
        `${code} must ship at least one remediation step`
      );
      for (const step of def.remediation) {
        assert.equal(typeof step, 'string', `${code}: remediation steps must be strings`);
        assert.ok(
          step.trim().length > 0 && step === step.trim(),
          `${code}: remediation steps must be non-empty and trimmed`
        );
      }
      assert.equal(
        new Set(def.remediation).size,
        def.remediation.length,
        `${code}: remediation steps must be distinct`
      );
      assert.ok(def.recoveryAction.trim().length > 0, `${code}: recoveryAction must stay non-empty`);
    }
  });

  it('keeps every code emitted by routes, servers and webhooks in the taxonomy', () => {
    const files = [
      ...['src/routes', 'src/webhooks'].flatMap((dir) =>
        fs
          .readdirSync(path.join(BACKEND_ROOT, dir))
          .filter((file) => file.endsWith('.ts'))
          .map((file) => path.join(dir, file))
      ),
      'src/server.ts',
      'src/server-mvp.ts',
    ].filter((file) => fs.existsSync(path.join(BACKEND_ROOT, file)));

    const orphans = new Map<string, string[]>();
    for (const file of files) {
      const source = fs.readFileSync(path.join(BACKEND_ROOT, file), 'utf8');
      const patterns = [
        /code:\s*'([A-Z][A-Z0-9_]*)'/g,
        /webhookError\(res,\s*\d+,\s*'([A-Z][A-Z0-9_]*)'/g,
      ];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          const code = match[1];
          if (SCAN_ALLOWLIST.has(code) || DOMAIN_ERROR_TAXONOMY[code]) continue;
          const line = source.slice(0, match.index).split('\n').length;
          const where = orphans.get(code) || [];
          where.push(`${file}:${line}`);
          orphans.set(code, where);
        }
      }
    }

    assert.deepEqual(
      [...orphans.entries()].map(([code, sites]) => `${code} at ${sites.join(', ')}`),
      [],
      'these emitted codes are missing from DOMAIN_ERROR_TAXONOMY (undocumented failures)'
    );
  });

  it('attaches remediation when apiFailure builds an envelope', () => {
    const body = apiFailure('Too many requests', { code: 'RATE_LIMITED', correlationId: 'corr-1' });

    assert.deepEqual(body.remediation, DOMAIN_ERROR_TAXONOMY.RATE_LIMITED.remediation);
    assert.equal(body.category, DOMAIN_ERROR_TAXONOMY.RATE_LIMITED.category);
    assert.equal(body.retryable, DOMAIN_ERROR_TAXONOMY.RATE_LIMITED.retryable);
    assert.equal(body.correlationId, 'corr-1');

    const unknown = apiFailure('boom', { code: 'NOT_A_REAL_CODE' });
    assert.equal('remediation' in unknown, false, 'unknown codes must not invent remediation');
  });

  it('attaches remediation when sendVerificationFailure renders a failure', () => {
    const json: Record<string, unknown> = {};
    const res = {
      status(code: number) {
        assert.equal(code, 400);
        return this;
      },
      json(body: Record<string, unknown>) {
        Object.assign(json, body);
        return this;
      },
    } as any;

    sendVerificationFailure(res, 400, 'MEMO_MISMATCH', 'Memo mismatch', 'corr-2');

    assert.deepEqual(json.remediation, DOMAIN_ERROR_TAXONOMY.MEMO_MISMATCH.remediation);
    assert.equal(json.recoveryAction, DOMAIN_ERROR_TAXONOMY.MEMO_MISMATCH.recoveryAction);
    assert.equal(json.correlationId, 'corr-2');
  });

  it('attaches remediation when the error handler classifies an AppError', () => {
    const payload = buildUserSafeErrorResponse(
      new AppError('NOTIFICATION_NOT_FOUND', 'Notification not found'),
      'corr-3'
    );

    assert.deepEqual(payload.remediation, DOMAIN_ERROR_TAXONOMY.NOTIFICATION_NOT_FOUND.remediation);
    assert.equal(payload.code, 'NOTIFICATION_NOT_FOUND');
    assert.equal(payload.correlationId, 'corr-3');
  });

  it('keeps docs/ERRORS.md in lockstep with the catalog', () => {
    assert.ok(fs.existsSync(ERRORS_DOC), 'docs/ERRORS.md must exist');
    const doc = fs.readFileSync(ERRORS_DOC, 'utf8');

    assert.equal(
      renderDocsErrorFile(doc),
      doc,
      'docs/ERRORS.md is stale — run `npm run errors:catalog` in backend/'
    );
    assert.ok(doc.includes(renderCatalogSection()), 'generated catalog section must be embedded');

    for (const code of Object.keys(DOMAIN_ERROR_TAXONOMY)) {
      assert.ok(doc.includes(`\`${code}\``), `docs/ERRORS.md must document ${code}`);
    }
  });

  it('links the catalog from API_CONTRACTS.md at the current contract version', () => {
    const doc = fs.readFileSync(API_CONTRACT_DOC, 'utf8');

    assert.ok(doc.includes('ERRORS.md'), 'API_CONTRACTS.md must link the error catalog');
    assert.ok(doc.includes('"remediation"'), 'failure example must show the remediation key');
    const { CONTRACT_VERSION } = require('../src/api/contract');
    assert.ok(
      doc.includes(CONTRACT_VERSION),
      `API_CONTRACTS.md must mention contract version ${CONTRACT_VERSION}`
    );
  });

  it('mirrors remediation for the verification codes in the frontend', () => {
    const clientVerification = require(path.join(REPO_ROOT, 'frontend/lib/verification.js'));

    const mirror = clientVerification.REMEDIATION;
    assert.ok(mirror, 'frontend verification must export a REMEDIATION mirror');

    const mirroredCodes = Object.keys(mirror);
    assert.ok(mirroredCodes.length >= 15, 'mirror must cover the verification code union');

    for (const code of mirroredCodes) {
      const taxonomy = DOMAIN_ERROR_TAXONOMY[code];
      assert.ok(taxonomy, `frontend mirrors unknown code ${code}`);
      assert.deepEqual(
        mirror[code],
        taxonomy.remediation,
        `frontend REMEDIATION[${code}] drifted from DOMAIN_ERROR_TAXONOMY`
      );
    }

    for (const code of ['MISSING_TX_HASH', 'MEMO_MISMATCH', 'TRANSACTION_NOT_FOUND', 'NETWORK_MISMATCH']) {
      assert.ok(mirror[code], `mirror must cover ${code}`);
      assert.equal(clientVerification.failure(code).remediation, mirror[code]);
    }

    const details = clientVerification.resolveUserSafeError(
      { response: { data: { code: 'MEMO_MISMATCH', remediation: ['server steps win'] } } },
      'fallback'
    );
    assert.deepEqual(details.remediation, ['server steps win'], 'server remediation is authoritative');

    const local = clientVerification.resolveUserSafeError(
      { response: { data: { code: 'MEMO_MISMATCH' } } },
      'fallback'
    );
    assert.deepEqual(local.remediation, mirror.MEMO_MISMATCH, 'local mirror fills the gap');
  });
});
