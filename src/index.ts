import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";

const app = new Hono();
const bot = createBot();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "bot-tele-daily",
    timestamp: new Date().toISOString(),
  });
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

export default {
  port: env.PORT,
  fetch: app.fetch,
};

// Log info saat dijalankan di Node/Bun
console.log(`🚀 Daily Bot Webhook Server berjalan di port ${env.PORT}`);
