import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { salaryProfiles } from "../../db/schema.js";
import { getAttendanceMonthSummary } from "./attendance.js";
import { getCurrentMonthPeriod } from "../../lib/date.js";

/**
 * Menghitung estimasi gaji bulan berjalan berdasarkan data kehadiran (hari berangkat)
 */
export async function calculateSalaryEstimation(
  userId: number,
  periodMonth: string = getCurrentMonthPeriod()
) {
  // 1. Ambil profil gaji user
  const profiles = await db
    .select()
    .from(salaryProfiles)
    .where(eq(salaryProfiles.userId, userId))
    .limit(1);

  const profile = profiles[0] || {
    payType: "monthly",
    baseAmount: 0,
    payDay: 25,
    allowancePerWorkDay: 0,
    fixedDeductions: 0,
  };

  // 2. Ambil rekap absensi bulan ini
  const attendanceSummary = await getAttendanceMonthSummary(userId, periodMonth);
  const daysWorked = attendanceSummary.berangkat;

  // 3. Perhitungan
  let totalBase = 0;
  if (profile.payType === "daily") {
    totalBase = profile.baseAmount * daysWorked;
  } else {
    totalBase = profile.baseAmount;
  }

  const totalAllowance = profile.allowancePerWorkDay * daysWorked;
  const totalDeductions = profile.fixedDeductions;
  const netEstimatedSalary = Math.max(0, totalBase + totalAllowance - totalDeductions);

  return {
    periodMonth,
    payType: profile.payType,
    payDay: profile.payDay,
    baseAmount: profile.baseAmount,
    daysWorked,
    totalBase,
    allowancePerWorkDay: profile.allowancePerWorkDay,
    totalAllowance,
    totalDeductions,
    netEstimatedSalary,
    attendanceSummary,
  };
}
