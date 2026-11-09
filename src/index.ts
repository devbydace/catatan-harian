import { app } from "./app.js";
import { env } from "./config/env.js";

export default app;

console.log(`🚀 Daily Bot Webhook Server siap (Port: ${env.PORT})`);
