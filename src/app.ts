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

// Logging middleware untuk pemantauan request di Vercel logs
app.use("*", async (c, next) => {
  console.log(`📥 [${c.req.method}] ${c.req.path}`);
  await next();
  console.log(`📤 [${c.req.method}] ${c.req.path} -> ${c.res.status}`);
});

// Health check endpoint
const handleHealth = (c: any) => {
  return c.json({
    status: "ok",
    service: "bot-tele-daily",
    platform: "vercel",
    timestamp: new Date().toISOString(),
  });
};
app.get("/health", handleHealth);
app.get("/api/health", handleHealth);

const handleRoot = (c: any) => {
  return c.text("🤖 DailyWork Bot API is running!");
};
app.get("/", handleRoot);
app.get("/api", handleRoot);

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

// Telegram Webhook Handler (instansiasi sekali agar bot.init tidak dipanggil berulang)
const webhookHandler = webhookCallback(bot, "hono", {
  secretToken: env.WEBHOOK_SECRET,
  timeoutMilliseconds: 25_000,
});

app.post("/webhook", webhookHandler);
app.post("/api/webhook", webhookHandler);
app.post("/api", webhookHandler);

