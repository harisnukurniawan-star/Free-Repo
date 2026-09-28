export type DbOverview = {
  connected: boolean;
  mode: "demo" | "direct";
  latencyMs: number | null;
  databaseName: string;
  tableCount: number;
  approximateRows: number;
  dataBytes: number;
  indexBytes: number;
  totalBytes: number;
  activeConnections: number | null;
  checkedAt: string;
  message?: string;
};

export type DbColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  foreign: boolean;
};

export type DbTable = {
  name: string;
  rows: number;
  dataBytes: number;
  indexBytes: number;
  totalBytes: number;
  updatedAt: string | null;
  columns: DbColumn[];
};

export type DbRelation = {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  constraintName: string;
};

export type DbSchema = {
  tables: DbTable[];
  relations: DbRelation[];
};

export type DbHealthMetric = {
  key: string;
  label: string;
  value: number;
};

export type DbHealth = {
  connected: boolean;
  uptimeSeconds: number;
  metrics: DbHealthMetric[];
  checkedAt: string;
};
