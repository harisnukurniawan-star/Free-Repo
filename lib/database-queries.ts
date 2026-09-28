import { databaseMode, getPool } from "@/lib/db";
import { demoHealth, demoOverview, demoSchema } from "@/lib/demo-data";
import type { DbHealth, DbOverview, DbRelation, DbSchema, DbTable } from "@/types/database";
import type { RowDataPacket } from "mysql2";

const DB = () => process.env.OCI_DB_NAME || "";

export async function getOverview(): Promise<DbOverview> {
  if (databaseMode() === "demo") return { ...demoOverview, checkedAt: new Date().toISOString() };
  const pool = getPool();
  const started = Date.now();
  const [summaryResult, statusResult] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS table_count, COALESCE(SUM(TABLE_ROWS),0) AS approximate_rows, COALESCE(SUM(DATA_LENGTH),0) AS data_bytes, COALESCE(SUM(INDEX_LENGTH),0) AS index_bytes, COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH),0) AS total_bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`, [DB()]),
    pool.query<RowDataPacket[]>(`SHOW GLOBAL STATUS WHERE Variable_name = 'Threads_connected'`)
  ]);
  const row = summaryResult[0][0];
  const active = statusResult[0][0];
  return { connected: true, mode: "direct", latencyMs: Date.now() - started, databaseName: DB(), tableCount: Number(row?.table_count || 0), approximateRows: Number(row?.approximate_rows || 0), dataBytes: Number(row?.data_bytes || 0), indexBytes: Number(row?.index_bytes || 0), totalBytes: Number(row?.total_bytes || 0), activeConnections: active ? Number(active.Value || 0) : null, checkedAt: new Date().toISOString() };
}

export async function getSchema(): Promise<DbSchema> {
  if (databaseMode() === "demo") return demoSchema;
  const pool = getPool();
  const [tableResult, columnResult, relationResult] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, DATA_LENGTH + INDEX_LENGTH AS TOTAL_BYTES, UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TOTAL_BYTES DESC`, [DB()]),
    pool.query<RowDataPacket[]>(`SELECT c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = ? ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, [DB()]),
    pool.query<RowDataPacket[]>(`SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`, [DB()])
  ]);
  const tableRows = tableResult[0]; const columnRows = columnResult[0]; const relationRows = relationResult[0];
  const foreignSet = new Set(relationRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
  const columnsByTable = new Map<string, DbTable["columns"]>();
  for (const c of columnRows) {
    const name = String(c.TABLE_NAME); const cols = columnsByTable.get(name) || [];
    cols.push({ name: String(c.COLUMN_NAME), type: String(c.COLUMN_TYPE), nullable: String(c.IS_NULLABLE) === "YES", primary: String(c.COLUMN_KEY) === "PRI", foreign: foreignSet.has(`${name}.${String(c.COLUMN_NAME)}`) });
    columnsByTable.set(name, cols);
  }
  const tables: DbTable[] = tableRows.map((r) => ({ name: String(r.TABLE_NAME), rows: Number(r.TABLE_ROWS || 0), dataBytes: Number(r.DATA_LENGTH || 0), indexBytes: Number(r.INDEX_LENGTH || 0), totalBytes: Number(r.TOTAL_BYTES || 0), updatedAt: r.UPDATE_TIME ? new Date(r.UPDATE_TIME).toISOString() : null, columns: columnsByTable.get(String(r.TABLE_NAME)) || [] }));
  const relations: DbRelation[] = relationRows.map((r) => ({ id: `${r.CONSTRAINT_NAME}:${r.TABLE_NAME}.${r.COLUMN_NAME}`, fromTable: String(r.TABLE_NAME), fromColumn: String(r.COLUMN_NAME), toTable: String(r.REFERENCED_TABLE_NAME), toColumn: String(r.REFERENCED_COLUMN_NAME), constraintName: String(r.CONSTRAINT_NAME) }));
  return { tables, relations };
}

export async function getHealth(): Promise<DbHealth> {
  if (databaseMode() === "demo") return { ...demoHealth, checkedAt: new Date().toISOString() };
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(`SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Connections','Questions','Aborted_connects','Aborted_clients','Bytes_received','Bytes_sent','Uptime')`);
  const map = new Map(rows.map((r) => [String(r.Variable_name), Number(r.Value || 0)]));
  return { connected: true, uptimeSeconds: map.get("Uptime") || 0, checkedAt: new Date().toISOString(), metrics: [
    { key: "Threads_connected", label: "Connections", value: map.get("Threads_connected") || 0 },
    { key: "Threads_running", label: "Running", value: map.get("Threads_running") || 0 },
    { key: "Questions", label: "Queries", value: map.get("Questions") || 0 },
    { key: "Aborted_connects", label: "Aborted", value: map.get("Aborted_connects") || 0 }
  ]};
}

export async function getTables(): Promise<DbTable[]> { return (await getSchema()).tables; }
