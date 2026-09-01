import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  botState: text("bot_state").default("IDLE"),
  stateData: text("state_data"),
  subscriptionEnd: timestamp("subscription_end", { mode: 'string' }), // Legacy fallback
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(),
  planName: text("plan_name").notNull(),
  endDate: timestamp("end_date", { mode: 'string' }).notNull(),
  joinLink: text("join_link"),
});

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull(),
  price: integer("price").notNull(),
  description: text("description"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull(),
  status: text("status").notNull(),
  date: timestamp("date", { mode: 'string' }).notNull(),
});
