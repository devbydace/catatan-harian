import { Bot, InputFile, InlineKeyboard } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { limit } from "@grammyjs/ratelimiter";
import { eq, and } from "drizzle-orm";
import { env, isUserAllowed } from "../config/env.js";
import { db } from "../db/index.js";
import { categories, wallets, transactions } from "../db/schema.js";
import { getOrCreateUser } from "./modules/user.js";
import {
  getMainMenuKeyboard,
  getDashboardKeyboard,
  getTidakMasukKeyboard,
  getOngkosBerangkatKeyboard,
  getTransactionActionKeyboard,
  getFlowTypeKeyboard,
  getFlowCategoryKeyboard,
  getFlowAmountKeyboard,
  getFlowWalletKeyboard,
  getTransferFromKeyboard,
  getTransferToKeyboard,
  getTransferAmountKeyboard,
  getSetGajiBaseKeyboard,
  getSetGajiAllowanceKeyboard,
  getSetGajiPaydayKeyboard,
  getBudgetCategoryKeyboard,
  getBudgetAmountKeyboard,
} from "./keyboards.js";
import {
  createQuickTransaction,
  getUserBalances,
  getTodaySummary,
  deleteTransaction,
  transferFunds,
  getMonthlyCategoryReport,
  generateTransactionsCsv,
} from "./modules/finance.js";
import {
  logAttendance,
  getAttendanceMonthSummary,
  logTransportCost,
} from "./modules/attendance.js";
import { calculateSalaryEstimation, updateSalaryProfile } from "./modules/salary.js";
import {
  getBudgetSummary,
  setCategoryBudget,
  checkBudgetAlert,
} from "./modules/budget.js";
import { parseQuickTransaction, formatRupiah } from "../lib/money-parser.js";
import { getTodayDate, formatDisplayDate, getCurrentMonthPeriod } from "../lib/date.js";

/**
 * Helper untuk menyusun pesan teks dashboard utama
 */
async function buildDashboardText(userId: number, timezone: string): Promise<string> {
  const summary = await getTodaySummary(userId, timezone);
  const { grandTotal } = await getUserBalances(userId);
  const est = await calculateSalaryEstimation(userId);

  const statusLabel =
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
      : "⚠️ Belum Absen";

  return (
    `🎛️ **DASHBOARD UTAMA**\n` +
    `📅 ${formatDisplayDate(summary.today, timezone)}\n\n` +
    `🚗 **Status Absen:** ${statusLabel}\n` +
    `💰 **Total Saldo:** ${formatRupiah(grandTotal)}\n` +
    `💸 **Keluar Hari Ini:** ${formatRupiah(summary.totalExpense)}\n` +
    `💼 **Estimasi Gaji (${est.daysWorked} hari hadir):** ${formatRupiah(est.netEstimatedSalary)}\n\n` +
    `_Klik menu tombol di bawah untuk beraktivitas tanpa perlu mengetik teks:_`
  );
}

export function createBot() {
  const bot = new Bot(env.BOT_TOKEN);

  // Daftarkan menu native Telegram
  bot.api
    .setMyCommands([
      { command: "menu", description: "🎛️ Buka Dashboard Menu Lengkap" },
      { command: "saldo", description: "💳 Cek Saldo Dompet & Rekening" },
      { command: "hariini", description: "📊 Ringkasan Keuangan & Absen Hari Ini" },
      { command: "gaji", description: "💼 Estimasi Gaji Bulan Berjalan" },
      { command: "budget", description: "🎯 Cek & Atur Anggaran Kategori" },
      { command: "laporan", description: "📈 Laporan Pengeluaran per Kategori" },
      { command: "export", description: "📁 Unduh Seluruh Transaksi (Excel/CSV)" },
      { command: "bantuan", description: "📖 Panduan Penggunaan" },
    ])
    .catch(() => {});

  // 1. Plugin auto-retry jika terkena rate limit Telegram (Error 429)
  bot.api.config.use(autoRetry());

  // 2. Plugin rate limiter (maksimal 3 request per detik per user)
  bot.use(
    limit({
      timeFrame: 1000,
      limit: 3,
      onLimitExceeded: async (ctx) => {
        await ctx.reply("⚠️ Santai sejenak! Terlalu banyak perintah dalam satu waktu.");
      },
      keyGenerator: (ctx) => ctx.from?.id.toString(),
    })
  );

  // 3. Middleware Keamanan: Hanya izinkan Private Chat
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("🔒 Demi keamanan dan privasi finansial, bot ini hanya dapat digunakan di Private Chat.");
      return;
    }
    return next();
  });

  // 4. Middleware Whitelist (opsional) & Inisialisasi User
  bot.use(async (ctx, next) => {
    if (!ctx.from) return;

    if (!isUserAllowed(ctx.from.id)) {
      await ctx.reply("⛔ Maaf, Anda tidak memiliki akses untuk menggunakan bot ini.");
      return;
    }

    try {
      const user = await getOrCreateUser(ctx.from);
      (ctx as any).dbUser = user;
    } catch (err) {
      console.error("Gagal sinkronisasi user:", err);
      await ctx.reply("❌ Terjadi kendala saat menghubungkan ke database.");
      return;
    }

    return next();
  });

  // ===========================================================================
  // COMMAND HANDLERS
  // ===========================================================================

  // /start
  bot.command("start", async (ctx) => {
    const user = (ctx as any).dbUser;
    const text = await buildDashboardText(user.id, user.timezone);

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: getDashboardKeyboard(),
    });

    // Kirim juga reply keyboard tetap di bawah
    await ctx.reply("💡 Menu keyboard tombol cepat juga aktif di bawah layar kamu:", {
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // /menu
  bot.command("menu", async (ctx) => {
    const user = (ctx as any).dbUser;
    const text = await buildDashboardText(user.id, user.timezone);

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: getDashboardKeyboard(),
    });
  });

  // /saldo
  bot.command("saldo", async (ctx) => {
    const user = (ctx as any).dbUser;
    const { wallets, grandTotal } = await getUserBalances(user.id);

    let message = "💳 **SALDO DOMPET & REKENING**\n\n";
    for (const w of wallets) {
      const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : w.type === "ewallet" ? "📱" : "💳";
      message += `${icon} **${w.name}**: ${formatRupiah(w.balance)}\n`;
    }
    message += `\n━━━━━━━━━━━━━━━\n💰 **Total Saldo:** ${formatRupiah(grandTotal)}`;

    const kb = new InlineKeyboard()
      .text("🔄 Pindah Saldo", "flow:tr:start")
      .text("🔙 Menu", "act:dashboard");

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /hariini
  bot.command("hariini", async (ctx) => {
    const user = (ctx as any).dbUser;
    const summary = await getTodaySummary(user.id, user.timezone);

    let msg = `📊 **RINGKASAN HARI INI**\n📅 ${formatDisplayDate(summary.today, user.timezone)}\n\n`;
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

    msg += `💸 **Pengeluaran:** ${formatRupiah(summary.totalExpense)}\n`;
    msg += `💵 **Pemasukan:** ${formatRupiah(summary.totalIncome)}\n\n`;

    if (summary.transactions.length > 0) {
      msg += `📝 **Daftar Transaksi Hari Ini:**\n`;
      summary.transactions.forEach((tx, idx) => {
        const sign = tx.type === "income" ? "+" : "-";
        msg += `${idx + 1}. ${tx.note} (${tx.walletName}): ${sign}${formatRupiah(tx.amount)}\n`;
      });
    } else {
      msg += `_Belum ada transaksi yang dicatat hari ini._`;
    }

    const kb = new InlineKeyboard()
      .text("💸 Catat Pengeluaran", "flow:catat:type:expense")
      .text("🔙 Menu", "act:dashboard");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /gaji
  bot.command("gaji", async (ctx) => {
    const user = (ctx as any).dbUser;
    const est = await calculateSalaryEstimation(user.id);

    let msg = `💼 **ESTIMASI GAJI PERIODE ${est.periodMonth}**\n\n`;
    msg += `• Tipe Gaji: **${est.payType === "daily" ? "Upah Harian" : "Gaji Bulanan"}**\n`;
    msg += `• Hari Berangkat Kerja: **${est.daysWorked} hari**\n`;
    msg += `• Gaji/Upah Pokok: **${formatRupiah(est.totalBase)}**\n`;

    if (est.allowancePerWorkDay > 0) {
      msg += `• Tunjangan Harian (${formatRupiah(est.allowancePerWorkDay)}/hari): **+${formatRupiah(
        est.totalAllowance
      )}**\n`;
    }

    if (est.totalDeductions > 0) {
      msg += `• Potongan Rutin: **-${formatRupiah(est.totalDeductions)}**\n`;
    }

    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💰 **Estimasi Gaji Bersih: ${formatRupiah(est.netEstimatedSalary)}**\n\n`;
    msg += `_Catatan: Perhitungan otomatis diperbarui setiap kali kamu mencatat absen berangkat._`;

    const kb = new InlineKeyboard()
      .text("⚙️ Atur Nilai Gaji", "flow:setgaji:start")
      .text("🔙 Menu", "act:dashboard");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /rekapabsen
  bot.command("rekapabsen", async (ctx) => {
    const user = (ctx as any).dbUser;
    const currentMonth = getCurrentMonthPeriod(user.timezone);
    const summary = await getAttendanceMonthSummary(user.id, currentMonth);

    let msg = `📅 **REKAP KEHADIRAN BULAN INI (${currentMonth})**\n\n`;
    msg += `🚗 Berangkat Kerja: **${summary.berangkat} hari**\n`;
    msg += `🏖️ Libur: **${summary.libur} hari**\n`;
    msg += `📝 Izin: **${summary.izin} hari**\n`;
    msg += `🤒 Sakit: **${summary.sakit} hari**\n`;
    msg += `✈️ Cuti: **${summary.cuti} hari**\n`;

    if (summary.totalTransportCost > 0) {
      msg += `\n🛵 Total Ongkos Tercatat: **${formatRupiah(summary.totalTransportCost)}**\n`;
    }

    const kb = new InlineKeyboard().text("🔙 Menu", "act:dashboard");
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /transfer
  bot.command("transfer", async (ctx) => {
    const user = (ctx as any).dbUser;
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);

    if (args.length < 3) {
      const userWallets = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), eq(wallets.isArchived, false)));

      await ctx.reply("🔄 **PILIH DOMPET ASAL:**\n\nSilakan pilih dompet yang ingin dikurangi saldonya:", {
        reply_markup: getTransferFromKeyboard(userWallets),
      });
      return;
    }

    const rawAmount = args[0] || "";
    const fromWalletName = args[1] || "";
    const toWalletName = args[2] || "";

    const parsed = parseQuickTransaction(`transfer ${rawAmount}`);
    if (!parsed || parsed.amount <= 0) {
      await ctx.reply("❌ Nominal transfer tidak valid. Contoh: `50rb`, `500k`, `1jt`.", {
        parse_mode: "Markdown",
      });
      return;
    }

    try {
      const res = await transferFunds(user.id, fromWalletName, toWalletName, parsed.amount);
      await ctx.reply(
        `✅ **Transfer Saldo Berhasil!**\n\n` +
          `💵 **Nominal:** ${formatRupiah(res.amount)}\n` +
          `📤 **Dari:** ${res.fromName}\n` +
          `📥 **Ke:** ${res.toName}\n\n` +
          `Ketik /saldo untuk melihat saldo terbaru.`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message || "Gagal melakukan transfer."}`);
    }
  });

  // /setgaji
  bot.command("setgaji", async (ctx) => {
    await ctx.reply("⚙️ **PENGATURAN GAJI (PILIH VIA TOMBOL):**\n\nSilakan pilih gaji pokok bulanan atau upah harianmu:", {
      reply_markup: getSetGajiBaseKeyboard(),
    });
  });

  // /budget
  bot.command("budget", async (ctx) => {
    const user = (ctx as any).dbUser;
    const currentMonth = getCurrentMonthPeriod(user.timezone);
    const summary = await getBudgetSummary(user.id, currentMonth, user.timezone);

    let msg = `🎯 **STATUS ANGGARAN BULAN INI (${currentMonth})**\n\n`;
    if (summary.budgets.length === 0) {
      msg +=
        `_Belum ada anggaran kategori yang diatur._\n\n` +
        `💡 Tap tombol di bawah untuk menentukan batas pengeluaran bulanan (misal Makan & Minum: Rp1.5jt).`;
    } else {
      for (const b of summary.budgets) {
        const barLength = 8;
        const filled = Math.min(barLength, Math.round((b.percentage / 100) * barLength));
        const empty = barLength - filled;
        const bar = "█".repeat(filled) + "░".repeat(empty);

        const statusIcon = b.isOverBudget ? "🚨" : b.percentage >= 80 ? "⚠️" : "✅";
        msg +=
          `${b.emoji} **${b.name}**\n` +
          `[${bar}] ${b.percentage}%\n` +
          `💸 Terpakai: ${formatRupiah(b.spent)} / ${formatRupiah(b.budget)}\n` +
          `${statusIcon} Sisa: ${formatRupiah(b.remaining)}\n\n`;
      }
    }

    const kb = new InlineKeyboard()
      .text("🎯 Atur Anggaran Kategori", "flow:bg:start")
      .text("🔙 Menu", "act:dashboard");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /laporan
  bot.command("laporan", async (ctx) => {
    const user = (ctx as any).dbUser;
    const targetMonth = ctx.match.trim() || getCurrentMonthPeriod(user.timezone);

    const report = await getMonthlyCategoryReport(user.id, targetMonth, user.timezone);

    let msg = `📊 **LAPORAN KEUANGAN PERIODE ${report.periodMonth}**\n\n`;
    msg += `💵 **Total Pemasukan:** ${formatRupiah(report.totalIncome)}\n`;
    msg += `💸 **Total Pengeluaran:** ${formatRupiah(report.totalExpense)}\n`;

    const netIcon = report.netSavings >= 0 ? "📈" : "📉";
    msg += `${netIcon} **Sisa Bersih:** ${formatRupiah(report.netSavings)}\n`;
    msg += `📝 **Total Transaksi:** ${report.transactionCount}\n\n`;

    if (report.categories.length > 0) {
      msg += `📂 **Rincian Pengeluaran per Kategori:**\n`;
      for (const cat of report.categories) {
        msg += `• ${cat.emoji} **${cat.name}**: ${formatRupiah(cat.amount)} (${cat.percentage}%)\n`;
      }
    } else {
      msg += `_Belum ada transaksi pengeluaran di periode ini._\n`;
    }

    const kb = new InlineKeyboard()
      .text("📁 Unduh Excel/CSV", "act:export")
      .text("🔙 Menu", "act:dashboard");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  });

  // /export
  bot.command("export", async (ctx) => {
    const user = (ctx as any).dbUser;
    const targetMonth = ctx.match.trim() || undefined;

    const csvText = await generateTransactionsCsv(user.id, targetMonth, user.timezone);
    const filename = targetMonth ? `transaksi-${targetMonth}.csv` : "semua-transaksi.csv";

    const buffer = Buffer.from(csvText, "utf-8");
    const inputFile = new InputFile(buffer, filename);

    await ctx.replyWithDocument(inputFile, {
      caption: `📁 **Export Transaksi Selesai!**\nPeriode: ${targetMonth || "Semua Waktu"}\nFile dapat langsung dibuka di Excel atau Google Sheets.`,
      parse_mode: "Markdown",
    });
  });

  // /bantuan
  bot.command("bantuan", async (ctx) => {
    const help =
      `📖 **PANDUAN LENGKAP BOT**\n\n` +
      `💡 **Kamu bisa memakai bot ini 100% menggunakan tombol tanpa harus mengetik teks!**\n\n` +
      `• Klik **🎛️ Dashboard Menu Lengkap** untuk membuka seluruh kontrol tombol.\n` +
      `• **Catat Uang (Klik):** memilih kategori, nominal, dan dompet hanya dengan tap tombol.\n` +
      `• **Pindah Saldo:** transfer antar dompet (Tunai/BCA/GoPay) via tombol.\n` +
      `• **Atur Gaji:** tentukan gaji & uang transport harian via pilihan tombol.\n\n` +
      `_Tentu kamu juga tetap bisa mengetik langsung seperti \`kopi 18rb @gopay\` jika ingin sangat cepat!_`;

    const kb = new InlineKeyboard().text("🎛️ Buka Dashboard Tombol", "act:dashboard");
    await ctx.reply(help, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ===========================================================================
  // MENU BUTTON & NATURAL TEXT HANDLER
  // ===========================================================================

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const user = (ctx as any).dbUser;
    const today = getTodayDate(user.timezone);

    // 1. Dashboard Menu Lengkap
    if (text === "🎛️ Dashboard Menu Lengkap") {
      const dashboardText = await buildDashboardText(user.id, user.timezone);
      await ctx.reply(dashboardText, {
        parse_mode: "Markdown",
        reply_markup: getDashboardKeyboard(),
      });
      return;
    }

    // 2. Tombol "🚗 Berangkat Kerja"
    if (text === "🚗 Berangkat Kerja") {
      const { isUpdate } = await logAttendance(user.id, today, "berangkat");
      const title = isUpdate ? "🔄 Status kehadiran diperbarui!" : "✅ Berhasil absen berangkat kerja!";

      await ctx.reply(
        `${title}\n📅 Tanggal: **${formatDisplayDate(today, user.timezone)}**\nStatus: **🚗 Berangkat Kerja**\n\n` +
          `Apakah ingin sekalian mencatat ongkos/bensin hari ini?`,
        {
          parse_mode: "Markdown",
          reply_markup: getOngkosBerangkatKeyboard(today),
        }
      );
      return;
    }

    // 3. Tombol "🏖️ Tidak Masuk"
    if (text === "🏖️ Tidak Masuk") {
      await ctx.reply(
        `📅 Tanggal: **${formatDisplayDate(today, user.timezone)}**\nPilih keterangan tidak masuk kerja hari ini:`,
        {
          parse_mode: "Markdown",
          reply_markup: getTidakMasukKeyboard(today),
        }
      );
      return;
    }

    // 4. Tombol "💸 Catat Keuangan"
    if (text === "💸 Catat Keuangan") {
      await ctx.reply("💸 **PILIH JENIS TRANSAKSI:**\n\nSilakan pilih apakah ingin mencatat Pengeluaran atau Pemasukan:", {
        reply_markup: getFlowTypeKeyboard(),
      });
      return;
    }

    // 5. Tombol "📊 Laporan Hari Ini"
    if (text === "📊 Laporan Hari Ini") {
      const summary = await getTodaySummary(user.id, user.timezone);
      let msg = `📊 **RINGKASAN HARI INI**\n📅 ${formatDisplayDate(summary.today, user.timezone)}\n\n`;
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
      msg += `💸 **Pengeluaran:** ${formatRupiah(summary.totalExpense)}\n`;
      msg += `💵 **Pemasukan:** ${formatRupiah(summary.totalIncome)}\n\n`;

      if (summary.transactions.length > 0) {
        msg += `📝 **Daftar Transaksi Hari Ini:**\n`;
        summary.transactions.forEach((tx, idx) => {
          const sign = tx.type === "income" ? "+" : "-";
          msg += `${idx + 1}. ${tx.note} (${tx.walletName}): ${sign}${formatRupiah(tx.amount)}\n`;
        });
      } else {
        msg += `_Belum ada transaksi yang dicatat hari ini._`;
      }

      const kb = new InlineKeyboard()
        .text("💸 Catat Pengeluaran", "flow:catat:type:expense")
        .text("🔙 Menu", "act:dashboard");

      await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    // 6. Tombol "💳 Saldo Dompet"
    if (text === "💳 Saldo Dompet") {
      const { wallets, grandTotal } = await getUserBalances(user.id);
      let message = "💳 **SALDO DOMPET & REKENING**\n\n";
      for (const w of wallets) {
        const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : w.type === "ewallet" ? "📱" : "💳";
        message += `${icon} **${w.name}**: ${formatRupiah(w.balance)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━\n💰 **Total Saldo:** ${formatRupiah(grandTotal)}`;

      const kb = new InlineKeyboard()
        .text("🔄 Pindah Saldo", "flow:tr:start")
        .text("🔙 Menu", "act:dashboard");

      await ctx.reply(message, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    // 7. Tombol "💼 Info & Estimasi Gaji"
    if (text === "💼 Info & Estimasi Gaji") {
      const est = await calculateSalaryEstimation(user.id);
      let msg = `💼 **ESTIMASI GAJI PERIODE ${est.periodMonth}**\n\n`;
      msg += `• Tipe Gaji: **${est.payType === "daily" ? "Upah Harian" : "Gaji Bulanan"}**\n`;
      msg += `• Hari Berangkat Kerja: **${est.daysWorked} hari**\n`;
      msg += `• Gaji/Upah Pokok: **${formatRupiah(est.totalBase)}**\n`;

      if (est.allowancePerWorkDay > 0) {
        msg += `• Tunjangan Harian (${formatRupiah(est.allowancePerWorkDay)}/hari): **+${formatRupiah(
          est.totalAllowance
        )}**\n`;
      }

      if (est.totalDeductions > 0) {
        msg += `• Potongan Rutin: **-${formatRupiah(est.totalDeductions)}**\n`;
      }

      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `💰 **Estimasi Gaji Bersih: ${formatRupiah(est.netEstimatedSalary)}**\n\n`;
      msg += `_Catatan: Perhitungan otomatis bertambah tiap kamu absen berangkat._`;

      const kb = new InlineKeyboard()
        .text("⚙️ Atur Nilai Gaji", "flow:setgaji:start")
        .text("🔙 Menu", "act:dashboard");

      await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    // 8. Cek apakah pengguna sedang membalas ForceReply untuk Custom Gaji
    const replyTo = ctx.message.reply_to_message?.text || "";

    if (replyTo.includes("MASUKKAN GAJI POKOK CUSTOM")) {
      const parsed = parseQuickTransaction(`gaji ${text}`);
      const baseAmount = parsed?.amount || 0;
      if (baseAmount <= 0) {
        await ctx.reply(
          "❌ Nominal tidak valid. Silakan coba lagi, contoh: `4.5jt` atau `4500000` (atau `175rb harian`).",
          { parse_mode: "Markdown" }
        );
        return;
      }
      const isDaily = text.toLowerCase().includes("harian") || text.toLowerCase().includes("hari");
      const payType = isDaily ? "daily" : "monthly";

      await ctx.reply(
        `✅ Gaji Pokok tersetting: **${formatRupiah(baseAmount)}** (${isDaily ? "Upah Harian" : "Gaji Bulanan"})\n\n` +
          `Langkah 2/3: Pilih atau masukkan uang makan/transport per hari berangkat:`,
        {
          parse_mode: "Markdown",
          reply_markup: getSetGajiAllowanceKeyboard(baseAmount, payType),
        }
      );
      return;
    }

    if (replyTo.includes("MASUKKAN TUNJANGAN HARIAN CUSTOM")) {
      const match = replyTo.match(/\[(\d+):([a-z]+)\]/);
      const baseAmount = match ? parseInt(match[1] || "0", 10) : 0;
      const payType = match ? match[2] || "monthly" : "monthly";

      let allowance = 0;
      if (text !== "0") {
        const parsed = parseQuickTransaction(`tunjangan ${text}`);
        allowance = parsed?.amount || 0;
      }

      await ctx.reply(
        `✅ Tunjangan: **${formatRupiah(allowance)} / hari**\n\n` +
          `Langkah 3/3: Pilih tanggal penerimaan gaji:`,
        {
          parse_mode: "Markdown",
          reply_markup: getSetGajiPaydayKeyboard(baseAmount, payType, allowance),
        }
      );
      return;
    }

    if (replyTo.includes("MASUKKAN TANGGAL GAJIAN CUSTOM")) {
      const match = replyTo.match(/\[(\d+):([a-z]+):(\d+)\]/);
      const baseAmount = match ? parseInt(match[1] || "0", 10) : 0;
      const payType = (match ? match[2] || "monthly" : "monthly") as "monthly" | "daily";
      const allowance = match ? parseInt(match[3] || "0", 10) : 0;

      let payDay = parseInt(text.replace(/\D/g, ""), 10);
      if (isNaN(payDay) || payDay < 1 || payDay > 31) {
        payDay = 25;
      }

      await updateSalaryProfile(user.id, {
        payType,
        baseAmount,
        allowancePerWorkDay: allowance,
        payDay,
      });

      const kb = new InlineKeyboard()
        .text("💼 Cek Estimasi Gaji", "act:gaji")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.reply(
        `✅ **Profil Gaji Custom Berhasil Disimpan!**\n\n` +
          `• Tipe: **${payType === "daily" ? "Upah Harian" : "Gaji Bulanan"}**\n` +
          `• Pokok: **${formatRupiah(baseAmount)}**\n` +
          `• Tunjangan Hari Berangkat: **${formatRupiah(allowance)}/hari**\n` +
          `• Tanggal Gajian: **Tiap tanggal ${payDay}**\n\n` +
          `_Sekarang estimasi gajimu akan bertambah otomatis tiap kamu tap tombol Berangkat!_`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (replyTo.includes("MASUKKAN ANGGARAN CUSTOM")) {
      const match = replyTo.match(/\[(\d+)\]/);
      const catId = match ? parseInt(match[1] || "0", 10) : 0;
      const parsed = parseQuickTransaction(`anggaran ${text}`);
      const amount = parsed?.amount || 0;

      if (amount <= 0 || !catId) {
        await ctx.reply("❌ Nominal anggaran tidak valid. Silakan coba lagi, contoh: `1.5jt` atau `1500000`.");
        return;
      }

      const currentMonth = getCurrentMonthPeriod(user.timezone);
      await setCategoryBudget(user.id, catId, amount, currentMonth);

      const [cat] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);

      const kb = new InlineKeyboard()
        .text("🎯 Cek Status Anggaran", "act:budget")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.reply(
        `✅ **Anggaran Bulanan Berhasil Disimpan!**\n\n` +
          `📂 Kategori: ${cat?.emoji || "📁"} **${cat?.name || "Kategori"}**\n` +
          `🎯 Batas Anggaran: **${formatRupiah(amount)} / bulan**\n\n` +
          `_Bot akan otomatis memberi peringatan jika pengeluaran kategori ini sudah mendekati atau melebihi batas._`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    // 9. Coba parse sebagai input transaksi cepat (jika user tetap ingin mengetik)
    const parsed = parseQuickTransaction(text);
    if (parsed) {
      const result = await createQuickTransaction(user.id, parsed, user.defaultWalletId);
      const isIncome = parsed.type === "income";
      const icon = isIncome ? "💰 Pemasukan Tercatat!" : "✅ Pengeluaran Tercatat!";

      let response =
        `${icon}\n\n` +
        `📝 **Catatan:** ${parsed.note}\n` +
        `💵 **Nominal:** ${formatRupiah(parsed.amount)}\n` +
        `📂 **Kategori:** ${result.categoryName}\n` +
        `💳 **Dompet:** ${result.walletName}`;

      // Cek peringatan anggaran jika tipe pengeluaran
      if (result.transaction.categoryId && parsed.type === "expense") {
        const alert = await checkBudgetAlert(
          user.id,
          result.transaction.categoryId,
          getCurrentMonthPeriod(user.timezone),
          user.timezone
        );
        if (alert) {
          response += `\n\n${alert}`;
        }
      }

      await ctx.reply(response, {
        parse_mode: "Markdown",
        reply_markup: getTransactionActionKeyboard(result.transaction.id),
      });
      return;
    }

    // Jika pesan bebas lainnya
    const kb = new InlineKeyboard().text("🎛️ Buka Menu Tombol", "act:dashboard");
    await ctx.reply(
      `Silakan gunakan menu tombol di bawah agar tidak perlu mengetik teks:`,
      { reply_markup: kb }
    );
  });

  // ===========================================================================
  // CALLBACK QUERY HANDLERS (Interaksi Tombol Inline)
  // ===========================================================================

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = (ctx as any).dbUser;
    const today = getTodayDate(user.timezone);

    // -------------------------------------------------------------------------
    // A. NAVIGASI DASHBOARD & UTAMA
    // -------------------------------------------------------------------------

    if (data === "act:dashboard") {
      await ctx.answerCallbackQuery();
      const text = await buildDashboardText(user.id, user.timezone);
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: getDashboardKeyboard(),
      });
      return;
    }

    if (data === "act:berangkat") {
      const { isUpdate } = await logAttendance(user.id, today, "berangkat");
      const title = isUpdate ? "🔄 Status kehadiran diperbarui!" : "✅ Berhasil absen berangkat kerja!";

      await ctx.answerCallbackQuery({ text: "Absen Berangkat Tercatat!" });
      await ctx.editMessageText(
        `${title}\n📅 Tanggal: **${formatDisplayDate(today, user.timezone)}**\nStatus: **🚗 Berangkat Kerja**\n\n` +
          `Apakah ingin sekalian mencatat ongkos/bensin hari ini?`,
        {
          parse_mode: "Markdown",
          reply_markup: getOngkosBerangkatKeyboard(today),
        }
      );
      return;
    }

    if (data === "act:tidak_masuk") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `📅 Tanggal: **${formatDisplayDate(today, user.timezone)}**\nPilih keterangan tidak masuk kerja hari ini:`,
        {
          parse_mode: "Markdown",
          reply_markup: getTidakMasukKeyboard(today),
        }
      );
      return;
    }

    if (data === "act:saldo") {
      await ctx.answerCallbackQuery();
      const { wallets, grandTotal } = await getUserBalances(user.id);
      let message = "💳 **SALDO DOMPET & REKENING**\n\n";
      for (const w of wallets) {
        const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : w.type === "ewallet" ? "📱" : "💳";
        message += `${icon} **${w.name}**: ${formatRupiah(w.balance)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━\n💰 **Total Saldo:** ${formatRupiah(grandTotal)}`;

      const kb = new InlineKeyboard()
        .text("🔄 Pindah Saldo", "flow:tr:start")
        .text("🔙 Menu", "act:dashboard");

      await ctx.editMessageText(message, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "act:gaji") {
      await ctx.answerCallbackQuery();
      const est = await calculateSalaryEstimation(user.id);
      let msg = `💼 **ESTIMASI GAJI PERIODE ${est.periodMonth}**\n\n`;
      msg += `• Tipe Gaji: **${est.payType === "daily" ? "Upah Harian" : "Gaji Bulanan"}**\n`;
      msg += `• Hari Berangkat Kerja: **${est.daysWorked} hari**\n`;
      msg += `• Gaji/Upah Pokok: **${formatRupiah(est.totalBase)}**\n`;

      if (est.allowancePerWorkDay > 0) {
        msg += `• Tunjangan Harian (${formatRupiah(est.allowancePerWorkDay)}/hari): **+${formatRupiah(
          est.totalAllowance
        )}**\n`;
      }

      if (est.totalDeductions > 0) {
        msg += `• Potongan Rutin: **-${formatRupiah(est.totalDeductions)}**\n`;
      }

      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `💰 **Estimasi Gaji Bersih: ${formatRupiah(est.netEstimatedSalary)}**\n\n`;
      msg += `_Catatan: Perhitungan otomatis bertambah tiap kamu absen berangkat._`;

      const kb = new InlineKeyboard()
        .text("⚙️ Atur Nilai Gaji", "flow:setgaji:start")
        .text("🔙 Menu", "act:dashboard");

      await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "act:laporan") {
      await ctx.answerCallbackQuery();
      const targetMonth = getCurrentMonthPeriod(user.timezone);
      const report = await getMonthlyCategoryReport(user.id, targetMonth, user.timezone);

      let msg = `📊 **LAPORAN KEUANGAN PERIODE ${report.periodMonth}**\n\n`;
      msg += `💵 **Total Pemasukan:** ${formatRupiah(report.totalIncome)}\n`;
      msg += `💸 **Total Pengeluaran:** ${formatRupiah(report.totalExpense)}\n`;

      const netIcon = report.netSavings >= 0 ? "📈" : "📉";
      msg += `${netIcon} **Sisa Bersih:** ${formatRupiah(report.netSavings)}\n`;
      msg += `📝 **Total Transaksi:** ${report.transactionCount}\n\n`;

      if (report.categories.length > 0) {
        msg += `📂 **Rincian Pengeluaran per Kategori:**\n`;
        for (const cat of report.categories) {
          msg += `• ${cat.emoji} **${cat.name}**: ${formatRupiah(cat.amount)} (${cat.percentage}%)\n`;
        }
      } else {
        msg += `_Belum ada transaksi pengeluaran di periode ini._\n`;
      }

      const kb = new InlineKeyboard()
        .text("📁 Unduh Excel/CSV", "act:export")
        .text("🔙 Menu", "act:dashboard");

      await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    if (data === "act:export") {
      await ctx.answerCallbackQuery({ text: "Menyiapkan file CSV..." });
      const currentMonth = getCurrentMonthPeriod(user.timezone);
      const csvText = await generateTransactionsCsv(user.id, currentMonth, user.timezone);
      const filename = `transaksi-${currentMonth}.csv`;

      const buffer = Buffer.from(csvText, "utf-8");
      const inputFile = new InputFile(buffer, filename);

      await ctx.replyWithDocument(inputFile, {
        caption: `📁 **Export Transaksi Selesai!**\nPeriode: ${currentMonth}\nFile dapat langsung dibuka di Excel atau Google Sheets.`,
        parse_mode: "Markdown",
      });
      return;
    }

    if (data === "act:budget") {
      await ctx.answerCallbackQuery();
      const currentMonth = getCurrentMonthPeriod(user.timezone);
      const summary = await getBudgetSummary(user.id, currentMonth, user.timezone);

      let msg = `🎯 **STATUS ANGGARAN BULAN INI (${currentMonth})**\n\n`;
      if (summary.budgets.length === 0) {
        msg +=
          `_Belum ada anggaran kategori yang diatur._\n\n` +
          `💡 Klik tombol di bawah untuk menentukan batas pengeluaran bulanan (misal Makan & Minum: Rp1.5jt).`;
      } else {
        for (const b of summary.budgets) {
          const barLength = 8;
          const filled = Math.min(barLength, Math.round((b.percentage / 100) * barLength));
          const empty = barLength - filled;
          const bar = "█".repeat(filled) + "░".repeat(empty);

          const statusIcon = b.isOverBudget ? "🚨" : b.percentage >= 80 ? "⚠️" : "✅";
          msg +=
            `${b.emoji} **${b.name}**\n` +
            `[${bar}] ${b.percentage}%\n` +
            `💸 Terpakai: ${formatRupiah(b.spent)} / ${formatRupiah(b.budget)}\n` +
            `${statusIcon} Sisa: ${formatRupiah(b.remaining)}\n\n`;
        }
      }

      const kb = new InlineKeyboard()
        .text("🎯 Atur / Ubah Anggaran", "flow:bg:start")
        .text("🔙 Menu", "act:dashboard");

      await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: kb });
      return;
    }

    // -------------------------------------------------------------------------
    // B. WIZARD CATAT UANG TANPA MENGETIK (flow:catat:*)
    // -------------------------------------------------------------------------

    // Step 1: Mulai -> Pilih Tipe
    if (data === "flow:catat:start") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("💸 **CATAT UANG VIA TOMBOL**\n\nLangkah 1/4: Pilih tipe transaksi:", {
        reply_markup: getFlowTypeKeyboard(),
      });
      return;
    }

    // Step 2: Pilih Kategori
    if (data.startsWith("flow:catat:type:")) {
      await ctx.answerCallbackQuery();
      const type = data.replace("flow:catat:type:", "") as "expense" | "income";

      const userCats = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.userId, user.id),
            eq(categories.kind, type),
            eq(categories.isArchived, false)
          )
        );

      await ctx.editMessageText(
        `Langkah 2/4: Pilih Kategori ${type === "expense" ? "Pengeluaran" : "Pemasukan"}:`,
        {
          reply_markup: getFlowCategoryKeyboard(type, userCats),
        }
      );
      return;
    }

    // Step 3: Pilih Nominal Cepat
    if (data.startsWith("flow:catat:cat:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const type = parts[3] || "expense";
      const catId = parseInt(parts[4] || "0", 10);

      const [cat] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);

      await ctx.editMessageText(
        `Langkah 3/4: Pilih Nominal untuk ${cat?.emoji || "📁"} **${cat?.name || "Kategori"}**:`,
        {
          parse_mode: "Markdown",
          reply_markup: getFlowAmountKeyboard(type, catId),
        }
      );
      return;
    }

    // Step 4: Pilih Dompet
    if (data.startsWith("flow:catat:amt:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const type = parts[3] || "expense";
      const catId = parseInt(parts[4] || "0", 10);
      const amount = parseInt(parts[5] || "0", 10);

      const userWallets = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), eq(wallets.isArchived, false)));

      await ctx.editMessageText(
        `Langkah 4/4: Simpan nominal **${formatRupiah(amount)}** ke dompet/rekening mana?`,
        {
          parse_mode: "Markdown",
          reply_markup: getFlowWalletKeyboard(type, catId, amount, userWallets),
        }
      );
      return;
    }

    // Step 5: Eksekusi Simpan Transaksi
    if (data.startsWith("flow:catat:save:")) {
      const parts = data.split(":");
      const type = parts[3] as "expense" | "income";
      const catId = parseInt(parts[4] || "0", 10);
      const amount = parseInt(parts[5] || "0", 10);
      const walletId = parseInt(parts[6] || "0", 10);

      const [cat] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);
      const [w] = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);

      const [created] = await db
        .insert(transactions)
        .values({
          userId: user.id,
          walletId,
          categoryId: catId,
          type,
          amount,
          note: `${cat?.name || "Catatan"} via Tombol`,
          source: "chat",
        })
        .returning();

      await ctx.answerCallbackQuery({ text: "Transaksi Berhasil Dicatat!" });

      const isIncome = type === "income";
      const icon = isIncome ? "💰 Pemasukan Tercatat!" : "✅ Pengeluaran Tercatat!";

      const kb = new InlineKeyboard()
        .text("🗑️ Hapus (Undo)", `tx:delete:${created?.id}`)
        .row()
        .text("💸 Catat Lagi", "flow:catat:start")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.editMessageText(
        `${icon}\n\n` +
          `💵 **Nominal:** ${formatRupiah(amount)}\n` +
          `📂 **Kategori:** ${cat?.emoji || "📁"} ${cat?.name || "-"}\n` +
          `💳 **Dompet:** ${w?.name || "-"}\n\n` +
          `_Tercatat 100% menggunakan tombol tanpa mengetik!_`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    // -------------------------------------------------------------------------
    // C. WIZARD TRANSFER SALDO (flow:tr:*)
    // -------------------------------------------------------------------------

    if (data === "flow:tr:start") {
      await ctx.answerCallbackQuery();
      const userWallets = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), eq(wallets.isArchived, false)));

      await ctx.editMessageText("🔄 **PINDAH / TRANSFER SALDO**\n\nLangkah 1/3: Pilih dompet asal (sumber dana):", {
        reply_markup: getTransferFromKeyboard(userWallets),
      });
      return;
    }

    if (data.startsWith("flow:tr:from:")) {
      await ctx.answerCallbackQuery();
      const fromId = parseInt(data.replace("flow:tr:from:", ""), 10);
      const userWallets = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, user.id), eq(wallets.isArchived, false)));

      await ctx.editMessageText("Langkah 2/3: Pilih dompet tujuan penerima saldo:", {
        reply_markup: getTransferToKeyboard(fromId, userWallets),
      });
      return;
    }

    if (data.startsWith("flow:tr:to:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const fromId = parseInt(parts[3] || "0", 10);
      const toId = parseInt(parts[4] || "0", 10);

      await ctx.editMessageText("Langkah 3/3: Pilih nominal yang ingin dipindahkan:", {
        reply_markup: getTransferAmountKeyboard(fromId, toId),
      });
      return;
    }

    if (data.startsWith("flow:tr:exec:")) {
      const parts = data.split(":");
      const fromId = parseInt(parts[3] || "0", 10);
      const toId = parseInt(parts[4] || "0", 10);
      const amount = parseInt(parts[5] || "0", 10);

      const [fromW] = await db.select().from(wallets).where(eq(wallets.id, fromId)).limit(1);
      const [toW] = await db.select().from(wallets).where(eq(wallets.id, toId)).limit(1);

      await db.insert(transactions).values({
        userId: user.id,
        walletId: fromId,
        toWalletId: toId,
        type: "transfer",
        amount,
        note: `Transfer ${fromW?.name} -> ${toW?.name}`,
        source: "transfer",
      });

      await ctx.answerCallbackQuery({ text: "Transfer Berhasil!" });

      const kb = new InlineKeyboard()
        .text("💳 Cek Saldo", "act:saldo")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.editMessageText(
        `✅ **Transfer Saldo Berhasil!**\n\n` +
          `💵 **Nominal:** ${formatRupiah(amount)}\n` +
          `📤 **Dari:** ${fromW?.name}\n` +
          `📥 **Ke:** ${toW?.name}\n\n` +
          `_Saldo antar dompet telah diperbarui._`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    // -------------------------------------------------------------------------
    // D. WIZARD ATUR GAJI (flow:sg:*)
    // -------------------------------------------------------------------------

    if (data === "flow:setgaji:start") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "⚙️ **PENGATURAN GAJI VIA TOMBOL**\n\nLangkah 1/3: Pilih gaji pokok bulanan atau upah harianmu:",
        { reply_markup: getSetGajiBaseKeyboard() }
      );
      return;
    }

    if (data.startsWith("flow:sg:base:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const baseAmount = parseInt(parts[3] || "0", 10);
      const payType = parts[4] || "monthly";

      await ctx.editMessageText(
        `Gaji Pokok: **${formatRupiah(baseAmount)}** (${payType === "daily" ? "Harian" : "Bulanan"})\n\n` +
          `Langkah 2/3: Pilih tunjangan uang makan/transport per hari berangkat:`,
        {
          parse_mode: "Markdown",
          reply_markup: getSetGajiAllowanceKeyboard(baseAmount, payType),
        }
      );
      return;
    }

    if (data.startsWith("flow:sg:alw:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const baseAmount = parseInt(parts[3] || "0", 10);
      const payType = parts[4] || "monthly";
      const allowance = parseInt(parts[5] || "0", 10);

      await ctx.editMessageText(
        `Pokok: **${formatRupiah(baseAmount)}**\nTunjangan: **${formatRupiah(allowance)}/hari**\n\n` +
          `Langkah 3/3: Pilih tanggal penerimaan gaji:`,
        {
          parse_mode: "Markdown",
          reply_markup: getSetGajiPaydayKeyboard(baseAmount, payType, allowance),
        }
      );
      return;
    }

    if (data === "flow:sg:custom:base") {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `✏️ **MASUKKAN GAJI POKOK CUSTOM**\n\n` +
          `Silakan balas (reply) pesan ini dengan nominal gaji pokok kamu.\n\n` +
          `Contoh:\n` +
          `• \`4.750.000\` atau \`4.8jt\` (Gaji Bulanan)\n` +
          `• \`175rb harian\` atau \`180.000 harian\` (Upah Harian)`,
        {
          parse_mode: "Markdown",
          reply_markup: { force_reply: true, selective: true },
        }
      );
      return;
    }

    if (data.startsWith("flow:sg:custom:alw:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const baseAmount = parts[4] || "0";
      const payType = parts[5] || "monthly";

      await ctx.reply(
        `✏️ **MASUKKAN TUNJANGAN HARIAN CUSTOM** [${baseAmount}:${payType}]\n\n` +
          `Silakan balas pesan ini dengan nominal uang makan/transport per hari berangkat kerja.\n\n` +
          `Contoh:\n` +
          `• \`35.000\` atau \`35rb\`\n` +
          `• Ketik \`0\` jika tidak ada uang makan/transport harian`,
        {
          parse_mode: "Markdown",
          reply_markup: { force_reply: true, selective: true },
        }
      );
      return;
    }

    if (data.startsWith("flow:sg:custom:day:")) {
      await ctx.answerCallbackQuery();
      const parts = data.split(":");
      const baseAmount = parts[4] || "0";
      const payType = parts[5] || "monthly";
      const allowance = parts[6] || "0";

      await ctx.reply(
        `✏️ **MASUKKAN TANGGAL GAJIAN CUSTOM** [${baseAmount}:${payType}:${allowance}]\n\n` +
          `Silakan balas pesan ini dengan tanggal penerimaan gaji (angka 1 s/d 31).\n\n` +
          `Contoh: \`27\` atau \`15\``,
        {
          parse_mode: "Markdown",
          reply_markup: { force_reply: true, selective: true },
        }
      );
      return;
    }

    if (data.startsWith("flow:sg:save:")) {
      const parts = data.split(":");
      const baseAmount = parseInt(parts[3] || "0", 10);
      const payType = parts[4] as "monthly" | "daily";
      const allowance = parseInt(parts[5] || "0", 10);
      const payDay = parseInt(parts[6] || "25", 10);

      await updateSalaryProfile(user.id, {
        payType,
        baseAmount,
        allowancePerWorkDay: allowance,
        payDay,
      });

      await ctx.answerCallbackQuery({ text: "Profil Gaji Disimpan!" });

      const kb = new InlineKeyboard()
        .text("💼 Cek Estimasi Gaji", "act:gaji")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.editMessageText(
        `✅ **Profil Gaji Berhasil Disimpan!**\n\n` +
          `• Tipe: **${payType === "daily" ? "Upah Harian" : "Gaji Bulanan"}**\n` +
          `• Pokok: **${formatRupiah(baseAmount)}**\n` +
          `• Tunjangan Hari Berangkat: **${formatRupiah(allowance)}/hari**\n` +
          `• Tanggal Gajian: **Tiap tanggal ${payDay}**\n\n` +
          `_Sekarang estimasi gajimu akan bertambah otomatis tiap kamu tap tombol Berangkat!_`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    // -------------------------------------------------------------------------
    // E. WIZARD ATUR ANGGARAN (flow:bg:*)
    // -------------------------------------------------------------------------

    if (data === "flow:bg:start") {
      await ctx.answerCallbackQuery();
      const expenseCats = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.userId, user.id),
            eq(categories.kind, "expense"),
            eq(categories.isArchived, false)
          )
        );

      await ctx.editMessageText(
        "🎯 **PILIH KATEGORI ANGGARAN:**\n\nPilih kategori yang ingin kamu beri batas pengeluaran bulanan:",
        { reply_markup: getBudgetCategoryKeyboard(expenseCats) }
      );
      return;
    }

    if (data.startsWith("flow:bg:cat:")) {
      await ctx.answerCallbackQuery();
      const catId = parseInt(data.replace("flow:bg:cat:", ""), 10);
      const [cat] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);

      await ctx.editMessageText(
        `Pilih batas anggaran bulanan untuk ${cat?.emoji || "📁"} **${cat?.name || "Kategori"}**:`,
        {
          parse_mode: "Markdown",
          reply_markup: getBudgetAmountKeyboard(catId),
        }
      );
      return;
    }

    if (data.startsWith("flow:bg:save:")) {
      const parts = data.split(":");
      const catId = parseInt(parts[3] || "0", 10);
      const amount = parseInt(parts[4] || "0", 10);

      const currentMonth = getCurrentMonthPeriod(user.timezone);
      await setCategoryBudget(user.id, catId, amount, currentMonth);

      const [cat] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);
      await ctx.answerCallbackQuery({ text: "Anggaran Disimpan!" });

      const kb = new InlineKeyboard()
        .text("🎯 Cek Status Anggaran", "act:budget")
        .text("🎛️ Menu Utama", "act:dashboard");

      await ctx.editMessageText(
        `✅ **Anggaran Bulanan Berhasil Disimpan!**\n\n` +
          `📂 Kategori: ${cat?.emoji || "📁"} **${cat?.name}**\n` +
          `🎯 Batas Anggaran: **${formatRupiah(amount)} / bulan**\n\n` +
          `_Bot akan otomatis memberi peringatan jika pengeluaran kategori ini sudah mendekati atau melebihi batas._`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (data.startsWith("flow:bg:custom:")) {
      await ctx.answerCallbackQuery();
      const catId = data.replace("flow:bg:custom:", "");
      await ctx.reply(
        `✏️ **MASUKKAN ANGGARAN CUSTOM** [${catId}]\n\n` +
          `Silakan balas (reply) pesan ini dengan batas nominal anggaran bulanan untuk kategori ini.\n\n` +
          `Contoh: \`1.5jt\` atau \`1500000\` atau \`750rb\``,
        {
          parse_mode: "Markdown",
          reply_markup: { force_reply: true, selective: true },
        }
      );
      return;
    }

    // -------------------------------------------------------------------------
    // F. ABSEN TIDAK MASUK, ONGKOS, & UNDO
    // -------------------------------------------------------------------------

    if (data.startsWith("absen:")) {
      const parts = data.split(":");
      const workDate = parts[1];
      const status = parts[2] as "libur" | "izin" | "sakit" | "cuti";

      if (workDate && status) {
        await logAttendance(user.id, workDate, status);
        await ctx.answerCallbackQuery({ text: `Status dicatat: ${status.toUpperCase()}` });

        const statusLabel =
          status === "libur"
            ? "🏖️ Libur Rutin"
            : status === "izin"
            ? "📝 Izin"
            : status === "sakit"
            ? "🤒 Sakit"
            : "✈️ Cuti";

        const kb = new InlineKeyboard().text("🎛️ Menu Utama", "act:dashboard");

        await ctx.editMessageText(
          `✅ **Status Kehadiran Tercatat!**\n📅 Tanggal: **${formatDisplayDate(
            workDate,
            user.timezone
          )}**\nStatus: **${statusLabel}**`,
          { parse_mode: "Markdown", reply_markup: kb }
        );
      }
      return;
    }

    if (data.startsWith("ongkos:")) {
      const parts = data.split(":");
      if (parts[1] === "skip") {
        await ctx.answerCallbackQuery({ text: "Ongkos dilewati" });
        const kb = new InlineKeyboard().text("🎛️ Menu Utama", "act:dashboard");
        await ctx.editMessageText("✅ **Absen Berangkat Tercatat (Tanpa Ongkos)!**", {
          reply_markup: kb,
        });
        return;
      }

      const workDate = parts[1];
      const amount = parseInt(parts[2] || "0", 10);

      if (workDate && amount > 0) {
        await logTransportCost(user.id, workDate, amount, user.defaultWalletId);
        await ctx.answerCallbackQuery({ text: `Ongkos ${formatRupiah(amount)} dicatat!` });

        const kb = new InlineKeyboard().text("🎛️ Menu Utama", "act:dashboard");

        await ctx.editMessageText(
          `✅ **Absen & Ongkos Berangkat Tercatat!**\n📅 Tanggal: **${formatDisplayDate(
            workDate,
            user.timezone
          )}**\nStatus: **🚗 Berangkat Kerja**\n🛵 Biaya Ongkos: **${formatRupiah(
            amount
          )}** (Kategori Transportasi)`,
          { parse_mode: "Markdown", reply_markup: kb }
        );
      }
      return;
    }

    if (data.startsWith("tx:delete:")) {
      const txId = parseInt(data.replace("tx:delete:", ""), 10);
      if (txId) {
        const deleted = await deleteTransaction(txId, user.id);
        if (deleted) {
          await ctx.answerCallbackQuery({ text: "Transaksi telah dihapus." });
          const kb = new InlineKeyboard().text("🎛️ Menu Utama", "act:dashboard");
          await ctx.editMessageText(`🗑️ **Transaksi telah dihapus (Undo berhasil).**`, {
            parse_mode: "Markdown",
            reply_markup: kb,
          });
        } else {
          await ctx.answerCallbackQuery({ text: "Transaksi tidak ditemukan / sudah dihapus." });
        }
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Global Error Handler
  bot.catch((err) => {
    console.error("Error pada bot:", err);
  });

  return bot;
}
