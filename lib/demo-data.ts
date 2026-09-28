import type { DbHealth, DbOverview, DbSchema } from "@/types/database";

const mb = 1024 * 1024;

export const demoSchema: DbSchema = {
  tables: [
    { name: "employees", rows: 18410, dataBytes: 32 * mb, indexBytes: 10 * mb, totalBytes: 42 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "employee_code", type: "varchar(32)", nullable: false, primary: false, foreign: false },
      { name: "name", type: "varchar(160)", nullable: false, primary: false, foreign: false },
      { name: "department_id", type: "bigint", nullable: true, primary: false, foreign: true },
      { name: "position_id", type: "bigint", nullable: true, primary: false, foreign: true },
      { name: "status", type: "varchar(24)", nullable: false, primary: false, foreign: false }
    ]},
    { name: "departments", rows: 84, dataBytes: 2 * mb, indexBytes: 0.6 * mb, totalBytes: 2.6 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "name", type: "varchar(120)", nullable: false, primary: false, foreign: false }
    ]},
    { name: "positions", rows: 312, dataBytes: 4.2 * mb, indexBytes: 1.1 * mb, totalBytes: 5.3 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "name", type: "varchar(120)", nullable: false, primary: false, foreign: false }
    ]},
    { name: "attendance", rows: 192340, dataBytes: 252 * mb, indexBytes: 74 * mb, totalBytes: 326 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "employee_id", type: "bigint", nullable: false, primary: false, foreign: true },
      { name: "check_in", type: "datetime", nullable: true, primary: false, foreign: false },
      { name: "check_out", type: "datetime", nullable: true, primary: false, foreign: false }
    ]},
    { name: "evidence", rows: 92822, dataBytes: 205 * mb, indexBytes: 31 * mb, totalBytes: 236 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "employee_id", type: "bigint", nullable: false, primary: false, foreign: true },
      { name: "storage_key", type: "varchar(255)", nullable: false, primary: false, foreign: false }
    ]},
    { name: "users", rows: 18410, dataBytes: 28 * mb, indexBytes: 12 * mb, totalBytes: 40 * mb, updatedAt: new Date().toISOString(), columns: [
      { name: "id", type: "bigint", nullable: false, primary: true, foreign: false },
      { name: "employee_id", type: "bigint", nullable: true, primary: false, foreign: true },
      { name: "username", type: "varchar(80)", nullable: false, primary: false, foreign: false }
    ]}
  ],
  relations: [
    { id: "employees-department", fromTable: "employees", fromColumn: "department_id", toTable: "departments", toColumn: "id", constraintName: "fk_employee_department" },
    { id: "employees-position", fromTable: "employees", fromColumn: "position_id", toTable: "positions", toColumn: "id", constraintName: "fk_employee_position" },
    { id: "attendance-employee", fromTable: "attendance", fromColumn: "employee_id", toTable: "employees", toColumn: "id", constraintName: "fk_attendance_employee" },
    { id: "evidence-employee", fromTable: "evidence", fromColumn: "employee_id", toTable: "employees", toColumn: "id", constraintName: "fk_evidence_employee" },
    { id: "users-employee", fromTable: "users", fromColumn: "employee_id", toTable: "employees", toColumn: "id", constraintName: "fk_users_employee" }
  ]
};

const dataBytes = demoSchema.tables.reduce((a, t) => a + t.dataBytes, 0);
const indexBytes = demoSchema.tables.reduce((a, t) => a + t.indexBytes, 0);

export const demoOverview: DbOverview = {
  connected: true, mode: "demo", latencyMs: 42, databaseName: "oci_control_room_demo",
  tableCount: demoSchema.tables.length,
  approximateRows: demoSchema.tables.reduce((a, t) => a + t.rows, 0),
  dataBytes, indexBytes, totalBytes: dataBytes + indexBytes, activeConnections: 7,
  checkedAt: new Date().toISOString(), message: "Demo mode — add OCI credentials to switch to live metadata."
};

export const demoHealth: DbHealth = {
  connected: true, uptimeSeconds: 1569600, checkedAt: new Date().toISOString(),
  metrics: [
    { key: "Threads_connected", label: "Connections", value: 7 },
    { key: "Threads_running", label: "Running", value: 2 },
    { key: "Questions", label: "Queries", value: 3840240 },
    { key: "Aborted_connects", label: "Aborted", value: 3 }
  ]
};
