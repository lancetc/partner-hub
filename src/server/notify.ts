import "server-only";

/*
  Notification adapters. The worker never marks a message delivered on a local timer:
  "accepted" means a provider took the request; "delivered" needs provider confirmation.
*/

export type OutboundMessage = {
  idempotencyKey: string;
  to: { name: string; email: string };
  subject: string;
  body: string;
  /** HTML version (newsletters). The plain-text body is always sent too. */
  html?: string;
  /** Extra mail headers, such as List-Unsubscribe for marketing email. */
  headers?: Record<string, string>;
};

export type SendResult =
  | { status: "accepted"; providerRef: string }
  | { status: "failed"; error: string; retryable: boolean }
  | { status: "unknown"; error: string }
  | { status: "not_configured"; error: string };

export interface NotificationAdapter {
  channel: "email" | "sms";
  name: string;
  configured: boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/**
  Email through an HTTP provider or relay. Configure EMAIL_WEBHOOK_URL (and optionally
  EMAIL_WEBHOOK_TOKEN). The idempotency key is sent so a provider that supports it can
  discard duplicates. A timeout is "unknown" and must be reconciled before any resend.
*/
export class WebhookEmailAdapter implements NotificationAdapter {
  channel = "email" as const;
  name = "Email (HTTP provider)";
  constructor(
    private url = process.env.EMAIL_WEBHOOK_URL,
    private token = process.env.EMAIL_WEBHOOK_TOKEN,
    private timeoutMs = 10_000,
  ) {}
  get configured() {
    return Boolean(this.url);
  }
  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!this.url) return { status: "not_configured", error: "EMAIL_WEBHOOK_URL is not set. Message kept as a preview." };
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": msg.idempotencyKey,
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ to: msg.to.email, name: msg.to.name, subject: msg.subject, text: msg.body, ...(msg.html ? { html: msg.html } : {}), ...(msg.headers ? { headers: msg.headers } : {}) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { status: "accepted", providerRef: data.id ?? res.headers.get("x-message-id") ?? "accepted" };
      }
      return { status: "failed", error: `Provider responded ${res.status}`, retryable: res.status >= 500 || res.status === 429 };
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") return { status: "unknown", error: "Provider timed out; outcome unknown" };
      return { status: "failed", error: err.message, retryable: true };
    }
  }
}

/** Prepared for a later SMS connection; reports "not configured" until a provider is chosen. */
export class SmsAdapter implements NotificationAdapter {
  channel = "sms" as const;
  name = "SMS (not connected)";
  configured = false;
  async send(): Promise<SendResult> {
    return { status: "not_configured", error: "No SMS provider is connected yet." };
  }
}

export function adapterFor(channel: "email" | "sms"): NotificationAdapter {
  return channel === "sms" ? new SmsAdapter() : new WebhookEmailAdapter();
}
