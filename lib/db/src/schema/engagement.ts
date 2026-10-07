import { boolean, date, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const assistantTurnsTable = pgTable("nutrio_assistant_turns", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  requestId: uuid("request_id").notNull(),
  userText: text("user_text").notNull(),
  useProfile: boolean("use_profile").notNull().default(false),
  reply: text("reply"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("nutrio_assistant_retry").on(t.ownerId, t.requestId),
  uniqueIndex("nutrio_assistant_one_pending").on(t.ownerId).where(sql`${t.status} = 'pending'`),
]);
export const assistantUsageTable = pgTable("nutrio_assistant_usage", {
  ownerId: text("owner_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);

export const challengeMembersTable = pgTable("nutrio_challenge_members", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  challengeSlug: text("challenge_slug").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("nutrio_challenge_member").on(t.ownerId, t.challengeSlug)]);
export const challengeCheckinsTable = pgTable("nutrio_challenge_checkins", {
  memberId: integer("member_id").notNull().references(() => challengeMembersTable.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
}, (t) => [primaryKey({ columns: [t.memberId, t.day] })]);
