import { pgTable, serial, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";

// Consent is captured by the public endpoint; this is an interest list, not verified email ownership.
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
});
