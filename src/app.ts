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
app.get("/api/health", (c) => {
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
app.get("/api", (c) => {
  return c.text("🤖 DailyWork Bot API is running!");
});

// Endpoint Cron Trigger (kompatibel dengan Vercel Cron & Cloudflare)
const handleCron = async (c: any) => {
  const authHeader = c.req.header("Authorization") || c.req.query("key");
  const isVercelCron = c.req.header("x-vercel-cron") === "1";

  if (!isVercelCron && env.WEBHOOK_SECRET && authHeader !== `Bearer ${env.WEBHOOK_SECRET}` && authHeader !== env.WEBHOOK_SECRET) {
    return c.text("Unauthorized cron secret", 401);
  }

  await sendMorningAttendanceReminders(bot);
  await sendPaydayNotification(bot);
  await sendNightSummaryReminders(bot);

  return c.json({ status: "success", executedAt: new Date().toISOString() });
};

app.get("/cron/reminders", handleCron);
app.get("/api/cron/reminders", handleCron);

// Telegram Webhook Handler dengan validasi secret token
const handleWebhook = async (c: any) => {
  const secretHeader = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (env.WEBHOOK_SECRET && secretHeader !== env.WEBHOOK_SECRET) {
    return c.text("Unauthorized secret token", 401);
  }

  const handle = webhookCallback(bot, "hono");
  return handle(c);
};

app.post("/webhook", handleWebhook);
app.post("/api/webhook", handleWebhook);

