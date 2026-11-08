import { Keyboard, InlineKeyboard } from "grammy";

/**
 * Menu keyboard utama yang selalu tampil di bagian bawah chat pengguna
 */
export function getMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🚗 Berangkat Kerja")
    .text("🏖️ Tidak Masuk")
    .row()
    .text("💸 Catat Pengeluaran")
    .text("📊 Laporan Hari Ini")
    .row()
    .text("💳 Saldo Dompet")
    .text("💼 Info & Estimasi Gaji")
    .resized()
    .persistent();
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
    .text("❌ Batal", "absen:cancel");
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
    .text("⏩ Lewati", "ongkos:skip");
}

/**
 * Inline keyboard aksi cepat pada transaksi (misal tombol Undo / Hapus)
 */
export function getTransactionActionKeyboard(transactionId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑️ Hapus (Undo)", `tx:delete:${transactionId}`);
}
