import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN wajib diisi"),
  DATABASE_URL: z.string().url("DATABASE_URL harus berupa URL PostgreSQL yang valid"),
  WEBHOOK_SECRET: z.string().default("default_secret_key"),
  PORT: z.coerce.number().default(3000),
  ALLOWED_TELEGRAM_IDS: z.string().optional().default(""),
  DEFAULT_TIMEZONE: z.string().default("Asia/Jakarta"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);

export function isUserAllowed(telegramId: number): boolean {
  if (!env.ALLOWED_TELEGRAM_IDS || env.ALLOWED_TELEGRAM_IDS.trim() === "") {
    return true; // Mode publik: siapa saja boleh pakai
  }
  const allowed = env.ALLOWED_TELEGRAM_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(String(telegramId));
}

