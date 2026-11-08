import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Users (Data Pengguna)
export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  firstName: text("first_name").notNull(),
  username: text("username"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  defaultWalletId: bigint("default_wallet_id", { mode: "number" }),
  settings: jsonb("settings").$type<{
    reminderAttendanceMorning?: boolean; // Pengingat absen pagi (mis. 07:30)
    reminderAttendanceTime?: string;    // Jam pengingat (default "07:30")
    dailySummaryTime?: string;          // Jam rekap malam (default "21:00")
  }>().default({
    reminderAttendanceMorning: true,
    reminderAttendanceTime: "07:30",
    dailySummaryTime: "21:00",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Wallets (Dompet / Akun: Tunai, Rekening BCA, GoPay, dsb.)
export const wallets = pgTable("wallets", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("cash"), // cash | bank | ewallet
  initialBalance: bigint("initial_balance", { mode: "number" }).notNull().default(0),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. Categories (Kategori Pemasukan / Pengeluaran)
export const categories = pgTable("categories", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📁"),
  kind: text("kind").notNull(), // income | expense
  keywords: text("keywords").array().default([]), // Keyword untuk deteksi otomatis
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 4. Transactions (Pencatatan Keuangan Harian)
export const transactions = pgTable("transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletId: bigint("wallet_id", { mode: "number" })
    .notNull()
    .references(() => wallets.id, { onDelete: "restrict" }),
  toWalletId: bigint("to_wallet_id", { mode: "number" }).references(() => wallets.id, {
    onDelete: "restrict",
  }), // Diisi hanya saat transfer antar dompet
  categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(), // income | expense | transfer | adjustment
  amount: bigint("amount", { mode: "number" }).notNull(), // Selalu positif dalam Rupiah bulat (BIGINT)
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  source: text("source").notNull().default("chat"), // chat | attendance | salary | transfer
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // Soft-delete untuk fitur Undo
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 5. Budgets (Anggaran Bulanan per Kategori)
export const budgets = pgTable("budgets", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryId: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  periodMonth: text("period_month").notNull(), // YYYY-MM
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 6. Salary Profiles (Konfigurasi Gaji & Tunjangan Harian)
export const salaryProfiles = pgTable("salary_profiles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  payType: text("pay_type").notNull().default("monthly"), // monthly (bulanan) | daily (harian)
  baseAmount: bigint("base_amount", { mode: "number" }).notNull().default(0), // Gaji pokok bulanan ATAU upah per hari
  payDay: integer("pay_day").notNull().default(25), // Tanggal gajian (1-31)
  allowancePerWorkDay: bigint("allowance_per_work_day", { mode: "number" }).notNull().default(0), // Uang makan/transport per hari berangkat
  fixedDeductions: bigint("fixed_deductions", { mode: "number" }).notNull().default(0), // Potongan tetap (BPJS, kasbon, dll)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 7. Attendances (Absen Keberangkatan Harian: Berangkat atau Tidak)
export const attendances = pgTable(
  "attendances",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(), // Tanggal kalender (YYYY-MM-DD)
    status: text("status").notNull(), // 'berangkat' | 'libur' | 'izin' | 'sakit' | 'cuti'
    note: text("note"), // Keterangan opsional (mis. "Dinas luar", "Demam")
    transportCost: bigint("transport_cost", { mode: "number" }), // Biaya ongkos/bensin hari itu jika dicatat saat absen
    loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_work_date_idx").on(table.userId, table.workDate),
  ]
);

// 8. Bot Sessions (State percakapan untuk grammY session)
export const botSessions = pgTable("bot_sessions", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relasi Antar Tabel
export const usersRelations = relations(users, ({ many, one }) => ({
  wallets: many(wallets),
  categories: many(categories),
  transactions: many(transactions),
  attendances: many(attendances),
  salaryProfile: one(salaryProfiles, {
    fields: [users.id],
    references: [salaryProfiles.userId],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  wallet: one(wallets, {
    fields: [transactions.walletId],
    references: [wallets.id],
  }),
  toWallet: one(wallets, {
    fields: [transactions.toWalletId],
    references: [wallets.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const attendancesRelations = relations(attendances, ({ one }) => ({
  user: one(users, {
    fields: [attendances.userId],
    references: [users.id],
  }),
}));
