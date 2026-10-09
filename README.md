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

## AI ROOM video generation security

The AI ROOM interface runs at `/ai-room`. Its public browser UI does **not** grant permission to spend fal.ai credits. All chargeable `POST /api/ai-room/generate` requests now require a server-configured access key; requests without a matching header are rejected **before** any provider call.

1. Set `AI_ROOM_VIDEO_PROVIDER=fal` and `AI_ROOM_FAL_KEY` on the **server** only.
2. Generate a unique random value (recommended 32+ characters), for example `openssl rand -hex 24`.
3. Set `AI_ROOM_GENERATE_ACCESS_KEY` to this value in Vercel Production and Preview environment variables; redeploy each environment. Never use the fal.ai API key as the AI ROOM access key.
4. Enter the same value in the browser's **Generation access key** field. It stays in that tab's `sessionStorage`, not in URLs, stored jobs, or `NEXT_PUBLIC_*` variables.
5. If the environment key is missing or under 16 characters, paid generation is deliberately **locked**. Existing read-only status checks and browser history remain accessible.

This single shared key is intended only for a private/small-team app. For a public multi-user app, add per-user authentication, durable quotas, audited usage, and a central rate limiter before opening the Generate endpoint. Rate-card estimates are not fal.ai balances or invoices. No live paid generation is performed by automated tests.
