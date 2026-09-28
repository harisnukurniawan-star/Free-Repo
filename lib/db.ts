import mysql, { type Pool } from "mysql2/promise";
import type { DatabaseMode } from "@/types/database";

let pool: Pool | null = null;

export function databaseMode(): DatabaseMode {
  return process.env.CONTROL_ROOM_DB_MODE === "direct" ? "direct" : "snapshot";
}

export function getPool(): Pool {
  if (databaseMode() !== "direct") {
    throw new Error("Database is not configured for direct mode.");
  }

  if (!process.env.OCI_DB_HOST || !process.env.OCI_DB_NAME || !process.env.OCI_DB_USER) {
    throw new Error("Missing OCI database environment variables.");
  }

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
      connectTimeout: 8000,
    });
  }

  return pool;
}
