# Control Room

Personal operations dashboard. V1 focuses only on **OCI / MySQL Database visibility**.

## V1
- Blue-black control-room UI
- Connection status and database footprint
- Table count and approximate row count
- Interactive Railway-style relational schema map
- Table details and relationship highlighting
- Top tables by size
- Data vs index composition
- Server health
- Read-only metadata queries
- Demo fallback when OCI credentials are not configured

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/database`.

## OCI connection

Set:

```env
CONTROL_ROOM_DB_MODE=direct
OCI_DB_HOST=...
OCI_DB_PORT=3306
OCI_DB_NAME=...
OCI_DB_USER=...
OCI_DB_PASSWORD=...
OCI_DB_SSL=true
```

Use a dedicated **read-only** MySQL account. The dashboard does not expose write, delete, migration, or SQL-console actions.

> Note: if the HeatWave endpoint is private-only, a public Vercel deployment cannot connect to it directly. In that case keep the UI unchanged and route the server API through an OCI-side gateway/function in the next integration step.

The previous Internal Task Management scaffold is preserved in branch `backup/internal-task-foundation`.
