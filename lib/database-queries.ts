import { databaseMode, getPool } from "@/lib/db";
import { demoHealth, demoOverview, demoSchema } from "@/lib/demo-data";
import { getOciDatabaseSnapshot } from "@/lib/oci-snapshot";
import type { DbHealth, DbOverview, DbRelation, DbSchema, DbTable } from "@/types/database";
import type { RowDataPacket } from "mysql2";

const DB = () => process.env.OCI_DB_NAME || "";

function snapshotSchema(): DbSchema {
  const snapshot = getOciDatabaseSnapshot();
  const foreignSet = new Set(snapshot.relations.map((r) => `${r.fromTable}.${r.fromColumn}`));
  const columnsByTable = new Map<string, DbTable["columns"]>();

  for (const column of snapshot.columns) {
    const columns = columnsByTable.get(column.table) || [];
    columns.push({
      name: column.name,
      type: column.columnType || column.dataType || "unknown",
      nullable: Boolean(column.nullable),
      primary: column.key === "PRI",
      foreign: foreignSet.has(`${column.table}.${column.name}`)
    });
    columnsByTable.set(column.table, columns);
  }

  const tables: DbTable[] = snapshot.tables.map((table) => ({
    name: table.name,
    rows: Number(table.rows || 0),
    dataBytes: Number(table.dataBytes || 0),
    indexBytes: Number(table.indexBytes || 0),
    totalBytes: Number(table.totalBytes || 0),
    updatedAt: table.updatedAt || null,
    columns: columnsByTable.get(table.name) || []
  }));

  const relations: DbRelation[] = snapshot.relations.map((relation) => ({
    id: `${relation.constraint}:${relation.fromTable}.${relation.fromColumn}`,
    fromTable: relation.fromTable,
    fromColumn: relation.fromColumn,
    toTable: relation.toTable,
    toColumn: relation.toColumn,
    constraintName: relation.constraint
  }));

  return { tables, relations };
}

export async function getOverview(): Promise<DbOverview> {
  const mode = databaseMode();
  if (mode === "demo") return { ...demoOverview, checkedAt: new Date().toISOString() };

  if (mode === "snapshot") {
    const snapshot = getOciDatabaseSnapshot();
    return {
      connected: true,
      mode: "snapshot",
      latencyMs: null,
      databaseName: snapshot.database,
      tableCount: Number(snapshot.overview.tableCount || 0),
      approximateRows: Number(snapshot.overview.approxRows || 0),
      dataBytes: Number(snapshot.overview.dataBytes || 0),
      indexBytes: Number(snapshot.overview.indexBytes || 0),
      totalBytes: Number(snapshot.overview.totalBytes || 0),
      activeConnections: Number(snapshot.health.threadsConnected || 0),
      checkedAt: snapshot.generatedAt,
      message: `Read-only OCI HeatWave snapshot captured ${new Date(snapshot.generatedAt).toLocaleString()}.`
    };
  }

  const pool = getPool();
  const started = Date.now();
  const [summaryResult, statusResult] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS table_count, COALESCE(SUM(TABLE_ROWS),0) AS approximate_rows, COALESCE(SUM(DATA_LENGTH),0) AS data_bytes, COALESCE(SUM(INDEX_LENGTH),0) AS index_bytes, COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH),0) AS total_bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`, [DB()]),
    pool.query<RowDataPacket[]>(`SHOW GLOBAL STATUS WHERE Variable_name = 'Threads_connected'`)
  ]);
  const row = summaryResult[0][0];
  const active = statusResult[0][0];
  return {
    connected: true,
    mode: "direct",
    latencyMs: Date.now() - started,
    databaseName: DB(),
    tableCount: Number(row?.table_count || 0),
    approximateRows: Number(row?.approximate_rows || 0),
    dataBytes: Number(row?.data_bytes || 0),
    indexBytes: Number(row?.index_bytes || 0),
    totalBytes: Number(row?.total_bytes || 0),
    activeConnections: active ? Number(active.Value || 0) : null,
    checkedAt: new Date().toISOString()
  };
}

export async function getSchema(): Promise<DbSchema> {
  const mode = databaseMode();
  if (mode === "demo") return demoSchema;
  if (mode === "snapshot") return snapshotSchema();

  const pool = getPool();
  const [tableResult, columnResult, relationResult] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, DATA_LENGTH + INDEX_LENGTH AS TOTAL_BYTES, UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TOTAL_BYTES DESC`, [DB()]),
    pool.query<RowDataPacket[]>(`SELECT c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = ? ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, [DB()]),
    pool.query<RowDataPacket[]>(`SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`, [DB()])
  ]);

  const tableRows = tableResult[0];
  const columnRows = columnResult[0];
  const relationRows = relationResult[0];
  const foreignSet = new Set(relationRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
  const columnsByTable = new Map<string, DbTable["columns"]>();

  for (const column of columnRows) {
    const name = String(column.TABLE_NAME);
    const columns = columnsByTable.get(name) || [];
    columns.push({
      name: String(column.COLUMN_NAME),
      type: String(column.COLUMN_TYPE),
      nullable: String(column.IS_NULLABLE) === "YES",
      primary: String(column.COLUMN_KEY) === "PRI",
      foreign: foreignSet.has(`${name}.${String(column.COLUMN_NAME)}`)
    });
    columnsByTable.set(name, columns);
  }

  const tables: DbTable[] = tableRows.map((row) => ({
    name: String(row.TABLE_NAME),
    rows: Number(row.TABLE_ROWS || 0),
    dataBytes: Number(row.DATA_LENGTH || 0),
    indexBytes: Number(row.INDEX_LENGTH || 0),
    totalBytes: Number(row.TOTAL_BYTES || 0),
    updatedAt: row.UPDATE_TIME ? new Date(row.UPDATE_TIME).toISOString() : null,
    columns: columnsByTable.get(String(row.TABLE_NAME)) || []
  }));

  const relations: DbRelation[] = relationRows.map((relation) => ({
    id: `${relation.CONSTRAINT_NAME}:${relation.TABLE_NAME}.${relation.COLUMN_NAME}`,
    fromTable: String(relation.TABLE_NAME),
    fromColumn: String(relation.COLUMN_NAME),
    toTable: String(relation.REFERENCED_TABLE_NAME),
    toColumn: String(relation.REFERENCED_COLUMN_NAME),
    constraintName: String(relation.CONSTRAINT_NAME)
  }));

  return { tables, relations };
}

export async function getHealth(): Promise<DbHealth> {
  const mode = databaseMode();
  if (mode === "demo") return { ...demoHealth, checkedAt: new Date().toISOString() };

  if (mode === "snapshot") {
    const snapshot = getOciDatabaseSnapshot();
    return {
      connected: true,
      uptimeSeconds: Number(snapshot.health.uptimeSeconds || 0),
      checkedAt: snapshot.generatedAt,
      metrics: [
        { key: "Threads_connected", label: "Connections", value: Number(snapshot.health.threadsConnected || 0) },
        { key: "Threads_running", label: "Running", value: Number(snapshot.health.threadsRunning || 0) },
        { key: "Questions", label: "Queries", value: Number(snapshot.health.questions || 0) },
        { key: "Aborted_connects", label: "Aborted", value: Number(snapshot.health.abortedConnects || 0) }
      ]
    };
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(`SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Connections','Questions','Aborted_connects','Aborted_clients','Bytes_received','Bytes_sent','Uptime')`);
  const map = new Map(rows.map((row) => [String(row.Variable_name), Number(row.Value || 0)]));
  return {
    connected: true,
    uptimeSeconds: map.get("Uptime") || 0,
    checkedAt: new Date().toISOString(),
    metrics: [
      { key: "Threads_connected", label: "Connections", value: map.get("Threads_connected") || 0 },
      { key: "Threads_running", label: "Running", value: map.get("Threads_running") || 0 },
      { key: "Questions", label: "Queries", value: map.get("Questions") || 0 },
      { key: "Aborted_connects", label: "Aborted", value: map.get("Aborted_connects") || 0 }
    ]
  };
}

export async function getTables(): Promise<DbTable[]> {
  return (await getSchema()).tables;
}
