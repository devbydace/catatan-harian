import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import {
  sendMorningAttendanceReminders,
  sendPaydayNotification,
  sendNightSummaryReminders,
} from "./cron/scheduler.js";

export const bot = createBot();
export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "bot-tele-daily",
    platform: "vercel",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (c) => {
  return c.text("🤖 DailyWork Bot API is running!");
});

// Endpoint Cron Trigger (kompatibel dengan Vercel Cron & Cloudflare)
app.get("/api/cron/reminders", async (c) => {
  const authHeader = c.req.header("Authorization") || c.req.query("key");
  const isVercelCron = c.req.header("x-vercel-cron") === "1";

  if (!isVercelCron && env.WEBHOOK_SECRET && authHeader !== `Bearer ${env.WEBHOOK_SECRET}` && authHeader !== env.WEBHOOK_SECRET) {
    return c.text("Unauthorized cron secret", 401);
  }

  await sendMorningAttendanceReminders(bot);
  await sendPaydayNotification(bot);
  await sendNightSummaryReminders(bot);

  return c.json({ status: "success", executedAt: new Date().toISOString() });
});

// Telegram Webhook Handler dengan validasi secret token
app.post("/webhook", async (c) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (env.WEBHOOK_SECRET && secretHeader !== env.WEBHOOK_SECRET) {
    return c.text("Unauthorized secret token", 401);
  }

  const handle = webhookCallback(bot, "hono");
  return handle(c);
});

