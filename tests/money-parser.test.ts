import { describe, it, expect } from "vitest";
import { parseQuickTransaction, formatRupiah } from "../src/lib/money-parser.js";

describe("Money Parser - Format Rupiah & Input Cepat", () => {
  it("formatRupiah memformat angka ke format Rupiah yang benar", () => {
    expect(formatRupiah(25000)).toBe("Rp25.000");
    expect(formatRupiah(1500000)).toBe("Rp1.500.000");
    expect(formatRupiah(0)).toBe("Rp0");
  });

  it("mencerna nominal dengan sufiks 'rb' atau 'k'", () => {
    const res1 = parseQuickTransaction("kopi susu 18rb");
    expect(res1).toEqual({
      amount: 18000,
      type: "expense",
      note: "kopi susu",
      walletName: undefined,
    });

    const res2 = parseQuickTransaction("bensin 30k");
    expect(res2?.amount).toBe(30000);
    expect(res2?.note).toBe("bensin");
  });

  it("mencerna nominal dengan sufiks 'jt' atau 'juta'", () => {
    const res1 = parseQuickTransaction("+gaji 5jt @bca");
    expect(res1).toEqual({
      amount: 5000000,
      type: "income",
      note: "gaji",
      walletName: "bca",
    });

    const res2 = parseQuickTransaction("laptop second 3.5jt");
    expect(res2?.amount).toBe(3500000);
    expect(res2?.type).toBe("expense");

    const res3 = parseQuickTransaction("bonus 1,5 juta");
    expect(res3?.amount).toBe(1500000);
  });

  it("mencerna kombinasi '2jt500'", () => {
    const res = parseQuickTransaction("servis motor 1jt250");
    expect(res?.amount).toBe(1250000);
  });

  it("mencerna nominal angka murni dengan titik", () => {
    const res = parseQuickTransaction("makan siang 25.000 @gopay");
    expect(res).toEqual({
      amount: 25000,
      type: "expense",
      note: "makan siang",
      walletName: "gopay",
    });
  });

  it("mencerna pemasukan dengan awalan '+'", () => {
    const res = parseQuickTransaction("+freelance landing page 750rb");
    expect(res?.type).toBe("income");
    expect(res?.amount).toBe(750000);
    expect(res?.note).toBe("freelance landing page");
  });

  it("mengabaikan teks biasa tanpa nominal uang", () => {
    const res = parseQuickTransaction("halo apa kabar");
    expect(res).toBeNull();
  });
});
