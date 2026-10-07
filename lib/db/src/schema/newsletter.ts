import { pgTable, serial, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";

// Consent is captured by the public endpoint; email ownership is not verified.
export const newsletterSignupsTable = pgTable("nutrio_newsletter_signups", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  deliveryKey: uuid("delivery_key").notNull().defaultRandom().unique(),
  notificationStatus: text("notification_status").notNull().default("pending"),
  notificationAttempts: integer("notification_attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseAt: timestamp("lease_at", { withTimezone: true }),
  gmailMessageId: text("gmail_message_id"),
  lastError: text("last_error"),
  // Existing subscribers stay inactive; only newly consented signups are queued.
  welcomeStatus: text("welcome_status").notNull().default("inactive"),
  welcomeAttempts: integer("welcome_attempts").notNull().default(0),
  welcomeNextAttemptAt: timestamp("welcome_next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  welcomeLeaseAt: timestamp("welcome_lease_at", { withTimezone: true }),
  welcomeGmailMessageId: text("welcome_gmail_message_id"),
  welcomeLastError: text("welcome_last_error"),
});
