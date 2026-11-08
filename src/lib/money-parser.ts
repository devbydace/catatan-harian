export interface ParsedTransaction {
  amount: number;
  type: "income" | "expense";
  note: string;
  walletName?: string;
  categoryHint?: string;
}

/**
 * Format angka integer ke format mata uang Rupiah (contoh: 25000 -> "Rp25.000")
 */
export function formatRupiah(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNegative ? "-" : ""}Rp${formatted}`;
}

/**
 * Parser pintar untuk mencerna pesan input cepat finansial.
 * Contoh input:
 * - "kopi 18rb" -> { amount: 18000, type: 'expense', note: 'kopi' }
 * - "makan siang 25k @gopay" -> { amount: 25000, type: 'expense', note: 'makan siang', walletName: 'gopay' }
 * - "+gaji 5jt @bca" -> { amount: 5000000, type: 'income', note: 'gaji', walletName: 'bca' }
 * - "+bonus freelance 1.5jt" -> { amount: 1500000, type: 'income', note: 'bonus freelance' }
 * - "bensin 30.000" -> { amount: 30000, type: 'expense', note: 'bensin' }
 * - "2jt500 belanja bulanan" -> { amount: 2500000, type: 'expense', note: 'belanja bulanan' }
 */
export function parseQuickTransaction(input: string): ParsedTransaction | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Cek tipe transaksi (jika diawali '+' -> income, jika '-' atau tanpa tanda -> expense)
  let isIncome = false;
  let text = trimmed;

  if (text.startsWith("+")) {
    isIncome = true;
    text = text.substring(1).trim();
  } else if (text.startsWith("-")) {
    isIncome = false;
    text = text.substring(1).trim();
  }

  // 2. Deteksi tag dompet (contoh: @gopay, @bca, @tunai, @ovo, @dana)
  let walletName: string | undefined;
  const walletMatch = text.match(/@([a-zA-Z0-9_]+)/i);
  if (walletMatch && walletMatch[1]) {
    walletName = walletMatch[1].toLowerCase();
    text = text.replace(walletMatch[0], "").trim();
  }

  // 3. Regex untuk mengenali nominal uang bahasa Indonesia
  // Pola a: "2jt500" atau "1jt200rb"
  const comboJtPattern = /\b(\d+)\s*(?:jt|juta)\s*(\d+)(?:\s*(?:rb|k|ribu))?\b/i;
  const comboMatch = text.match(comboJtPattern);

  let amount: number | null = null;
  let matchedStr = "";

  if (comboMatch && comboMatch[1] && comboMatch[2]) {
    const juta = parseInt(comboMatch[1], 10);
    let sisa = comboMatch[2];
    // Jika sisa hanya 1 digit (misal 2jt5 -> 2.500.000)
    if (sisa.length === 1) sisa = sisa + "00";
    else if (sisa.length === 2) sisa = sisa + "0";
    amount = juta * 1_000_000 + parseInt(sisa, 10) * 1_000;
    matchedStr = comboMatch[0];
  } else {
    // Pola b: nominal standar
    // "1.5jt", "1,5 juta", "25rb", "25ribu", "25k", "50000", "50.000", "50,000"
    const numberPattern = /\b(\d+(?:[.,]\d+)?)\s*(jt|juta|rb|k|ribu)?\b/i;
    const numMatch = text.match(numberPattern);

    if (numMatch && numMatch[1]) {
      const rawNum = numMatch[1].replace(/,/g, ".");
      const unit = (numMatch[2] || "").toLowerCase();

      // Cek apakah angka murni dengan titik pemisah ribuan (contoh: 50.000 atau 1.000.000)
      if (!unit && (numMatch[1].includes(".") || numMatch[1].includes(","))) {
        // Jika ada 3 digit setelah titik, ini format ribuan: 50.000 -> 50000
        const parts = numMatch[1].split(/[.,]/);
        if (parts.length > 1 && parts.every((p, idx) => idx === 0 || p.length === 3)) {
          amount = parseInt(numMatch[1].replace(/[.,]/g, ""), 10);
        } else {
          amount = Math.round(parseFloat(rawNum));
        }
      } else {
        const base = parseFloat(rawNum);
        if (unit === "jt" || unit === "juta") {
          amount = Math.round(base * 1_000_000);
        } else if (unit === "rb" || unit === "k" || unit === "ribu") {
          amount = Math.round(base * 1_000);
        } else {
          amount = Math.round(base);
        }
      }
      matchedStr = numMatch[0];
    }
  }

  if (amount === null || isNaN(amount) || amount <= 0) {
    return null;
  }

  // Bersihkan catatan (hilangkan bagian nominal yang sudah dicocokkan)
  let note = text.replace(matchedStr, "").trim();
  // Hilangkan tanda baca berlebih di catatan
  note = note.replace(/^[-:,]\s*/, "").replace(/[-:,]\s*$/, "").trim();

  // Jika tanpa catatan, beri default sesuai tipe
  if (!note) {
    note = isIncome ? "Pemasukan" : "Pengeluaran";
  }

  return {
    amount,
    type: isIncome ? "income" : "expense",
    note,
    walletName,
  };
}
