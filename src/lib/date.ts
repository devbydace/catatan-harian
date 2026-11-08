import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Jakarta";

/**
 * Mendapatkan tanggal hari ini dalam format 'YYYY-MM-DD' sesuai zona waktu user.
 */
export function getTodayDate(tz: string = DEFAULT_TZ): string {
  const zoned = toZonedTime(new Date(), tz);
  return format(zoned, "yyyy-MM-dd");
}

/**
 * Mendapatkan periode bulan saat ini dalam format 'YYYY-MM'.
 */
export function getCurrentMonthPeriod(tz: string = DEFAULT_TZ): string {
  const zoned = toZonedTime(new Date(), tz);
  return format(zoned, "yyyy-MM");
}

/**
 * Mendapatkan rentang tanggal awal dan akhir untuk periode 'YYYY-MM'.
 */
export function getMonthRange(periodMonth: string): { start: string; end: string } {
  const parsed = parseISO(`${periodMonth}-01`);
  const start = format(startOfMonth(parsed), "yyyy-MM-dd");
  const end = format(endOfMonth(parsed), "yyyy-MM-dd");
  return { start, end };
}

/**
 * Format tanggal ramah pengguna (contoh: "Senin, 08 Nov 2026")
 */
export function formatDisplayDate(dateInput: string | Date, tz: string = DEFAULT_TZ): string {
  const dateObj = typeof dateInput === "string" ? parseISO(dateInput) : dateInput;
  const zoned = toZonedTime(dateObj, tz);
  
  const hariMap: Record<string, string> = {
    Sunday: "Minggu",
    Monday: "Senin",
    Tuesday: "Selasa",
    Wednesday: "Rabu",
    Thursday: "Kamis",
    Friday: "Jumat",
    Saturday: "Sabtu",
  };

  const bulanMap: Record<string, string> = {
    Jan: "Jan",
    Feb: "Feb",
    Mar: "Mar",
    Apr: "Apr",
    May: "Mei",
    Jun: "Jun",
    Jul: "Jul",
    Aug: "Agt",
    Sep: "Sep",
    Oct: "Okt",
    Nov: "Nov",
    Dec: "Des",
  };

  const englishDay = format(zoned, "EEEE");
  const englishMonth = format(zoned, "MMM");
  const dayNumber = format(zoned, "dd");
  const yearNumber = format(zoned, "yyyy");

  const hari = hariMap[englishDay] || englishDay;
  const bulan = bulanMap[englishMonth] || englishMonth;

  return `${hari}, ${dayNumber} ${bulan} ${yearNumber}`;
}

