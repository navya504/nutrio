import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, newsletterSignupsTable as signups } from "@workspace/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 120_000;
type Signup = typeof signups.$inferSelect;

// Use a durable outbox. A lost Gmail send acknowledgement is ambiguous: reconcile
// by our stable RFC Message-ID and never blindly resend it.
export async function notifyNewsletterSignup(id: number): Promise<void> {
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(signups).where(eq(signups.id, id))
      .for("update", { skipLocked: true });
    if (!current || current.notificationStatus === "sent" ||
        current.notificationAttempts >= MAX_ATTEMPTS || current.nextAttemptAt > now ||
        (current.leaseAt && now.getTime() - current.leaseAt.getTime() < LEASE_MS)) return null;
    const uncertain = ["sending", "uncertain"].includes(current.notificationStatus);
    const [claimed] = await tx.update(signups).set({
      leaseAt: now,
      notificationStatus: uncertain ? "uncertain" : "preparing",
      notificationAttempts: current.notificationAttempts + 1,
    }).where(eq(signups.id, id)).returning();
    return claimed;
  });
  if (!row) return;

  let sendStarted = row.notificationStatus === "uncertain";
  const ownedLease = and(eq(signups.id, id), eq(signups.leaseAt, now));
  try {
    const recipient = process.env.NEWSLETTER_NOTIFICATION_EMAIL?.trim();
    if (!recipient || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
      throw new Error("Newsletter notification recipient is not configured");
    }
    const gmailFetch = new ReplitConnectors().createProxyFetch("google-mail");
    const messageId = `newsletter.${row.deliveryKey}@nutrio.local`;
    const search = new URLSearchParams({ q: `in:sent rfc822msgid:${messageId}`, maxResults: "1" });
    const found = await gmailFetch(`/gmail/v1/users/me/messages?${search}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!found.ok) throw new Error(`Gmail notification lookup rejected (${found.status})`);
    const existing = await found.json() as { messages?: { id: string }[] };
    if (existing.messages?.[0]?.id) {
      await recordSent(ownedLease, existing.messages[0].id);
      return;
    }
    if (sendStarted) {
      throw new Error("Send acknowledgement uncertain; only checking Sent mail, not resending");
    }

    const profileResponse = await gmailFetch("/gmail/v1/users/me/profile", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!profileResponse.ok) throw new Error(`Gmail sender lookup rejected (${profileResponse.status})`);
    const profile = await profileResponse.json() as { emailAddress?: string };
    if (!profile.emailAddress || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(profile.emailAddress)) {
      throw new Error("Connected Gmail has no valid sender address");
    }
    // Only server configuration selects the recipient; submitted email is body text only.
    const preview = process.env.NODE_ENV !== "production";
    const raw = [
      `From: Nutrio <${profile.emailAddress}>`,
      `To: ${recipient}`,
      `Subject: ${preview ? "[TEST/PREVIEW] " : ""}Nutrio: New newsletter signup`,
      `Message-ID: <${messageId}>`,
      `Date: ${row.consentAt.toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      ...(preview ? ["This notification is from the Nutrio development preview.", ""] : []),
      "A new newsletter signup has been saved.",
      `Subscriber email: ${row.email}`,
      `Signed up: ${row.consentAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
      `Signup reference: NL-${row.id}`,
      "The signup form recorded explicit consent to Nutrio updates.",
      "",
      "Email ownership has not been verified. No marketing campaign has been sent.",
    ].join("\r\n");
    const [stillOwned] = await db.update(signups).set({ notificationStatus: "sending" })
      .where(ownedLease).returning({ id: signups.id });
    if (!stillOwned) return;
    sendStarted = true;
    const sent = await gmailFetch("/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!sent.ok) {
      // Explicit 4xx rejection is safe to retry; server/network failures may have sent.
      if (sent.status >= 400 && sent.status < 500) sendStarted = false;
      throw new Error(`Gmail notification send rejected (${sent.status})`);
    }
    const result = await sent.json() as { id?: string };
    if (!result.id) throw new Error("Gmail send returned no acknowledgement");
    await recordSent(ownedLease, result.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Newsletter notification failed";
    await db.update(signups).set({
      notificationStatus: sendStarted ? "uncertain" : "failed",
      leaseAt: null,
      lastError: message,
      nextAttemptAt: new Date(Date.now() + Math.min(600_000, 30_000 * 2 ** (row.notificationAttempts - 1))),
    }).where(ownedLease);
    logger.warn({ signupId: id, notificationStatus: sendStarted ? "uncertain" : "failed",
      attempt: row.notificationAttempts, reason: message }, "Newsletter signup saved but notification needs attention");
  }
}

async function recordSent(lease: ReturnType<typeof and>, gmailMessageId: string) {
  await db.update(signups).set({
    notificationStatus: "sent", gmailMessageId, leaseAt: null, lastError: null,
  }).where(lease);
}

let draining = false;
export function startNewsletterNotificationWorker() {
  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      const pending = await db.select({ id: signups.id }).from(signups).where(and(
        inArray(signups.notificationStatus, ["pending", "preparing", "sending", "failed", "uncertain"]),
        lte(signups.nextAttemptAt, new Date()),
        sql`${signups.notificationAttempts} < ${MAX_ATTEMPTS}`,
      )).orderBy(signups.id).limit(10);
      for (const row of pending) await notifyNewsletterSignup(row.id);
    } catch {
      logger.warn("Newsletter notification worker could not reconcile pending signups");
    } finally {
      draining = false;
    }
  };
  void drain();
  const timer = setInterval(() => void drain(), 45_000);
  timer.unref();
}
