import { Bot, InputFile } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { limit } from "@grammyjs/ratelimiter";
import { env, isUserAllowed } from "../config/env.js";
import { getOrCreateUser } from "./modules/user.js";
import {
  getMainMenuKeyboard,
  getTidakMasukKeyboard,
  getOngkosBerangkatKeyboard,
  getTransactionActionKeyboard,
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
import { parseQuickTransaction, formatRupiah } from "../lib/money-parser.js";
import { getTodayDate, formatDisplayDate, getCurrentMonthPeriod } from "../lib/date.js";

export function createBot() {
  const bot = new Bot(env.BOT_TOKEN);

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

    // Ambil atau buat akun user di database
    try {
      const user = await getOrCreateUser(ctx.from);
      // Simpan user di ctx state
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
    const welcome =
      `👋 **Halo, ${user.firstName}!**\n\n` +
      `Selamat datang di **Daily Bot** — asisten pribadimu untuk mencatat **keuangan harian**, **gaji**, dan **absen keberangkatan kerja**.\n\n` +
      `💡 **Cara Cepat Catat Keuangan:**\n` +
      `Ketik langsung di chat, contohnya:\n` +
      `• \`kopi 18rb @gopay\` (pengeluaran)\n` +
      `• \`bensin 25k\` (pengeluaran dompet default)\n` +
      `• \`+gaji 5jt @bca\` (pemasukan)\n\n` +
      `🚗 **Absen Keberangkatan:**\n` +
      `Cukup tap tombol **🚗 Berangkat Kerja** atau **🏖️ Tidak Masuk** di menu bawah.`;

    await ctx.reply(welcome, {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // /menu
  bot.command("menu", async (ctx) => {
    await ctx.reply("Silakan pilih menu di bawah:", {
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // /saldo
  bot.command("saldo", async (ctx) => {
    const user = (ctx as any).dbUser;
    const { wallets, grandTotal } = await getUserBalances(user.id);

    let message = "💳 **SALDO DOMPET & REKENING**\n\n";
    for (const w of wallets) {
      const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : "📱";
      message += `${icon} **${w.name}**: ${formatRupiah(w.balance)}\n`;
    }
    message += `\n━━━━━━━━━━━━━━━\n💰 **Total Saldo:** ${formatRupiah(grandTotal)}`;

    await ctx.reply(message, { parse_mode: "Markdown" });
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

    await ctx.reply(msg, { parse_mode: "Markdown" });
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

    await ctx.reply(msg, { parse_mode: "Markdown" });
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

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /transfer [nominal] [dari] [ke]
  bot.command("transfer", async (ctx) => {
    const user = (ctx as any).dbUser;
    const args = ctx.match.trim().split(/\s+/);

    if (args.length < 3) {
      await ctx.reply(
        `ℹ️ **Format Transfer:**\n\`/transfer <nominal> <dari> <ke>\`\n\n` +
          `Contoh:\n` +
          `• \`/transfer 500rb bca gopay\`\n` +
          `• \`/transfer 100k tunai bca\`\n` +
          `• \`/transfer 25000 bca mandiri\``,
        { parse_mode: "Markdown" }
      );
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
      const res = await transferFunds(
        user.id,
        fromWalletName,
        toWalletName,
        parsed.amount
      );
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

  // /setgaji [pokok] [tunjangan_per_hari] [tgl_gajian]
  bot.command("setgaji", async (ctx) => {
    const user = (ctx as any).dbUser;
    const args = ctx.match.trim().split(/\s+/).filter(Boolean);

    if (args.length === 0) {
      await ctx.reply(
        `ℹ️ **Pengaturan Profil Gaji:**\n` +
          `Gunakan perintah ini untuk mengatur gaji dan tunjangan harian yang terhubung ke absensi.\n\n` +
          `**Format:**\n\`/setgaji <pokok> <tunjangan_hari_berangkat> [tanggal_gajian]\`\n\n` +
          `Contoh:\n` +
          `• \`/setgaji 5jt 25rb 25\` (Gaji 5jt, uang makan 25rb/hari berangkat, gajian tgl 25)\n` +
          `• \`/setgaji 150rb 20rb harian\` (Upah harian 150rb + 20rb/hari)\n\n` +
          `Ketik /gaji untuk melihat estimasi saat ini.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const rawBase = args[0] || "0";
    const rawAllowance = args[1] || "0";
    const rawThird = args[2] || "25";

    const parsedBase = parseQuickTransaction(`gaji ${rawBase}`);
    const parsedAllowance = parseQuickTransaction(`tunjangan ${rawAllowance}`);

    const baseAmount = parsedBase?.amount ?? 0;
    const allowancePerWorkDay = parsedAllowance?.amount ?? 0;

    let isDaily = rawThird.toLowerCase() === "harian" || rawBase.includes("hari");
    let payDay = parseInt(rawThird, 10);
    if (isNaN(payDay) || payDay < 1 || payDay > 31) {
      payDay = 25;
    }

    await updateSalaryProfile(user.id, {
      payType: isDaily ? "daily" : "monthly",
      baseAmount,
      allowancePerWorkDay,
      payDay,
    });

    await ctx.reply(
      `✅ **Profil Gaji Berhasil Disimpan!**\n\n` +
        `• Tipe: **${isDaily ? "Upah Harian" : "Gaji Bulanan"}**\n` +
        `• Pokok: **${formatRupiah(baseAmount)}**\n` +
        `• Tunjangan Hari Berangkat: **${formatRupiah(allowancePerWorkDay)}/hari**\n` +
        `• Tanggal Gajian: **Tiap tanggal ${payDay}**\n\n` +
        `Sekarang estimasi gajimu di /gaji akan otomatis bertambah setiap kali kamu absen berangkat kerja!`,
      { parse_mode: "Markdown" }
    );
  });

  // /laporan [YYYY-MM]
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

    msg += `\n💡 _Ketik \`/export ${targetMonth}\` untuk mengunduh seluruh transaksi dalam format Excel/CSV._`;

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /export [YYYY-MM]
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
      `📖 **PANDUAN PENGGUNAAN BOT**\n\n` +
      `**1. Mencatat Pengeluaran Cepat:**\n` +
      `Cukup ketik nama dan nominal:\n` +
      `• \`kopi 18rb\`\n` +
      `• \`makan siang 35k @gopay\`\n` +
      `• \`bensin 30.000 @bca\`\n\n` +
      `**2. Mencatat Pemasukan:**\n` +
      `Gunakan tanda \`+\` di awal pesan:\n` +
      `• \`+bonus freelance 1.5jt @bca\`\n` +
      `• \`+gaji 6jt\`\n\n` +
      `**3. Absen Keberangkatan (1-Tap):**\n` +
      `• Tap tombol **🚗 Berangkat Kerja** saat mulai berangkat kerja.\n` +
      `• Tap tombol **🏖️ Tidak Masuk** jika hari ini libur, sakit, atau cuti.\n\n` +
      `**4. Perintah Lengkap:**\n` +
      `• /menu - Tampilkan menu utama\n` +
      `• /saldo - Cek saldo semua dompet\n` +
      `• /hariini - Ringkasan keuangan & absen hari ini\n` +
      `• /laporan [YYYY-MM] - Laporan pengeluaran per kategori\n` +
      `• /export [YYYY-MM] - Unduh data transaksi (format CSV/Excel)\n` +
      `• /transfer 500rb bca gopay - Pindah saldo antar dompet\n` +
      `• /setgaji 5jt 25rb 25 - Atur gaji & uang transport per hari\n` +
      `• /gaji - Estimasi gaji periode berjalan\n` +
      `• /rekapabsen - Rekap absensi bulanan`;

    await ctx.reply(help, { parse_mode: "Markdown" });
  });

  // ===========================================================================
  // MENU BUTTON & NATURAL TEXT HANDLER
  // ===========================================================================

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const user = (ctx as any).dbUser;
    const today = getTodayDate(user.timezone);

    // 1. Handle tombol "🚗 Berangkat Kerja"
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

    // 2. Handle tombol "🏖️ Tidak Masuk"
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

    // 3. Handle tombol pintasan menu lainnya
    if (text === "💸 Catat Pengeluaran") {
      await ctx.reply(
        `Silakan ketik langsung catatan pengeluaran Anda.\n\nContoh:\n• \`makan siang 25rb\`\n• \`kopi 18k @gopay\`\n• \`bensin 30.000\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (text === "📊 Laporan Hari Ini") {
      // Panggil handler /hariini
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
      await ctx.reply(msg, { parse_mode: "Markdown" });
      return;
    }

    if (text === "💳 Saldo Dompet") {
      const { wallets, grandTotal } = await getUserBalances(user.id);
      let message = "💳 **SALDO DOMPET & REKENING**\n\n";
      for (const w of wallets) {
        const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : "📱";
        message += `${icon} **${w.name}**: ${formatRupiah(w.balance)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━\n💰 **Total Saldo:** ${formatRupiah(grandTotal)}`;
      await ctx.reply(message, { parse_mode: "Markdown" });
      return;
    }

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
      await ctx.reply(msg, { parse_mode: "Markdown" });
      return;
    }

    // 4. Coba parse sebagai input transaksi cepat
    const parsed = parseQuickTransaction(text);
    if (parsed) {
      const result = await createQuickTransaction(user.id, parsed, user.defaultWalletId);
      const isIncome = parsed.type === "income";
      const icon = isIncome ? "💰 Pemasukan Tercatat!" : "✅ Pengeluaran Tercatat!";

      const response =
        `${icon}\n\n` +
        `📝 **Catatan:** ${parsed.note}\n` +
        `💵 **Nominal:** ${formatRupiah(parsed.amount)}\n` +
        `📂 **Kategori:** ${result.categoryName}\n` +
        `💳 **Dompet:** ${result.walletName}`;

      await ctx.reply(response, {
        parse_mode: "Markdown",
        reply_markup: getTransactionActionKeyboard(result.transaction.id),
      });
      return;
    }

    // Jika pesan tidak dikenali
    await ctx.reply(
      `Maaf, saya belum mengerti pesan tersebut.\n\n` +
        `• Untuk mencatat keuangan, ketik contoh: \`kopi 18rb @gopay\` atau \`+gaji 5jt\`\n` +
        `• Atau gunakan tombol menu di bawah untuk absensi dan saldo.`,
      { reply_markup: getMainMenuKeyboard() }
    );
  });

  // ===========================================================================
  // CALLBACK QUERY HANDLERS (Inline Buttons)
  // ===========================================================================

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = (ctx as any).dbUser;

    // 1. Aksi Absen Tidak Masuk: absen:<date>:<status>
    if (data.startsWith("absen:")) {
      const parts = data.split(":");
      if (parts[1] === "cancel") {
        await ctx.answerCallbackQuery({ text: "Dibatalkan" });
        await ctx.editMessageText("Pencatatan dibatalkan.");
        return;
      }

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

        await ctx.editMessageText(
          `✅ **Status Kehadiran Tercatat!**\n📅 Tanggal: **${formatDisplayDate(
            workDate,
            user.timezone
          )}**\nStatus: **${statusLabel}**`,
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    // 2. Aksi Catat Ongkos Berangkat: ongkos:<date>:<amount>
    if (data.startsWith("ongkos:")) {
      const parts = data.split(":");
      if (parts[1] === "skip") {
        await ctx.answerCallbackQuery({ text: "Ongkos dilewati" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        return;
      }

      const workDate = parts[1];
      const amount = parseInt(parts[2] || "0", 10);

      if (workDate && amount > 0) {
        await logTransportCost(user.id, workDate, amount, user.defaultWalletId);
        await ctx.answerCallbackQuery({ text: `Ongkos ${formatRupiah(amount)} dicatat!` });
        await ctx.editMessageText(
          `✅ **Absen & Ongkos Berangkat Tercatat!**\n📅 Tanggal: **${formatDisplayDate(
            workDate,
            user.timezone
          )}**\nStatus: **🚗 Berangkat Kerja**\n🛵 Biaya Ongkos: **${formatRupiah(amount)}** (Msk kategori Transportasi)`,
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    // 3. Aksi Hapus / Undo Transaksi: tx:delete:<id>
    if (data.startsWith("tx:delete:")) {
      const txId = parseInt(data.replace("tx:delete:", ""), 10);
      if (txId) {
        const deleted = await deleteTransaction(txId, user.id);
        if (deleted) {
          await ctx.answerCallbackQuery({ text: "Transaksi telah dihapus." });
          await ctx.editMessageText(`🗑️ **Transaksi telah dihapus (Undo berhasil).**`, {
            parse_mode: "Markdown",
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

