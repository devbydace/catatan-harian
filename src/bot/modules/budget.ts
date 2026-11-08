import { eq, and, sql, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { budgets, categories, transactions } from "../../db/schema.js";
import { getCurrentMonthPeriod } from "../../lib/date.js";
import { formatRupiah } from "../../lib/money-parser.js";

/**
 * Mengatur batas anggaran bulanan untuk kategori tertentu
 */
export async function setCategoryBudget(
  userId: number,
  categoryId: number,
  amount: number,
  periodMonth: string = getCurrentMonthPeriod()
) {
  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, userId),
        eq(budgets.categoryId, categoryId),
        eq(budgets.periodMonth, periodMonth)
      )
    )
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const [updated] = await db
      .update(budgets)
      .set({ amount })
      .where(eq(budgets.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(budgets)
    .values({
      userId,
      categoryId,
      periodMonth,
      amount,
    })
    .returning();

  return inserted;
}

/**
 * Mendapatkan status seluruh anggaran bulanan (budget vs pemakaian aktual)
 */
export async function getBudgetSummary(
  userId: number,
  periodMonth: string = getCurrentMonthPeriod(),
  timezone: string = "Asia/Jakarta"
) {
  const userBudgets = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      budgetAmount: budgets.amount,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.userId, userId), eq(budgets.periodMonth, periodMonth)));

  const list: Array<{
    categoryId: number;
    name: string;
    emoji: string;
    budget: number;
    spent: number;
    remaining: number;
    percentage: number;
    isOverBudget: boolean;
  }> = [];

  for (const b of userBudgets) {
    const spentRes = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.categoryId, b.categoryId),
          eq(transactions.type, "expense"),
          sql`TO_CHAR(${transactions.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM') = ${periodMonth}`,
          isNull(transactions.deletedAt)
        )
      );

    const spent = Number(spentRes[0]?.total || 0);
    const remaining = b.budgetAmount - spent;
    const percentage = b.budgetAmount > 0 ? Math.round((spent / b.budgetAmount) * 100) : 0;

    list.push({
      categoryId: b.categoryId,
      name: b.categoryName,
      emoji: b.categoryEmoji,
      budget: b.budgetAmount,
      spent,
      remaining,
      percentage,
      isOverBudget: spent > b.budgetAmount,
    });
  }

  return {
    periodMonth,
    budgets: list,
  };
}

/**
 * Mengecek apakah pengeluaran kategori telah mendekati atau melebihi anggaran (>=80% atau >=100%)
 */
export async function checkBudgetAlert(
  userId: number,
  categoryId: number,
  periodMonth: string = getCurrentMonthPeriod(),
  timezone: string = "Asia/Jakarta"
): Promise<string | null> {
  const [b] = await db
    .select({
      amount: budgets.amount,
      catName: categories.name,
      catEmoji: categories.emoji,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(
      and(
        eq(budgets.userId, userId),
        eq(budgets.categoryId, categoryId),
        eq(budgets.periodMonth, periodMonth)
      )
    )
    .limit(1);

  if (!b || b.amount <= 0) return null;

  const spentRes = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, "expense"),
        sql`TO_CHAR(${transactions.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM') = ${periodMonth}`,
        isNull(transactions.deletedAt)
      )
    );

  const spent = Number(spentRes[0]?.total || 0);
  const percentage = Math.round((spent / b.amount) * 100);

  if (percentage >= 100) {
    return `🚨 **PERINGATAN ANGGARAN HABIS!**\nPengeluaran ${b.catEmoji} **${b.catName}** telah melebihi batas anggaran (${percentage}%): ${formatRupiah(spent)} / ${formatRupiah(b.amount)}.`;
  } else if (percentage >= 80) {
    return `⚠️ **PERINGATAN ANGGARAN (${percentage}%)**\nPengeluaran ${b.catEmoji} **${b.catName}** sudah mencapai ${formatRupiah(spent)} dari batas ${formatRupiah(b.amount)}.`;
  }

  return null;
}


