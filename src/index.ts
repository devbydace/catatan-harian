import { app } from "./app.js";
import { env } from "./config/env.js";

export default {
  port: env.PORT,
  fetch: app.fetch,
};

console.log(`🚀 Daily Bot Webhook Server berjalan di port ${env.PORT}`);
