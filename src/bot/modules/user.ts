import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, wallets, categories, salaryProfiles } from "../../db/schema.js";

export async function getOrCreateUser(telegramUser: {
  id: number;
  first_name: string;
  username?: string;
}) {
  // 1. Cek apakah user sudah terdaftar
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramUser.id))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    return existing[0];
  }

  // 2. Buat user baru
  const [newUser] = await db
    .insert(users)
    .values({
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name,
      username: telegramUser.username,
      timezone: "Asia/Jakarta",
    })
    .returning();

  if (!newUser) {
    throw new Error("Gagal membuat user baru");
  }

  // 3. Seed dompet default (Tunai, BCA, GoPay)
  const [cashWallet] = await db
    .insert(wallets)
    .values([
      { userId: newUser.id, name: "Tunai", type: "cash", initialBalance: 0 },
      { userId: newUser.id, name: "BCA", type: "bank", initialBalance: 0 },
      { userId: newUser.id, name: "GoPay", type: "ewallet", initialBalance: 0 },
    ])
    .returning();

  if (cashWallet) {
    // Set dompet default ke 'Tunai'
    await db
      .update(users)
      .set({ defaultWalletId: cashWallet.id })
      .where(eq(users.id, newUser.id));
    newUser.defaultWalletId = cashWallet.id;
  }

  // 4. Seed kategori default
  await db.insert(categories).values([
    // Pengeluaran
    {
      userId: newUser.id,
      name: "Makan & Minum",
      emoji: "🍔",
      kind: "expense",
      keywords: ["makan", "minum", "kopi", "sarapan", "siang", "malam", "jajan", "bakso", "mie", "nasi"],
    },
    {
      userId: newUser.id,
      name: "Transportasi",
      emoji: "🛵",
      kind: "expense",
      keywords: ["bensin", "parkir", "tol", "ojol", "grab", "gojek", "ongkos", "busway", "kereta"],
    },
    {
      userId: newUser.id,
      name: "Belanja",
      emoji: "🛒",
      kind: "expense",
      keywords: ["belanja", "supermarket", "indomaret", "alfamart", "pasar", "sabun"],
    },
    {
      userId: newUser.id,
      name: "Tagihan",
      emoji: "💡",
      kind: "expense",
      keywords: ["listrik", "pln", "wifi", "pulsa", "paket data", "air", "pdam", "bpjs", "sewa", "kos"],
    },
    {
      userId: newUser.id,
      name: "Lainnya",
      emoji: "📦",
      kind: "expense",
      keywords: [],
    },
    // Pemasukan
    {
      userId: newUser.id,
      name: "Gaji",
      emoji: "💼",
      kind: "income",
      keywords: ["gaji", "salary", "upah"],
    },
    {
      userId: newUser.id,
      name: "Bonus",
      emoji: "🎁",
      kind: "income",
      keywords: ["bonus", "thr", "hadiah", "komisi"],
    },
    {
      userId: newUser.id,
      name: "Freelance",
      emoji: "💻",
      kind: "income",
      keywords: ["freelance", "proyek", "side hustle"],
    },
  ]);

  // 5. Inisialisasi profil gaji default
  await db.insert(salaryProfiles).values({
    userId: newUser.id,
    payType: "monthly",
    baseAmount: 0,
    payDay: 25,
    allowancePerWorkDay: 0,
    fixedDeductions: 0,
  });

  return newUser;
}
