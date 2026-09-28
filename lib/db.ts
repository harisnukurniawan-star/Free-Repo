import mysql, { type Pool } from "mysql2/promise";

export type DatabaseMode = "demo" | "direct" | "snapshot";

let pool: Pool | null = null;

export function databaseMode(): DatabaseMode {
  const mode = process.env.CONTROL_ROOM_DB_MODE?.trim().toLowerCase();
  if (mode === "direct") return "direct";
  if (mode === "snapshot") return "snapshot";
  return "demo";
}

export function getPool(): Pool {
  if (databaseMode() !== "direct") throw new Error("Database is not configured for direct mode.");
  if (!process.env.OCI_DB_HOST || !process.env.OCI_DB_NAME || !process.env.OCI_DB_USER) throw new Error("Missing OCI database environment variables.");

  if (!pool) {
    const useSsl = process.env.OCI_DB_SSL !== "false";
    pool = mysql.createPool({
      host: process.env.OCI_DB_HOST,
      port: Number(process.env.OCI_DB_PORT || 3306),
      database: process.env.OCI_DB_NAME,
      user: process.env.OCI_DB_USER,
      password: process.env.OCI_DB_PASSWORD,
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 2,
      idleTimeout: 30000,
      enableKeepAlive: true,
      connectTimeout: 8000
    });
  }
  return pool;
}
