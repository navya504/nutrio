import { boolean, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const catalogueTable = pgTable("nutrio_catalogue", {
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  available: boolean("available").notNull().default(true),
  operatorSupplied: boolean("operator_supplied").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  verificationNote: text("verification_note").notNull().default(""),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.kind, table.key] })]);
export const insertCatalogueSchema = createInsertSchema(catalogueTable);
export type CatalogueRow = typeof catalogueTable.$inferSelect;
export type InsertCatalogue = z.infer<typeof insertCatalogueSchema>;
