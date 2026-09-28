type SnapshotTable = {
  name: string;
  rows: number;
  dataBytes: number;
  indexBytes: number;
  totalBytes: number;
  engine?: string | null;
  updatedAt?: string | null;
};

type SnapshotColumn = {
  table: string;
  name: string;
  ordinal?: number;
  dataType?: string;
  columnType: string;
  nullable: boolean;
  key?: string;
  extra?: string;
};

type SnapshotRelation = {
  constraint: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

type SnapshotHealth = {
  threadsConnected: number;
  threadsRunning: number;
  connections: number;
  questions: number;
  abortedConnects: number;
  abortedClients: number;
  bytesReceived: number;
  bytesSent: number;
  uptimeSeconds: number;
  note?: string | null;
};

export type OciDatabaseSnapshot = {
  ok: true;
  source: string;
  database: string;
  generatedAt: string;
  server?: { version?: string | null; databaseTime?: string | null };
  overview: {
    tableCount: number;
    approxRows: number;
    dataBytes: number;
    indexBytes: number;
    totalBytes: number;
  };
  tables: SnapshotTable[];
  columns: SnapshotColumn[];
  relations: SnapshotRelation[];
  health: SnapshotHealth;
};

let cachedRaw: string | null = null;
let cachedSnapshot: OciDatabaseSnapshot | null = null;

function snapshotRaw(): string {
  const base64 = process.env.CONTROL_ROOM_DB_SNAPSHOT_B64?.trim();
  if (base64) return Buffer.from(base64, "base64").toString("utf8");
  const json = process.env.CONTROL_ROOM_DB_SNAPSHOT_JSON?.trim();
  if (json) return json;
  throw new Error("Snapshot mode is enabled but no snapshot environment variable is configured.");
}

function assertSnapshot(value: unknown): asserts value is OciDatabaseSnapshot {
  if (!value || typeof value !== "object") throw new Error("OCI database snapshot is not a JSON object.");
  const s = value as Partial<OciDatabaseSnapshot>;
  if (s.ok !== true) throw new Error("OCI database snapshot is not marked healthy.");
  if (!s.database || !s.generatedAt) throw new Error("OCI database snapshot is missing identity fields.");
  if (!s.overview || !Array.isArray(s.tables) || !Array.isArray(s.columns) || !Array.isArray(s.relations) || !s.health) throw new Error("OCI database snapshot is incomplete.");
  if (Number(s.overview.tableCount) !== s.tables.length) throw new Error("OCI database snapshot table count is inconsistent.");
  if (s.tables.length > 0 && s.columns.length === 0) throw new Error("OCI database snapshot columns are unexpectedly empty.");
}

export function getOciDatabaseSnapshot(): OciDatabaseSnapshot {
  const raw = snapshotRaw();
  if (raw === cachedRaw && cachedSnapshot) return cachedSnapshot;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OCI database snapshot JSON is invalid.");
  }
  assertSnapshot(parsed);
  cachedRaw = raw;
  cachedSnapshot = parsed;
  return parsed;
}
