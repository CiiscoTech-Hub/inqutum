import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess } from '../types/api';
import {
  EmailDeliveryService,
  emailDeliveryService,
  isValidRecipient,
  type EmailStatus,
} from '../notifications/email-delivery';

export interface EmailRouterOptions {
  service?: EmailDeliveryService;
  /** When true, POST /email/webhook accepts unsigned provider callbacks. */
  allowUnsignedWebhooks?: boolean;
}

const sendEmailSchema = z.object({
  to: z.string().min(3),
  subject: z.string().min(1).max(200),
  text: z.string().max(20_000).optional(),
  html: z.string().max(50_000).optional(),
  replyTo: z.string().optional(),
  invoiceId: z.string().max(64).optional(),
  idempotencyKey: z.string().max(200).optional(),
});

const webhookSchema = z.object({
  /** Provider message id returned on the original send. */
  messageId: z.string().min(1),
  event: z.enum(['bounce', 'complaint', 'delivered']),
  reason: z.string().max(500).optional(),
});

/**
 * Failure categories map to stable codes so the UI can give specific advice.
 * `category`, `retryable` and `recoveryAction` are no longer repeated here:
 * `sendFailure` resolves them (plus the `remediation` steps) from
 * `DOMAIN_ERROR_TAXONOMY`, which is the single source for that metadata.
 */
const FAILURE_CODES: Record<string, { status: number; code: string }> = {
  auth: {
    status: 502,
    code: 'EMAIL_AUTH_FAILED',
  },
  quota: {
    status: 429,
    code: 'EMAIL_QUOTA_EXCEEDED',
  },
  transient: {
    status: 503,
    code: 'EMAIL_TRANSIENT_FAILURE',
  },
  invalid_recipient: {
    status: 400,
    code: 'EMAIL_INVALID_RECIPIENT',
  },
  config: {
    status: 503,
    code: 'EMAIL_NOT_CONFIGURED',
  },
  in_progress: {
    status: 409,
    code: 'EMAIL_SEND_IN_PROGRESS',
  },
  in_doubt: {
    status: 409,
    code: 'EMAIL_OUTCOME_IN_DOUBT',
  },
  key_reused: {
    status: 422,
    code: 'EMAIL_IDEMPOTENCY_KEY_REUSED',
  },
  permanent: {
    status: 502,
    code: 'EMAIL_FAILED',
  },
};

/**
 * Email delivery routes. Mount under `/api`.
 *
 *   POST /email/send      send an invoice / proof email, explicit success or failure
 *   GET  /email/deliveries?to=&status=   delivery log (bounces + complaints included)
 *   GET  /email/problems  everything not confirmed as sent
 *   POST /email/webhook   provider bounce / complaint / delivery callback
 */
export function createEmailRouter(options: EmailRouterOptions = {}): Router {
  const service = options.service ?? emailDeliveryService;
  const router = Router();

  router.post('/email/send', async (req: Request, res: Response) => {
    const parsed = sendEmailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendFailure(res, 400, 'Invalid email request', {
        code: 'EMAIL_REQUEST_INVALID',
        correlationId: req.correlationId,
      });
    }

    const body = parsed.data;
    if (!isValidRecipient(body.to)) {
      return sendFailure(res, 400, 'Recipient is not a valid email address', {
        code: 'EMAIL_INVALID_RECIPIENT',
        correlationId: req.correlationId,
      });
    }

    const result = await service.deliver({
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
      replyTo: body.replyTo,
      idempotencyKey: body.idempotencyKey ?? (body.invoiceId ? `invoice:${body.invoiceId}` : undefined),
      metadata: body.invoiceId ? { invoiceId: body.invoiceId } : undefined,
    });

    // Success is reported explicitly, never implied by a 2xx with no body.
    if (result.ok) {
      return sendSuccess(
        res,
        200,
        {
          status: result.status,
          deliveryId: result.delivery?.id,
          providerMessageId: result.delivery?.providerMessageId,
        },
        { message: result.message, correlationId: req.correlationId }
      );
    }

    const mapping = FAILURE_CODES[result.category ?? 'permanent'] ?? FAILURE_CODES.permanent;
    return sendFailure(res, mapping.status, result.message ?? 'Email delivery failed', {
      code: mapping.code,
      correlationId: req.correlationId,
    });
  });

  router.get('/email/deliveries', (req: Request, res: Response) => {
    const status = req.query.status as EmailStatus | undefined;
    const limit = Number.parseInt(String(req.query.limit ?? '50'), 10);
    const deliveries = service.listDeliveries({
      to: req.query.to ? String(req.query.to) : undefined,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return sendSuccess(res, 200, { deliveries, count: deliveries.length }, {
      correlationId: req.correlationId,
    });
  });

  // Bounce / complaint visibility: everything that was not confirmed as sent.
  router.get('/email/problems', (_req: Request, res: Response) => {
    const problems = service.listProblems();
    return sendSuccess(res, 200, { problems, count: problems.length });
  });

  router.post('/email/webhook', (req: Request, res: Response) => {
    const parsed = webhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendFailure(res, 400, 'Invalid webhook payload', {
        code: 'EMAIL_WEBHOOK_INVALID',
        correlationId: req.correlationId,
      });
    }

    const { messageId, event, reason } = parsed.data;
    const record =
      event === 'bounce'
        ? service.recordBounce(messageId, reason)
        : event === 'complaint'
          ? service.recordComplaint(messageId, reason)
          : service.getStore().findByProviderMessageId(messageId);

    if (!record) {
      return sendFailure(res, 404, 'No delivery matches that message id', {
        code: 'EMAIL_DELIVERY_NOT_FOUND',
        correlationId: req.correlationId,
      });
    }

    return sendSuccess(res, 200, { delivery: record }, { correlationId: req.correlationId });
  });

  return router;
}

export default createEmailRouter;
