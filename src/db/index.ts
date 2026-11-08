import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { env } from "../config/env.js";

// Koneksi HTTP serverless ke Neon DB (sangat efisien di edge/serverless & tidak membebani connection pool)
const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });

export type Database = typeof db;
