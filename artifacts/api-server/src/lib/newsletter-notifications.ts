import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, newsletterSignupsTable as signups } from "@workspace/db";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { deliverNewsletterEmail, welcomeContent } from "./newsletter-email";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 120_000;
const PENDING = ["pending", "preparing", "sending", "failed", "uncertain"];
const fields = {
  owner: { status: "notificationStatus", attempts: "notificationAttempts", next: "nextAttemptAt",
    lease: "leaseAt", message: "gmailMessageId", error: "lastError" },
  welcome: { status: "welcomeStatus", attempts: "welcomeAttempts", next: "welcomeNextAttemptAt",
    lease: "welcomeLeaseAt", message: "welcomeGmailMessageId", error: "welcomeLastError" },
} as const;
type Mode = keyof typeof fields;

export function notifyNewsletterSignup(id: number) { return sendSignupEmail(id, "owner"); }
export function sendWelcomeNewsletter(id: number) { return sendSignupEmail(id, "welcome"); }

async function sendSignupEmail(id: number, mode: Mode): Promise<void> {
  const f = fields[mode];
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(signups).where(eq(signups.id, id))
      .for("update", { skipLocked: true });
    const lease = current?.[f.lease];
    if (!current || !PENDING.includes(current[f.status]) || current[f.attempts] >= MAX_ATTEMPTS ||
        current[f.next] > now || (lease && now.getTime() - lease.getTime() < LEASE_MS)) return null;
    const uncertain = ["sending", "uncertain"].includes(current[f.status]);
    const [claimed] = await tx.update(signups).set({
      [f.lease]: now, [f.status]: uncertain ? "uncertain" : "preparing",
      [f.attempts]: current[f.attempts] + 1,
    }).where(eq(signups.id, id)).returning();
    return claimed;
  });
  if (!row) return;
  let sendStarted = row[f.status] === "uncertain";
  const lease = and(eq(signups.id, id), eq(signups[f.lease], now));
  try {
    // Subscriber addresses cannot control the owner alert recipient.
    const recipient = mode === "welcome" ? row.email : process.env.NEWSLETTER_NOTIFICATION_EMAIL?.trim();
    if (!recipient) throw new Error("Newsletter notification recipient is not configured");
    const preview = process.env.NODE_ENV !== "production";
    const messageId = `${mode === "welcome" ? "welcome" : "newsletter"}.${row.deliveryKey}@nutrio.local`;
    const text = mode === "welcome" ? welcomeContent() : [
      ...(preview ? ["This notification is from the Nutrio development preview.", ""] : []),
      "A new newsletter signup has been saved.", `Subscriber email: ${row.email}`,
      `Signed up: ${row.consentAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
      `Signup reference: NL-${row.id}`, "The signup form recorded explicit consent.",
      "", "Email ownership has not been verified. A separate one-time welcome delivery is tracked for this signup.",
    ].join("\r\n");
    const gmailFetch = new ReplitConnectors().createProxyFetch("google-mail");
    const message = await deliverNewsletterEmail({
      gmailFetch, messageId, recipient, date: row.consentAt,
      subject: `${preview ? "[TEST/PREVIEW] " : ""}${mode === "welcome" ? "Welcome to Nutrio - Eat Smart. Live Better." : "Nutrio: New newsletter signup"}`,
      text, uncertain: sendStarted, markSendStarted: (value) => { sendStarted = value; },
      beforeSend: async () => {
        const [owned] = await db.update(signups).set({ [f.status]: "sending" }).where(lease).returning({ id: signups.id });
        return Boolean(owned);
      },
    });
    if (message) await db.update(signups).set({
      [f.status]: "sent", [f.message]: message, [f.lease]: null, [f.error]: null,
    }).where(lease);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Newsletter email failed";
    await db.update(signups).set({
      [f.status]: sendStarted ? "uncertain" : "failed", [f.lease]: null, [f.error]: reason,
      [f.next]: new Date(Date.now() + Math.min(600_000, 30_000 * 2 ** (row[f.attempts] - 1))),
    }).where(lease);
    logger.warn({ signupId: id, delivery: mode, attempt: row[f.attempts], reason },
      "Newsletter signup saved but email delivery needs attention");
  }
}

let draining = false;
export function startNewsletterNotificationWorker() {
  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      const pending = await db.select({ id: signups.id }).from(signups).where(or(
        and(inArray(signups.notificationStatus, PENDING), lte(signups.nextAttemptAt, new Date()), sql`${signups.notificationAttempts} < ${MAX_ATTEMPTS}`),
        and(inArray(signups.welcomeStatus, PENDING), lte(signups.welcomeNextAttemptAt, new Date()), sql`${signups.welcomeAttempts} < ${MAX_ATTEMPTS}`),
      )).orderBy(signups.id).limit(10);
      // Separate leases, statuses and Message-IDs protect both delivery channels.
      for (const row of pending) {
        await notifyNewsletterSignup(row.id);
        await sendWelcomeNewsletter(row.id);
      }
    } catch {
      logger.warn("Newsletter worker could not reconcile pending emails");
    } finally { draining = false; }
  };
  void drain();
  setInterval(() => void drain(), 45_000).unref();
}
