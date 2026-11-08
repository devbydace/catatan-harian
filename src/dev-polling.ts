import { createBot } from "./bot/bot.js";

async function main() {
  console.log("🤖 Menjalankan Daily Bot dalam mode Long Polling (Lokal Dev)...");
  const bot = createBot();

  // Hapus webhook lama agar long polling bisa menerima pesan
  await bot.api.deleteWebhook();

  console.log("✅ Bot siap menerima pesan!");
  await bot.start({
    onStart: (botInfo) => {
      console.log(`🚀 Bot aktif sebagai @${botInfo.username} (${botInfo.first_name})`);
    },
  });
}

main().catch((err) => {
  console.error("Error menjalankan bot dev:", err);
  process.exit(1);
});
