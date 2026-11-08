import { eq, and, between } from "drizzle-orm";
import { db } from "../../db/index.js";
import { attendances, transactions, categories, wallets } from "../../db/schema.js";
import { getMonthRange } from "../../lib/date.js";

/**
 * Mencatat atau memperbarui status kehadiran harian (berangkat / libur / izin / sakit / cuti)
 */
export async function logAttendance(
  userId: number,
  workDate: string,
  status: "berangkat" | "libur" | "izin" | "sakit" | "cuti",
  note?: string
) {
  // Cek apakah sudah pernah absen di tanggal ini
  const existing = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.userId, userId), eq(attendances.workDate, workDate)))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const [updated] = await db
      .update(attendances)
      .set({
        status,
        note: note ?? existing[0].note,
        loggedAt: new Date(),
      })
      .where(eq(attendances.id, existing[0].id))
      .returning();
    return { record: updated, isUpdate: true };
  }

  const [inserted] = await db
    .insert(attendances)
    .values({
      userId,
      workDate,
      status,
      note,
    })
    .returning();

  return { record: inserted, isUpdate: false };
}

/**
 * Rekap absensi bulanan untuk user
 */
export async function getAttendanceMonthSummary(userId: number, periodMonth: string) {
  const { start, end } = getMonthRange(periodMonth);

  const logs = await db
    .select()
    .from(attendances)
    .where(
      and(
        eq(attendances.userId, userId),
        between(attendances.workDate, start, end)
      )
    );

  const summary = {
    totalRecorded: logs.length,
    berangkat: 0,
    libur: 0,
    izin: 0,
    sakit: 0,
    cuti: 0,
    totalTransportCost: 0,
  };

  for (const item of logs) {
    if (item.status === "berangkat") summary.berangkat++;
    else if (item.status === "libur") summary.libur++;
    else if (item.status === "izin") summary.izin++;
    else if (item.status === "sakit") summary.sakit++;
    else if (item.status === "cuti") summary.cuti++;

    if (item.transportCost) {
      summary.totalTransportCost += item.transportCost;
    }
  }

  return summary;
}

/**
 * Catat ongkos transportasi keberangkatan kerja dan hubungkan ke pengeluaran
 */
export async function logTransportCost(
  userId: number,
  workDate: string,
  costAmount: number,
  walletId?: number
) {
  // Update ongkos di tabel attendance
  await db
    .update(attendances)
    .set({ transportCost: costAmount })
    .where(and(eq(attendances.userId, userId), eq(attendances.workDate, workDate)));

  // Ambil kategori 'Transportasi'
  const transportCats = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, "expense"),
        eq(categories.name, "Transportasi")
      )
    )
    .limit(1);

  const categoryId = transportCats[0]?.id;

  // Cari dompet yang dipakai (atau default jika tidak dispesifikasikan)
  let targetWalletId = walletId;
  if (!targetWalletId) {
    const userWallets = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.isArchived, false)))
      .limit(1);
    targetWalletId = userWallets[0]?.id;
  }

  if (targetWalletId) {
    await db.insert(transactions).values({
      userId,
      walletId: targetWalletId,
      categoryId,
      type: "expense",
      amount: costAmount,
      note: `Ongkos berangkat kerja (${workDate})`,
      source: "attendance",
    });
  }
}
