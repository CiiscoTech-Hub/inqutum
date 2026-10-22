/**
 * Tests for workflow SLA tracking with escalation and overdue state handling (issue #189).
 *
 * Covers: on-time completion, overdue transition, escalation (automatic and manual),
 * resolution, and policy changes via the registry.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkflowSLAEngine,
  SLAPolicyRegistry,
  DEFAULT_SLA_POLICIES,
  SLAAuditEvent,
  SLAPolicy,
} from '../src/domain/workflow-sla';

function makeEngine(overrides?: Record<string, SLAPolicy>) {
  const registry = new SLAPolicyRegistry(DEFAULT_SLA_POLICIES);
  if (overrides) {
    for (const [state, policy] of Object.entries(overrides)) {
      registry.set(state, policy);
    }
  }
  const events: SLAAuditEvent[] = [];
  const engine = new WorkflowSLAEngine(registry, (e) => events.push(e));
  return { engine, events, registry };
}

const FAST_POLICY: SLAPolicy = {
  name: 'Fast test policy',
  dueSecs: 10,
  escalationAfterSecs: 5,
  maxEscalationLevel: 2,
};

describe('WorkflowSLAEngine — on-time completion', () => {
  it('starts with ON_TIME status after entering a state', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const state = engine.enter('wf-1', 'PENDING_PAYMENT', new Date('2024-01-01T00:00:00Z'));
    assert.equal(state.slaStatus, 'ON_TIME');
    assert.equal(state.escalationLevel, 0);
    assert.equal(state.resolvedAt, null);
  });

  it('computes the correct dueAt from the policy', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    const state = engine.enter('wf-due', 'PENDING_PAYMENT', now);
    assert.equal(state.dueAt.getTime(), now.getTime() + FAST_POLICY.dueSecs * 1000);
  });

  it('stays ON_TIME when evaluated before the deadline', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-ontime', 'PENDING_PAYMENT', now);
    const result = engine.evaluate('wf-ontime', new Date(now.getTime() + 5_000));
    assert.equal(result.slaStatus, 'ON_TIME');
    assert.equal(events.length, 0);
  });

  it('resolve emits SLA_RESOLVED and sets resolvedAt', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-res', 'PENDING_PAYMENT', now);
    engine.resolve('wf-res', 'seller-abc', 'Payment received', now);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'SLA_RESOLVED');
    const s = engine.get('wf-res')!;
    assert.equal(s.slaStatus, 'RESOLVED');
    assert.deepEqual(s.resolvedAt, now);
  });
});

describe('WorkflowSLAEngine — overdue transition', () => {
  it('transitions to OVERDUE after the deadline with no escalation interval passed', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-ov', 'PENDING_PAYMENT', now);
    // Just past the deadline but not yet one escalation interval past.
    const result = engine.evaluate('wf-ov', new Date(now.getTime() + 11_000));
    assert.equal(result.slaStatus, 'OVERDUE');
    assert.equal(result.escalationLevel, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'SLA_OVERDUE');
  });

  it('listOverdue includes OVERDUE workflows', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-a', 'PENDING_PAYMENT', now);
    engine.enter('wf-b', 'PENDING_PAYMENT', now);
    engine.evaluate('wf-a', new Date(now.getTime() + 11_000)); // overdue
    // wf-b still on time
    const overdue = engine.listOverdue();
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0].workflowId, 'wf-a');
  });
});

describe('WorkflowSLAEngine — escalation', () => {
  it('escalates automatically when past deadline + escalation interval', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-esc', 'PENDING_PAYMENT', now);
    // Past deadline by more than one escalationAfterSecs.
    const result = engine.evaluate('wf-esc', new Date(now.getTime() + 16_000));
    assert.equal(result.slaStatus, 'ESCALATED');
    assert.ok(result.escalationLevel >= 1);
    assert.ok(events.some((e) => e.eventType === 'SLA_ESCALATED'));
  });

  it('records escalation history with actor and reason', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-man', 'PENDING_PAYMENT', now);
    engine.evaluate('wf-man', new Date(now.getTime() + 11_000)); // make it overdue first
    engine.escalate('wf-man', 'maintainer-xyz', 'Customer complaint', new Date(now.getTime() + 12_000));
    const s = engine.get('wf-man')!;
    assert.ok(s.escalationHistory.length >= 1);
    const last = s.escalationHistory[s.escalationHistory.length - 1];
    assert.equal(last.actor, 'maintainer-xyz');
    assert.equal(last.reason, 'Customer complaint');
  });

  it('caps escalation at maxEscalationLevel', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-cap', 'PENDING_PAYMENT', now);
    // Far past deadline — would exceed maxEscalationLevel if uncapped.
    const result = engine.evaluate('wf-cap', new Date(now.getTime() + 10_000_000));
    assert.ok(result.escalationLevel <= FAST_POLICY.maxEscalationLevel);
  });

  it('manual escalate emits SLA_ESCALATED audit event', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-audit', 'PENDING_PAYMENT', now);
    engine.escalate('wf-audit', 'admin-1', 'Urgent: buyer waiting', now);
    const escalated = events.filter((e) => e.eventType === 'SLA_ESCALATED');
    assert.equal(escalated.length, 1);
    assert.equal(escalated[0].actor, 'admin-1');
  });

  it('cannot escalate a resolved workflow', () => {
    const { engine } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-nesc', 'PENDING_PAYMENT', now);
    engine.resolve('wf-nesc', 'system', 'Done', now);
    assert.throws(
      () => engine.escalate('wf-nesc', 'actor', 'reason', now),
      /resolved/
    );
  });
});

describe('WorkflowSLAEngine — policy changes', () => {
  it('uses the updated policy when the registry is changed before enter()', () => {
    const { engine, registry } = makeEngine();
    registry.set('PENDING_PAYMENT', { ...FAST_POLICY, dueSecs: 3600 });
    const now = new Date('2024-01-01T00:00:00Z');
    const s = engine.enter('wf-pol', 'PENDING_PAYMENT', now);
    assert.equal(s.dueAt.getTime(), now.getTime() + 3600 * 1000);
  });

  it('throws when entering a state with no registered policy', () => {
    const { engine } = makeEngine({});
    assert.throws(
      () => engine.enter('wf-nopol', 'PENDING_PAYMENT', new Date()),
      /No SLA policy/
    );
  });
});

describe('WorkflowSLAEngine — resolution after overdue', () => {
  it('can resolve an overdue workflow and emits a single SLA_RESOLVED event', () => {
    const { engine, events } = makeEngine({ PENDING_PAYMENT: FAST_POLICY });
    const now = new Date('2024-01-01T00:00:00Z');
    engine.enter('wf-late-res', 'PENDING_PAYMENT', now);
    engine.evaluate('wf-late-res', new Date(now.getTime() + 11_000));
    engine.resolve('wf-late-res', 'seller-1', 'Late payment received', new Date(now.getTime() + 12_000));
    const resolved = events.filter((e) => e.eventType === 'SLA_RESOLVED');
    assert.equal(resolved.length, 1);
    const s = engine.get('wf-late-res')!;
    assert.equal(s.slaStatus, 'RESOLVED');
    // No longer appears in overdue list.
    assert.equal(engine.listOverdue().length, 0);
  });
});
