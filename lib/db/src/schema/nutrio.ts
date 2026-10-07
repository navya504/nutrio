import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const foodOrdersTable = pgTable("nutrio_food_orders", {
  status: text("status").notNull().default("received"),
  staffNote: text("staff_note").notNull().default(""),
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  pickupLocation: text("pickup_location").notNull(),
  pickupTime: text("pickup_time").notNull(),
  note: text("note"),
  items: jsonb("items")
    .$type<Array<{ foodSlug: string; quantity: number }>>()
    .notNull(),
  totalInRupees: integer("total_in_rupees").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFoodOrderSchema = createInsertSchema(foodOrdersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFoodOrder = z.infer<typeof insertFoodOrderSchema>;
export type FoodOrder = typeof foodOrdersTable.$inferSelect;

export const gymPartnershipsTable = pgTable("nutrio_gym_partnerships", {
  ownerId: text("owner_id"),
  status: text("status").notNull().default("received"),
  staffNote: text("staff_note").notNull().default(""),
  id: serial("id").primaryKey(),
  gymName: text("gym_name").notNull(),
  managerName: text("manager_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  location: text("location").notNull(),
  memberCount: integer("member_count").notNull(),
  hasCafeteria: boolean("has_cafeteria").notNull(),
  interests: jsonb("interests").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertGymPartnershipSchema = createInsertSchema(
  gymPartnershipsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertGymPartnership = z.infer<typeof insertGymPartnershipSchema>;

export const contactMessagesTable = pgTable("nutrio_contact_messages", {
  ownerId: text("owner_id"),
  status: text("status").notNull().default("received"),
  staffNote: text("staff_note").notNull().default(""),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertContactMessageSchema = createInsertSchema(
  contactMessagesTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
