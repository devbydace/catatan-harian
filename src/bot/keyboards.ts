import { Keyboard, InlineKeyboard } from "grammy";

/**
 * Menu keyboard utama yang selalu tampil di bagian bawah chat pengguna (Reply Keyboard)
 */
export function getMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🚗 Berangkat Kerja")
    .text("🏖️ Tidak Masuk")
    .row()
    .text("💸 Catat Keuangan")
    .text("📊 Laporan Hari Ini")
    .row()
    .text("💳 Saldo Dompet")
    .text("💼 Info & Estimasi Gaji")
    .row()
    .text("🎛️ Dashboard Menu Lengkap")
    .resized()
    .persistent();
}

/**
 * Dashboard Menu Utama dengan Tombol Inline (Semua fitur bisa diakses via tap)
 */
export function getDashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚗 Berangkat Kerja", "act:berangkat")
    .text("🏖️ Tidak Masuk", "act:tidak_masuk")
    .row()
    .text("💸 Catat Uang (Klik)", "flow:catat:start")
    .text("🔄 Pindah Saldo", "flow:tr:start")
    .row()
    .text("💳 Cek Saldo", "act:saldo")
    .text("💼 Info & Estimasi Gaji", "act:gaji")
    .row()
    .text("📊 Laporan Bulan Ini", "act:laporan")
    .text("📁 Unduh Excel/CSV", "act:export")
    .row()
    .text("⚙️ Atur Gaji & Tunjangan", "flow:setgaji:start")
    .text("🔄 Refresh", "act:dashboard");
}

/**
 * Inline keyboard untuk memilih alasan tidak masuk kerja
 */
export function getTidakMasukKeyboard(workDate: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🏖️ Libur Rutin", `absen:${workDate}:libur`)
    .text("📝 Izin", `absen:${workDate}:izin`)
    .row()
    .text("🤒 Sakit", `absen:${workDate}:sakit`)
    .text("✈️ Cuti", `absen:${workDate}:cuti`)
    .row()
    .text("🔙 Kembali ke Menu", "act:dashboard");
}

/**
 * Inline keyboard konfirmasi cepat ongkos setelah absen berangkat
 */
export function getOngkosBerangkatKeyboard(workDate: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Rp10.000", `ongkos:${workDate}:10000`)
    .text("Rp15.000", `ongkos:${workDate}:15000`)
    .text("Rp20.000", `ongkos:${workDate}:20000`)
    .row()
    .text("Rp25.000", `ongkos:${workDate}:25000`)
    .text("Rp30.000", `ongkos:${workDate}:30000`)
    .text("⏩ Lewati (Tanpa Ongkos)", "ongkos:skip");
}

/**
 * Wizard Catat Uang - Step 1: Pilih Tipe (Pengeluaran vs Pemasukan)
 */
export function getFlowTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔴 Pengeluaran", "flow:catat:type:expense")
    .text("🟢 Pemasukan", "flow:catat:type:income")
    .row()
    .text("🔙 Batal", "act:dashboard");
}

/**
 * Wizard Catat Uang - Step 2: Pilih Kategori
 */
export function getFlowCategoryKeyboard(
  type: "expense" | "income",
  categories: Array<{ id: number; name: string; emoji: string }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  let col = 0;
  for (const cat of categories) {
    keyboard.text(`${cat.emoji} ${cat.name}`, `flow:catat:cat:${type}:${cat.id}`);
    col++;
    if (col % 2 === 0) keyboard.row();
  }

  if (col % 2 !== 0) keyboard.row();
  keyboard.text("🔙 Kembali", "flow:catat:start");

  return keyboard;
}

/**
 * Wizard Catat Uang - Step 3: Pilih Nominal Cepat (1-tap tanpa ngetik)
 */
export function getFlowAmountKeyboard(type: string, catId: number): InlineKeyboard {
  const isIncome = type === "income";

  if (isIncome) {
    return new InlineKeyboard()
      .text("Rp500.000", `flow:catat:amt:${type}:${catId}:500000`)
      .text("Rp1.000.000", `flow:catat:amt:${type}:${catId}:1000000`)
      .row()
      .text("Rp2.000.000", `flow:catat:amt:${type}:${catId}:2000000`)
      .text("Rp3.000.000", `flow:catat:amt:${type}:${catId}:3000000`)
      .row()
      .text("Rp5.000.000", `flow:catat:amt:${type}:${catId}:5000000`)
      .text("Rp10.000.000", `flow:catat:amt:${type}:${catId}:10000000`)
      .row()
      .text("🔙 Kembali", `flow:catat:type:${type}`);
  }

  return new InlineKeyboard()
    .text("Rp5.000", `flow:catat:amt:${type}:${catId}:5000`)
    .text("Rp10.000", `flow:catat:amt:${type}:${catId}:10000`)
    .text("Rp15.000", `flow:catat:amt:${type}:${catId}:15000`)
    .row()
    .text("Rp20.000", `flow:catat:amt:${type}:${catId}:20000`)
    .text("Rp25.000", `flow:catat:amt:${type}:${catId}:25000`)
    .text("Rp30.000", `flow:catat:amt:${type}:${catId}:30000`)
    .row()
    .text("Rp50.000", `flow:catat:amt:${type}:${catId}:50000`)
    .text("Rp100.000", `flow:catat:amt:${type}:${catId}:100000`)
    .text("Rp200.000", `flow:catat:amt:${type}:${catId}:200000`)
    .row()
    .text("Rp500.000", `flow:catat:amt:${type}:${catId}:500000`)
    .text("Rp1.000.000", `flow:catat:amt:${type}:${catId}:1000000`)
    .row()
    .text("🔙 Kembali", `flow:catat:type:${type}`);
}

/**
 * Wizard Catat Uang - Step 4: Pilih Dompet
 */
export function getFlowWalletKeyboard(
  type: string,
  catId: number,
  amount: number,
  wallets: Array<{ id: number; name: string; type: string }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  let col = 0;
  for (const w of wallets) {
    const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : "📱";
    keyboard.text(`${icon} ${w.name}`, `flow:catat:save:${type}:${catId}:${amount}:${w.id}`);
    col++;
    if (col % 2 === 0) keyboard.row();
  }

  if (col % 2 !== 0) keyboard.row();
  keyboard.text("🔙 Kembali", `flow:catat:cat:${type}:${catId}`);

  return keyboard;
}

/**
 * Wizard Transfer Saldo - Step 1: Pilih Dompet Asal
 */
export function getTransferFromKeyboard(
  wallets: Array<{ id: number; name: string; type: string }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let col = 0;
  for (const w of wallets) {
    const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : "📱";
    keyboard.text(`${icon} ${w.name}`, `flow:tr:from:${w.id}`);
    col++;
    if (col % 2 === 0) keyboard.row();
  }
  if (col % 2 !== 0) keyboard.row();
  keyboard.text("🔙 Batal", "act:dashboard");
  return keyboard;
}

/**
 * Wizard Transfer Saldo - Step 2: Pilih Dompet Tujuan
 */
export function getTransferToKeyboard(
  fromId: number,
  wallets: Array<{ id: number; name: string; type: string }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let col = 0;
  for (const w of wallets) {
    if (w.id === fromId) continue;
    const icon = w.type === "cash" ? "💵" : w.type === "bank" ? "🏦" : "📱";
    keyboard.text(`${icon} ${w.name}`, `flow:tr:to:${fromId}:${w.id}`);
    col++;
    if (col % 2 === 0) keyboard.row();
  }
  if (col % 2 !== 0) keyboard.row();
  keyboard.text("🔙 Kembali", "flow:tr:start");
  return keyboard;
}

/**
 * Wizard Transfer Saldo - Step 3: Pilih Nominal Transfer
 */
export function getTransferAmountKeyboard(fromId: number, toId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Rp25.000", `flow:tr:exec:${fromId}:${toId}:25000`)
    .text("Rp50.000", `flow:tr:exec:${fromId}:${toId}:50000`)
    .row()
    .text("Rp100.000", `flow:tr:exec:${fromId}:${toId}:100000`)
    .text("Rp200.000", `flow:tr:exec:${fromId}:${toId}:200000`)
    .row()
    .text("Rp500.000", `flow:tr:exec:${fromId}:${toId}:500000`)
    .text("Rp1.000.000", `flow:tr:exec:${fromId}:${toId}:1000000`)
    .row()
    .text("🔙 Kembali", `flow:tr:from:${fromId}`);
}

/**
 * Wizard Atur Gaji - Step 1: Pilih Gaji Pokok
 */
export function getSetGajiBaseKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Rp3.000.000", "flow:sg:base:3000000:monthly")
    .text("Rp4.000.000", "flow:sg:base:4000000:monthly")
    .row()
    .text("Rp5.000.000", "flow:sg:base:5000000:monthly")
    .text("Rp6.000.000", "flow:sg:base:6000000:monthly")
    .row()
    .text("Rp8.000.000", "flow:sg:base:8000000:monthly")
    .text("Rp10.000.000", "flow:sg:base:10000000:monthly")
    .row()
    .text("Rp150.000 / Hari", "flow:sg:base:150000:daily")
    .text("Rp200.000 / Hari", "flow:sg:base:200000:daily")
    .row()
    .text("🔙 Batal", "act:dashboard");
}

/**
 * Wizard Atur Gaji - Step 2: Pilih Tunjangan Harian (Uang Makan/Transport per Hari Berangkat)
 */
export function getSetGajiAllowanceKeyboard(base: number, type: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Rp15.000 / hari", `flow:sg:alw:${base}:${type}:15000`)
    .text("Rp20.000 / hari", `flow:sg:alw:${base}:${type}:20000`)
    .row()
    .text("Rp25.000 / hari", `flow:sg:alw:${base}:${type}:25000`)
    .text("Rp30.000 / hari", `flow:sg:alw:${base}:${type}:30000`)
    .row()
    .text("Rp50.000 / hari", `flow:sg:alw:${base}:${type}:50000`)
    .text("Tidak Ada (Rp0)", `flow:sg:alw:${base}:${type}:0`)
    .row()
    .text("🔙 Kembali", "flow:setgaji:start");
}

/**
 * Wizard Atur Gaji - Step 3: Pilih Tanggal Gajian
 */
export function getSetGajiPaydayKeyboard(
  base: number,
  type: string,
  allowance: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text("Tiap Tanggal 25", `flow:sg:save:${base}:${type}:${allowance}:25`)
    .text("Tiap Tanggal 28", `flow:sg:save:${base}:${type}:${allowance}:28`)
    .row()
    .text("Tiap Tanggal 1", `flow:sg:save:${base}:${type}:${allowance}:1`)
    .text("Akhir Bulan (Tgl 30)", `flow:sg:save:${base}:${type}:${allowance}:30`)
    .row()
    .text("🔙 Kembali", `flow:sg:base:${base}:${type}`);
}

/**
 * Inline keyboard aksi cepat pada transaksi (misal tombol Undo / Hapus)
 */
export function getTransactionActionKeyboard(transactionId: number): InlineKeyboard {
  return new InlineKeyboard().text("🗑️ Hapus (Undo)", `tx:delete:${transactionId}`);
}
