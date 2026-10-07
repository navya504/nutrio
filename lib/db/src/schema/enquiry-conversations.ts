import { index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const enquiryMessagesTable = pgTable("nutrio_enquiry_messages", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  enquiryId: integer("enquiry_id").notNull(),
  authorId: text("author_id").notNull(),
  authorRole: text("author_role").notNull(),
  body: text("body").notNull(),
  clientMessageId: uuid("client_message_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("enquiry_message_thread_idx").on(table.kind, table.enquiryId, table.id),
  uniqueIndex("enquiry_message_retry_idx").on(table.authorId, table.clientMessageId),
]);

export const enquiryReadsTable = pgTable("nutrio_enquiry_reads", {
  kind: text("kind").notNull(),
  enquiryId: integer("enquiry_id").notNull(),
  readerId: text("reader_id").notNull(),
  lastReadMessageId: integer("last_read_message_id").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.kind, table.enquiryId, table.readerId] }),
]);

export const insertEnquiryMessageSchema = createInsertSchema(enquiryMessagesTable).omit({ id: true, createdAt: true });
export const insertEnquiryReadSchema = createInsertSchema(enquiryReadsTable);
export type EnquiryMessageRow = typeof enquiryMessagesTable.$inferSelect;
export type InsertEnquiryMessage = z.infer<typeof insertEnquiryMessageSchema>;
export type InsertEnquiryRead = z.infer<typeof insertEnquiryReadSchema>;
