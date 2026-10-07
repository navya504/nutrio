import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export type PlanEntry = {
  day: number;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  kind: "food" | "recipe";
  slug: string;
  servings: number;
};

export const memberProfilesTable = pgTable("nutrio_member_profiles", {
  ownerId: text("owner_id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  goal: text("goal").notNull().default("healthy"),
  dietaryPreference: text("dietary_preference").notNull().default("any"),
  dailyCalories: integer("daily_calories").notNull().default(2000),
  dailyProteinG: integer("daily_protein_g").notNull().default(75),
});
export const memberFavouritesTable = pgTable("nutrio_member_favourites", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  slug: text("slug").notNull(),
}, (table) => [uniqueIndex("nutrio_favourite_owner_item").on(table.ownerId, table.kind, table.slug)]);
export const memberPlansTable = pgTable("nutrio_member_plans", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  days: integer("days").notNull(),
  entries: jsonb("entries").$type<PlanEntry[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertMemberProfileSchema = createInsertSchema(memberProfilesTable);
export const insertMemberFavouriteSchema = createInsertSchema(memberFavouritesTable).omit({ id: true });
export const insertMemberPlanSchema = createInsertSchema(memberPlansTable).omit({ id: true, updatedAt: true });
export type MemberProfile = typeof memberProfilesTable.$inferSelect;
export type MemberFavourite = typeof memberFavouritesTable.$inferSelect;
export type MemberPlan = typeof memberPlansTable.$inferSelect;
