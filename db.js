import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Prevent idle PostgreSQL connection errors from crashing Node.
pool.on("error", (err) => {
  console.error("[PostgreSQL] Idle connection error:", err.message);
});

export default pool;
