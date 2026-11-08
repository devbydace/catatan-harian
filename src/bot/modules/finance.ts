import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { transactions, wallets, categories, attendances } from "../../db/schema.js";
import { formatRupiah, ParsedTransaction } from "../../lib/money-parser.js";
import { getTodayDate } from "../../lib/date.js";

/**
 * Mencatat transaksi dari hasil parsing pesan cepat
 */
export async function createQuickTransaction(
  userId: number,
  parsed: ParsedTransaction,
  defaultWalletId?: number | null
) {
  // 1. Tentukan dompet yang dipakai
  let targetWalletId = defaultWalletId;

  if (parsed.walletName) {
    const userWallets = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.isArchived, false)));

    const tag = parsed.walletName.toLowerCase().replace(/[-_ ]/g, "");
    const matched = userWallets.find((w) => {
      const wName = w.name.toLowerCase().replace(/[-_ ]/g, "");
      if (wName === tag || wName.includes(tag) || tag.includes(wName)) return true;
      if (tag === "jago" && wName.includes("jago")) return true;
      if (["gopay", "ovo", "dana", "shopee", "shopeepay", "ewallet", "dompet"].includes(tag) && (w.type === "ewallet" || wName.includes("ewallet"))) return true;
      if (["lain", "lainlain", "other"].includes(tag) && (w.type === "other" || wName.includes("lain"))) return true;
      return false;
    });

    if (matched) {
      targetWalletId = matched.id;
    }
  }

  // Jika dompet default belum ada/valid, ambil dompet pertama milik user
  if (!targetWalletId) {
    const firstWallet = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.isArchived, false)))
      .limit(1);

    if (!firstWallet[0]) {
      throw new Error("Kamu belum memiliki dompet aktif. Ketik /start untuk inisialisasi.");
    }
    targetWalletId = firstWallet[0].id;
  }

  // 2. Deteksi otomatis kategori berdasarkan kata kunci di catatan
  const userCategories = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, parsed.type),
        eq(categories.isArchived, false)
      )
    );

  let matchedCategory = userCategories.find((cat) => {
    if (!cat.keywords || cat.keywords.length === 0) return false;
    const lowerNote = parsed.note.toLowerCase();
    return cat.keywords.some((kw) => lowerNote.includes(kw.toLowerCase()));
  });

  // Jika tidak cocok keyword apapun, cari kategori default 'Lainnya'
  if (!matchedCategory) {
    matchedCategory = userCategories.find((cat) =>
      cat.name.toLowerCase().includes("lain")
    );
  }

  // 3. Simpan ke database
  const [created] = await db
    .insert(transactions)
    .values({
      userId,
      walletId: targetWalletId,
      categoryId: matchedCategory?.id ?? null,
      type: parsed.type,
      amount: parsed.amount,
      note: parsed.note,
      source: "chat",
    })
    .returning();

  if (!created) {
    throw new Error("Gagal menyimpan transaksi ke database.");
  }

  // Ambil nama dompet untuk respons pesan
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, targetWalletId))
    .limit(1);

  return {
    transaction: created,
    walletName: wallet?.name || "Dompet",
    categoryName: matchedCategory ? `${matchedCategory.emoji} ${matchedCategory.name}` : "📁 Umum",
  };
}

/**
 * Mendapatkan daftar saldo seluruh dompet milik user
 */
export async function getUserBalances(userId: number) {
  const userWallets = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isArchived, false)));

  const balances: Array<{
    id: number;
    name: string;
    type: string;
    balance: number;
  }> = [];

  let grandTotal = 0;

  for (const w of userWallets) {
    // Hitung pemasukan ke dompet ini
    const inRes = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.walletId, w.id),
          eq(transactions.type, "income"),
          isNull(transactions.deletedAt)
        )
      );

    // Hitung pengeluaran dari dompet ini
    const outRes = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.walletId, w.id),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt)
        )
      );

    // Hitung transfer masuk ke dompet ini
    const trInRes = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.toWalletId, w.id),
          eq(transactions.type, "transfer"),
          isNull(transactions.deletedAt)
        )
      );

    // Hitung transfer keluar dari dompet ini
    const trOutRes = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.walletId, w.id),
          eq(transactions.type, "transfer"),
          isNull(transactions.deletedAt)
        )
      );

    const totalIncome = Number(inRes[0]?.total || 0);
    const totalExpense = Number(outRes[0]?.total || 0);
    const totalTrIn = Number(trInRes[0]?.total || 0);
    const totalTrOut = Number(trOutRes[0]?.total || 0);

    const currentBalance = w.initialBalance + totalIncome - totalExpense + totalTrIn - totalTrOut;
    grandTotal += currentBalance;

    balances.push({
      id: w.id,
      name: w.name,
      type: w.type,
      balance: currentBalance,
    });
  }

  return { wallets: balances, grandTotal };
}

/**
 * Ringkasan transaksi dan status absen untuk hari ini
 */
export async function getTodaySummary(userId: number, timezone: string = "Asia/Jakarta") {
  const today = getTodayDate(timezone);

  // Ambil transaksi hari ini
  const todayTransactions = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      note: transactions.note,
      walletName: wallets.name,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`DATE(${transactions.occurredAt} AT TIME ZONE ${timezone}) = ${today}::date`,
        isNull(transactions.deletedAt)
      )
    );

  let totalExpense = 0;
  let totalIncome = 0;

  for (const t of todayTransactions) {
    if (t.type === "expense") totalExpense += t.amount;
    else if (t.type === "income") totalIncome += t.amount;
  }

  // Ambil status absen hari ini
  const [attendance] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.userId, userId), eq(attendances.workDate, today)))
    .limit(1);

  return {
    today,
    totalExpense,
    totalIncome,
    transactions: todayTransactions,
    attendanceStatus: attendance?.status || "belum absen",
  };
}

/**
 * Soft delete transaksi (Undo)
 */
export async function deleteTransaction(transactionId: number, userId: number) {
  const [deleted] = await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt)
      )
    )
    .returning();

  return deleted;
}

/**
 * Transfer saldo antar dompet (misal dari BCA ke GoPay)
 */
export async function transferFunds(
  userId: number,
  fromWalletName: string,
  toWalletName: string,
  amount: number,
  note?: string
) {
  const userWallets = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isArchived, false)));

  const fromWallet = userWallets.find(
    (w) => w.name.toLowerCase() === fromWalletName.toLowerCase()
  );
  const toWallet = userWallets.find(
    (w) => w.name.toLowerCase() === toWalletName.toLowerCase()
  );

  if (!fromWallet) {
    throw new Error(`Dompet sumber "${fromWalletName}" tidak ditemukan.`);
  }
  if (!toWallet) {
    throw new Error(`Dompet tujuan "${toWalletName}" tidak ditemukan.`);
  }
  if (fromWallet.id === toWallet.id) {
    throw new Error("Dompet asal dan tujuan tidak boleh sama.");
  }

  const [tx] = await db
    .insert(transactions)
    .values({
      userId,
      walletId: fromWallet.id,
      toWalletId: toWallet.id,
      type: "transfer",
      amount,
      note: note || `Transfer ${fromWallet.name} -> ${toWallet.name}`,
      source: "transfer",
    })
    .returning();

  return {
    transaction: tx,
    fromName: fromWallet.name,
    toName: toWallet.name,
    amount,
  };
}

/**
 * Laporan pengeluaran per kategori untuk periode bulan tertentu (YYYY-MM)
 */
export async function getMonthlyCategoryReport(
  userId: number,
  periodMonth: string,
  timezone: string = "Asia/Jakarta"
) {
  // Ambil semua transaksi pada bulan tersebut
  const txList = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      note: transactions.note,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`TO_CHAR(${transactions.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM') = ${periodMonth}`,
        isNull(transactions.deletedAt)
      )
    );

  let totalExpense = 0;
  let totalIncome = 0;
  const categoryMap: Record<string, { emoji: string; amount: number; count: number }> = {};

  for (const t of txList) {
    if (t.type === "expense") {
      totalExpense += t.amount;
      const catKey = t.categoryName || "Lainnya";
      const catEmoji = t.categoryEmoji || "📁";

      if (!categoryMap[catKey]) {
        categoryMap[catKey] = { emoji: catEmoji, amount: 0, count: 0 };
      }
      categoryMap[catKey].amount += t.amount;
      categoryMap[catKey].count += 1;
    } else if (t.type === "income") {
      totalIncome += t.amount;
    }
  }

  // Urutkan kategori dari yang terbesar
  const sortedCategories = Object.entries(categoryMap)
    .map(([name, data]) => ({
      name,
      emoji: data.emoji,
      amount: data.amount,
      count: data.count,
      percentage: totalExpense > 0 ? Math.round((data.amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    periodMonth,
    totalExpense,
    totalIncome,
    netSavings: totalIncome - totalExpense,
    categories: sortedCategories,
    transactionCount: txList.length,
  };
}

/**
 * Menghasilkan data transaksi dalam format teks CSV untuk di-download
 */
export async function generateTransactionsCsv(
  userId: number,
  periodMonth?: string,
  timezone: string = "Asia/Jakarta"
): Promise<string> {
  const whereConditions = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  ];

  if (periodMonth) {
    whereConditions.push(
      sql`TO_CHAR(${transactions.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM') = ${periodMonth}`
    );
  }

  const txList = await db
    .select({
      id: transactions.id,
      date: sql<string>`TO_CHAR(${transactions.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
      type: transactions.type,
      amount: transactions.amount,
      note: transactions.note,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...whereConditions))
    .orderBy(sql`${transactions.occurredAt} DESC`);

  // Buat header CSV
  let csv = "ID,Tanggal,Tipe,Nominal,Catatan,Kategori,Dompet\n";

  for (const t of txList) {
    const cleanNote = (t.note || "").replace(/"/g, '""');
    const cleanCat = (t.categoryName || "").replace(/"/g, '""');
    const cleanWallet = (t.walletName || "").replace(/"/g, '""');
    csv += `${t.id},"${t.date}","${t.type}",${t.amount},"${cleanNote}","${cleanCat}","${cleanWallet}"\n`;
  }

  return csv;
}
