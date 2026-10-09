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

## Private videos on OCI Batam (staged / opt-in)

**Production remains on the existing browser mode until an administrator provisions OCI and explicitly sets `AI_ROOM_STORAGE_MODE=oci`.** This branch does not create a bucket or modify existing customer videos. Do not enable it before testing with a non-sensitive sample. OCI Object Storage has no automatic expiration configured by this code; users retain their files until Delete.

1. Create a **private** Object Storage bucket named `ai-room-private-videos` in **ap-batam-1**. Block all public bucket access and avoid bucket/object lifecycle expiry policies. Keep the bucket in the correct OCI compartment; verify it is accessible to the chosen IAM user. OCI encrypts objects at rest by default.
2. Create a narrowly scoped OCI IAM user/policy for only the intended bucket with access to read/write/list/delete video objects and job/usage metadata. Create its *Customer Secret Key* (S3-compatible access ID and secret). Do not store it in GitHub or browser.
3. Set `AI_ROOM_OCI_NAMESPACE`, `AI_ROOM_OCI_BUCKET`, `AI_ROOM_OCI_ACCESS_KEY_ID`, `AI_ROOM_OCI_SECRET_ACCESS_KEY` in Vercel server-side **sensitive** environment variables, with distinct secrets for production versus previews. The adapter uses the **path-style S3 compatibility endpoint in Batam**, not the HeatWave database.
4. Create `AI_ROOM_SESSION_SECRET` using a cryptographically random 32+ byte value. Create individual user credentials as salted scrypt hashes (never plaintext):
   ```bash
   node -e 'const {randomBytes,scryptSync}=require("node:crypto");const salt=randomBytes(16).toString("hex");const pw=process.argv[1];if(!pw||pw.length<16)throw Error("Use 16+ characters");console.log(JSON.stringify({id:"owner_a",salt,passwordHash:scryptSync(pw,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex")}))' 'REPLACE_WITH_A_LONG_UNIQUE_PASSWORD'
   ```
   Place one or more resulting records in the JSON array `AI_ROOM_USERS_JSON`. In private mode, user login creates a 24-hour signed HttpOnly, Secure, SameSite=Strict cookie. The operator key is NOT distributed to browsers in this mode.
5. Only after OCI bucket, credentials, and preview smoke test work, set `AI_ROOM_STORAGE_MODE=oci` in a **preview environment first**. Sign in as one user; generate a **non-sensitive** video; ensure Gallery, owner-only status, download, and Delete work. Check a second user receives HTTP 404 for the first user's job. Confirm the **OCI object is actually removed** after Delete.
6. Production rollout requires a separate, reviewed release. Existing browser `localStorage` links/history are not automatically migrated; back up important old MP4s *before* switching. Do not publish previously generated provider URLs.

### Behavior and security boundaries

- **Provider-privacy release gate:** the source result hosted by fal.ai may remain reachable via its original bearer URL even after OCI import. Never assume storing a private OCI copy makes the original fal file private or deletes it. Verify fal.ai media access/retention settings (or a supported provider-side deletion path) before processing sensitive/identifiable videos. OCI-only controls protect only the OCI copy.\n- Completed fal.ai output is copied **server-to-server** to OCI Object Storage. The server accepts only HTTPS files hosted on a `fal.media` subdomain and refuses redirects, unknown length, non-video content, or payloads over 250 MiB. Any import failure stays retryable and never exposes the provider video URL in the private API.
- Videos and prompts are stored in private OCI objects scoped by authenticated user. Gallery data comes from OCI, **not localStorage**. 5-minute signed HTTPS URLs are returned only after owner authentication. Backup/Download gets a fresh signed URL on each click.
- Delete replaces the private job metadata with a minimal tombstone and removes its MP4. Small tombstones and the per-day usage ledger remain to prevent accidental resurrection and quota evasion. OCI retention is otherwise indefinite; configure storage/cost alerts and monitor capacity. Deleting from OCI does **not** guarantee immediate deletion from fal.ai's own retention systems.
- Authenticated users are limited to 5 chargeable generations per UTC day by default. The OCI-backed count is a **best-effort quota**, not an atomic rate limiter, so it is suitable only for a trusted small user group. For open public signup, add a transactional quota reservation + global login throttling/WAF before release.
- Generation and status routes stay unchanged when `AI_ROOM_STORAGE_MODE` is unset/`browser`. The private UI intentionally does not load old local browser history to avoid mixing identities. Never turn on public Object Storage access to fix a signed-URL issue.
- A serverless status request may take up to 300s to relay video to OCI; failures remain retriable. Live fal inference costs are not covered by unit tests.

### Rollback

**Before activation:** revert `AI_ROOM_STORAGE_MODE` to `browser` or remove it, then redeploy the prior production commit. This restores the original browser-based UI without migrating/deleting OCI data. **After activation:** retain OCI bucket and secrets; disable the flag first, then rollback the deployment if necessary. Do not delete the bucket during rollback. Note: browser mode does not display video jobs created only in OCI; restoring private mode recovers them.
