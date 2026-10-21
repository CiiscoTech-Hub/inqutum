/**
 * Workflow SLA tracking with escalation and overdue state handling (issue #189).
 *
 * Defines SLA policies for key workflow states, tracks due times and escalation
 * levels, and emits structured audit events on state changes.
 *
 * SLA policies are configurable at runtime via SLAPolicyRegistry so contributors
 * can extend them without touching this file.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Workflow states that carry an SLA obligation. */
export type SLAWorkflowState =
  | 'PENDING_PAYMENT'
  | 'PENDING_VERIFICATION'
  | 'PENDING_APPROVAL'
  | 'PENDING_ESCALATION_REVIEW';

/** Policy for one workflow state. */
export interface SLAPolicy {
  /** Human-readable name for documentation and dashboards. */
  name: string;
  /** Seconds from entry into the state until the deadline. */
  dueSecs: number;
  /** Seconds after the deadline when the first escalation fires. */
  escalationAfterSecs: number;
  /** Maximum escalation level before the workflow is considered permanently overdue. */
  maxEscalationLevel: number;
}

export const DEFAULT_SLA_POLICIES: Record<SLAWorkflowState, SLAPolicy> = {
  PENDING_PAYMENT: {
    name: 'Payment due',
    dueSecs: 24 * 60 * 60,       // 24 h
    escalationAfterSecs: 2 * 60 * 60,
    maxEscalationLevel: 3,
  },
  PENDING_VERIFICATION: {
    name: 'Verification due',
    dueSecs: 30 * 60,             // 30 min
    escalationAfterSecs: 10 * 60,
    maxEscalationLevel: 2,
  },
  PENDING_APPROVAL: {
    name: 'Approval due',
    dueSecs: 4 * 60 * 60,         // 4 h
    escalationAfterSecs: 60 * 60,
    maxEscalationLevel: 3,
  },
  PENDING_ESCALATION_REVIEW: {
    name: 'Escalation review due',
    dueSecs: 60 * 60,             // 1 h
    escalationAfterSecs: 30 * 60,
    maxEscalationLevel: 1,
  },
};

/** Mutable policy registry — swap out policies in tests or at startup. */
export class SLAPolicyRegistry {
  private policies: Map<string, SLAPolicy>;

  constructor(initial: Record<string, SLAPolicy> = DEFAULT_SLA_POLICIES) {
    this.policies = new Map(Object.entries(initial));
  }

  get(state: string): SLAPolicy | undefined {
    return this.policies.get(state);
  }

  set(state: string, policy: SLAPolicy): void {
    this.policies.set(state, policy);
  }

  all(): ReadonlyMap<string, SLAPolicy> {
    return this.policies;
  }
}

// ─── SLA state per workflow ───────────────────────────────────────────────────

export type SLAStatus = 'ON_TIME' | 'OVERDUE' | 'ESCALATED' | 'RESOLVED';

export interface WorkflowSLAState {
  workflowId: string;
  state: SLAWorkflowState;
  enteredAt: Date;
  dueAt: Date;
  slaStatus: SLAStatus;
  escalationLevel: number;
  resolvedAt: Date | null;
  escalationHistory: EscalationRecord[];
}

export interface EscalationRecord {
  level: number;
  actor: string;
  reason: string;
  at: Date;
}

// ─── SLA Engine ──────────────────────────────────────────────────────────────

export interface SLAAuditEvent {
  workflowId: string;
  eventType: 'SLA_OVERDUE' | 'SLA_ESCALATED' | 'SLA_RESOLVED' | 'SLA_POLICY_CHANGED';
  previousStatus: SLAStatus | null;
  newStatus: SLAStatus;
  escalationLevel: number;
  actor: string;
  reason: string;
  at: Date;
  metadata?: Record<string, unknown>;
}

/** Callback invoked whenever an SLA audit event is emitted. */
export type SLAAuditSink = (event: SLAAuditEvent) => void;

export class WorkflowSLAEngine {
  private readonly registry: SLAPolicyRegistry;
  private readonly store: Map<string, WorkflowSLAState> = new Map();
  private readonly auditSink: SLAAuditSink;

  constructor(registry: SLAPolicyRegistry, auditSink: SLAAuditSink = () => {}) {
    this.registry = registry;
    this.auditSink = auditSink;
  }

  /**
   * Record a workflow entering a state and compute its SLA deadline.
   * Returns the initial SLA state with status ON_TIME.
   */
  enter(workflowId: string, state: SLAWorkflowState, now: Date = new Date()): WorkflowSLAState {
    const policy = this.registry.get(state);
    if (!policy) {
      throw new Error(`No SLA policy registered for state "${state}"`);
    }

    const dueAt = new Date(now.getTime() + policy.dueSecs * 1000);
    const slaState: WorkflowSLAState = {
      workflowId,
      state,
      enteredAt: now,
      dueAt,
      slaStatus: 'ON_TIME',
      escalationLevel: 0,
      resolvedAt: null,
      escalationHistory: [],
    };

    this.store.set(workflowId, slaState);
    return { ...slaState };
  }

  /**
   * Evaluate the current SLA status for a workflow at the given time.
   * Transitions ON_TIME → OVERDUE and OVERDUE → ESCALATED as appropriate,
   * emitting audit events for each transition.
   */
  evaluate(workflowId: string, now: Date = new Date()): WorkflowSLAState {
    const slaState = this.store.get(workflowId);
    if (!slaState) {
      throw new Error(`No SLA state found for workflow "${workflowId}"`);
    }

    if (slaState.slaStatus === 'RESOLVED') {
      return { ...slaState };
    }

    const policy = this.registry.get(slaState.state)!;
    const overdueSecs = (now.getTime() - slaState.dueAt.getTime()) / 1000;

    if (overdueSecs < 0) {
      // Still on time.
      return { ...slaState };
    }

    // Determine escalation level based on time past deadline.
    const newLevel = Math.min(
      Math.floor(overdueSecs / policy.escalationAfterSecs),
      policy.maxEscalationLevel
    );

    const newStatus: SLAStatus = newLevel > 0 ? 'ESCALATED' : 'OVERDUE';

    if (slaState.slaStatus !== newStatus || newLevel > slaState.escalationLevel) {
      const previousStatus = slaState.slaStatus;
      slaState.slaStatus = newStatus;

      if (newLevel > slaState.escalationLevel) {
        slaState.escalationLevel = newLevel;
        const record: EscalationRecord = {
          level: newLevel,
          actor: 'system',
          reason: 'Automatic escalation: SLA deadline exceeded',
          at: now,
        };
        slaState.escalationHistory.push(record);
      }

      this.auditSink({
        workflowId,
        eventType: newStatus === 'ESCALATED' ? 'SLA_ESCALATED' : 'SLA_OVERDUE',
        previousStatus,
        newStatus,
        escalationLevel: slaState.escalationLevel,
        actor: 'system',
        reason: 'Automatic SLA evaluation',
        at: now,
      });
    }

    return { ...slaState };
  }

  /**
   * Record a manual escalation by an actor with an explicit reason.
   */
  escalate(
    workflowId: string,
    actor: string,
    reason: string,
    now: Date = new Date()
  ): WorkflowSLAState {
    const slaState = this.store.get(workflowId);
    if (!slaState) {
      throw new Error(`No SLA state found for workflow "${workflowId}"`);
    }
    if (slaState.slaStatus === 'RESOLVED') {
      throw new Error(`Cannot escalate a resolved workflow "${workflowId}"`);
    }

    const policy = this.registry.get(slaState.state)!;
    const newLevel = Math.min(slaState.escalationLevel + 1, policy.maxEscalationLevel);
    const previousStatus = slaState.slaStatus;

    slaState.escalationLevel = newLevel;
    slaState.slaStatus = 'ESCALATED';

    const record: EscalationRecord = { level: newLevel, actor, reason, at: now };
    slaState.escalationHistory.push(record);

    this.auditSink({
      workflowId,
      eventType: 'SLA_ESCALATED',
      previousStatus,
      newStatus: 'ESCALATED',
      escalationLevel: newLevel,
      actor,
      reason,
      at: now,
    });

    return { ...slaState };
  }

  /**
   * Mark a workflow SLA as resolved.
   */
  resolve(
    workflowId: string,
    actor: string,
    reason: string,
    now: Date = new Date()
  ): WorkflowSLAState {
    const slaState = this.store.get(workflowId);
    if (!slaState) {
      throw new Error(`No SLA state found for workflow "${workflowId}"`);
    }

    const previousStatus = slaState.slaStatus;
    slaState.slaStatus = 'RESOLVED';
    slaState.resolvedAt = now;

    this.auditSink({
      workflowId,
      eventType: 'SLA_RESOLVED',
      previousStatus,
      newStatus: 'RESOLVED',
      escalationLevel: slaState.escalationLevel,
      actor,
      reason,
      at: now,
    });

    return { ...slaState };
  }

  /**
   * Return all workflows currently in OVERDUE or ESCALATED status.
   */
  listOverdue(): WorkflowSLAState[] {
    return Array.from(this.store.values()).filter(
      (s) => s.slaStatus === 'OVERDUE' || s.slaStatus === 'ESCALATED'
    );
  }

  /** Get the current SLA state for a workflow (read-only copy). */
  get(workflowId: string): WorkflowSLAState | undefined {
    const s = this.store.get(workflowId);
    return s ? { ...s } : undefined;
  }
}
