import { createBot } from "../src/bot/bot.js";
import { env } from "../src/config/env.js";

async function main() {
  const urlArg = process.argv[2];

  if (!urlArg) {
    console.error("❌ Mohon masukkan URL domain Vercel kamu!");
    console.log("Contoh:");
    console.log("  bun run scripts/set-webhook.ts https://bot-tele-daily.vercel.app");
    console.log("  atau: npm run webhook:set https://bot-tele-daily.vercel.app");
    process.exit(1);
  }

  const cleanUrl = urlArg.replace(/\/+$/, "");
  const webhookUrl = `${cleanUrl}/webhook`;

  console.log(`📡 Mendaftarkan Webhook Telegram ke: ${webhookUrl}`);

  const bot = createBot();

  try {
    await bot.api.setWebhook(webhookUrl, {
      secret_token: env.WEBHOOK_SECRET,
      drop_pending_updates: true,
    });

    console.log("✅ Webhook Telegram BERHASIL didaftarkan!");
    console.log("📋 Detail Webhook:");
    const info = await bot.api.getWebhookInfo();
    console.log(`• URL: ${info.url}`);
    console.log(`• Custom Certificate: ${info.has_custom_certificate}`);
    console.log(`• Pending Updates: ${info.pending_update_count}`);
  } catch (err) {
    console.error("❌ Gagal mendaftarkan webhook:", err);
    process.exit(1);
  }
}

main();

