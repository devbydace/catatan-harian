import { Bot, InlineKeyboard } from "grammy";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, attendances, salaryProfiles } from "../db/schema.js";
import { getTodayDate, formatDisplayDate } from "../lib/date.js";
import { getTodaySummary } from "../bot/modules/finance.js";
import { calculateSalaryEstimation } from "../bot/modules/salary.js";
import { formatRupiah } from "../lib/money-parser.js";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

/**
 * Mengirimkan pengingat absensi pagi (misal jam 07:30 WIB) jika user belum absen
 */
export async function sendMorningAttendanceReminders(bot: Bot) {
  const allUsers = await db.select().from(users);

  for (const u of allUsers) {
    const tz = u.timezone || "Asia/Jakarta";
    const zonedNow = toZonedTime(new Date(), tz);
    const currentTimeStr = format(zonedNow, "HH:mm");
    const targetReminderTime = u.settings?.reminderAttendanceTime || "07:30";

    // Cek apakah menit ini cocok dengan jadwal pengingat
    if (currentTimeStr === targetReminderTime) {
      const today = getTodayDate(tz);

      // Cek apakah user sudah absen hari ini
      const existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.userId, u.id), eq(attendances.workDate, today)))
        .limit(1);

      if (existing.length === 0) {
        const kb = new InlineKeyboard()
          .text("🚗 Berangkat Kerja", "act:berangkat")
          .text("🏖️ Tidak Masuk", "act:tidak_masuk");

        const msg =
          `🌅 **Selamat Pagi, ${u.firstName}!**\n\n` +
          `Hari ini **${formatDisplayDate(today, tz)}**.\n` +
          `Apakah kamu berangkat kerja hari ini?\n\n` +
          `_Cukup tap tombol di bawah untuk mencatat:_`;

        try {
          await bot.api.sendMessage(u.telegramId, msg, {
            parse_mode: "Markdown",
            reply_markup: kb,
          });
        } catch (err) {
          console.warn(`Gagal mengirim pengingat absen ke user ${u.telegramId}:`, err);
        }
      }
    }
  }
}

/**
 * Mengirimkan ringkasan keuangan malam hari (misal jam 21:00 WIB)
 */
export async function sendNightSummaryReminders(bot: Bot) {
  const allUsers = await db.select().from(users);

  for (const u of allUsers) {
    const tz = u.timezone || "Asia/Jakarta";
    const zonedNow = toZonedTime(new Date(), tz);
    const currentTimeStr = format(zonedNow, "HH:mm");
    const targetSummaryTime = u.settings?.dailySummaryTime || "21:00";

    if (currentTimeStr === targetSummaryTime) {
      const summary = await getTodaySummary(u.id, tz);

      // Hanya kirim jika ada aktivitas transaksi atau absensi hari ini
      if (summary.transactions.length > 0 || summary.attendanceStatus !== "belum absen") {
        let msg = `🌙 **RINGKASAN MALAM HARI INI**\n📅 ${formatDisplayDate(summary.today, tz)}\n\n`;
        msg += `🚗 **Status Kehadiran:** ${
          summary.attendanceStatus === "berangkat"
            ? "✅ Berangkat Kerja"
            : summary.attendanceStatus === "libur"
            ? "🏖️ Libur"
            : summary.attendanceStatus === "izin"
            ? "📝 Izin"
            : summary.attendanceStatus === "sakit"
            ? "🤒 Sakit"
            : summary.attendanceStatus === "cuti"
            ? "✈️ Cuti"
            : "⚠️ Belum absen"
        }\n\n`;

        msg += `💸 **Total Pengeluaran Hari Ini:** ${formatRupiah(summary.totalExpense)}\n`;
        if (summary.totalIncome > 0) {
          msg += `💵 **Pemasukan Hari Ini:** ${formatRupiah(summary.totalIncome)}\n`;
        }

        const kb = new InlineKeyboard()
          .text("📊 Lihat Laporan Lengkap", "act:laporan")
          .text("🎛️ Dashboard", "act:dashboard");

        try {
          await bot.api.sendMessage(u.telegramId, msg, {
            parse_mode: "Markdown",
            reply_markup: kb,
          });
        } catch (err) {
          console.warn(`Gagal mengirim rekap malam ke user ${u.telegramId}:`, err);
        }
      }
    }
  }
}

/**
 * Mengirimkan pengingat hari gajian jika hari ini tanggal gajian user (misal jam 08:00 WIB)
 */
export async function sendPaydayNotification(bot: Bot) {
  const allUsers = await db.select().from(users);

  for (const u of allUsers) {
    const tz = u.timezone || "Asia/Jakarta";
    const zonedNow = toZonedTime(new Date(), tz);
    const currentTimeStr = format(zonedNow, "HH:mm");
    const currentDayOfMonth = parseInt(format(zonedNow, "d"), 10);

    // Kirim pada jam 08:00 pagi
    if (currentTimeStr === "08:00") {
      const [profile] = await db
        .select()
        .from(salaryProfiles)
        .where(eq(salaryProfiles.userId, u.id))
        .limit(1);

      if (profile && profile.payDay === currentDayOfMonth) {
        const est = await calculateSalaryEstimation(u.id);

        const msg =
          `🎉 **SELAMAT HARI GAJIAN, ${u.firstName}!**\n\n` +
          `Hari ini adalah tanggal gajianmu (${profile.payDay}).\n` +
          `💰 **Estimasi Hak Gaji Bersih:** ${formatRupiah(est.netEstimatedSalary)}\n` +
          `📅 Berdasarkan ${est.daysWorked} hari hadir kerja bulan ini.\n\n` +
          `_Sudah menerima transfer gaji? Ketik langsung di chat untuk mencatat, contoh:_\n` +
          `\`+gaji ${est.netEstimatedSalary > 0 ? est.netEstimatedSalary : "5000000"} @bca\``;

        const kb = new InlineKeyboard().text("💼 Cek Rincian Gaji", "act:gaji");

        try {
          await bot.api.sendMessage(u.telegramId, msg, {
            parse_mode: "Markdown",
            reply_markup: kb,
          });
        } catch (err) {
          console.warn(`Gagal mengirim pengingat gajian ke user ${u.telegramId}:`, err);
        }
      }
    }
  }
}

/**
 * Memulai runner scheduler berkala (berjalan setiap 60 detik) untuk dev / Node process
 */
export function startLocalScheduler(bot: Bot) {
  console.log("⏰ Scheduler otomatis diaktifkan (Pengingat Absen 07:30, Gajian 08:00, Rekap 21:00)");

  // Jalankan interval per 60 detik
  setInterval(async () => {
    try {
      await sendMorningAttendanceReminders(bot);
      await sendPaydayNotification(bot);
      await sendNightSummaryReminders(bot);
    } catch (err) {
      console.error("Error pada background scheduler:", err);
    }
  }, 60_000);
}

