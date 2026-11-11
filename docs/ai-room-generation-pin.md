# AI ROOM — Generation PIN (draft rollout)

Purpose: keep fal.ai credentials and authorization in the server; users enter a short numeric activation PIN rather than a long access key. This is a **second factor for paid generation**, not a substitute for private OCI account login.

## Safety model

- **Disabled by default.** Existing production authorization remains unchanged unless `AI_ROOM_GENERATION_PIN_ENABLED=true`.
- PIN is 8–12 digits; Vercel receives **only its scrypt hash and salt**, never the cleartext PIN. Do not send PINs, hashes, or token values to chat, GitHub, PR comments, screenshots, or logs.
- Paid generation request verifies a signed, 8-hour HttpOnly / Secure / SameSite=Strict cookie **on the server**. It is bound to private account ID when OCI mode is active; logging out clears it. Browser localStorage and sessionStorage do not contain the PIN.
- Every activation is limited via a **shared Redis REST atomic Lua script**, with at most 5 attempts per IP/user per 15-minute window and 60 total attempts per 15-minute window. The global cap is conservative: under attack, legitimate activations may temporarily be blocked.
- Every chargeable request also consumes a shared daily allowance before calling fal.ai (default 5 per account per UTC day, and a shared allowance for non-account browser mode). This is an upper limit on requests attempted, not guaranteed spending accounting; rejected provider jobs can consume an allowance. Existing private OCI quota still applies.
- Invalid/expired cookie, missing Redis, invalid PIN configuration, cross-origin mutation, and exceeded quota all fail closed. PIN cannot be bypassed using the legacy access-key header **while PIN mode is enabled**.
- Provider key `AI_ROOM_FAL_KEY` stays server-side. OCI remains private when enabled.

## Configure Preview first

In the Vercel **Preview** environment, configure:

```text
AI_ROOM_GENERATION_PIN_ENABLED=true
AI_ROOM_GENERATION_PIN_HASH=<128-character scrypt hex>
AI_ROOM_GENERATION_PIN_SALT=<random 32-character hex>
AI_ROOM_GENERATION_PIN_SESSION_SECRET=<random 32+ character secret>
AI_ROOM_PIN_REDIS_URL=<your HTTPS Redis REST endpoint>
AI_ROOM_PIN_REDIS_TOKEN=<your Redis REST token>
AI_ROOM_PIN_DAILY_LIMIT=5
```

Use a dedicated Redis REST database with EVAL support. The server validates its config before unlocking. Prefer using an operator-managed Upstash Redis instance with data access scoped to the application. **Do not add `NEXT_PUBLIC_`** to any secret.

Generate the hash and session signing key **on a trusted local terminal**, not in ChatGPT. This script prompts without displaying your PIN:

```bash
python3 - <<'PY'
from getpass import getpass
from secrets import token_hex, token_urlsafe
from hashlib import scrypt
pin = getpass("Choose a private 8-12 digit PIN: ")
if not (8 <= len(pin) <= 12 and pin.isascii() and pin.isdigit()):
    raise SystemExit("PIN must contain 8-12 ASCII digits.")
salt = token_hex(16)
print("AI_ROOM_GENERATION_PIN_SALT=" + salt)
print("AI_ROOM_GENERATION_PIN_HASH=" + scrypt(pin.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex())
print("AI_ROOM_GENERATION_PIN_SESSION_SECRET=" + token_urlsafe(48))
PY
```

Copy the resulting values only into Vercel sensitive environment variables; never commit them. Rotate signing secret to revoke every existing PIN session.

## Smoke tests and rollback

1. Keep Production unchanged while testing Preview.
2. Without activation, direct `POST /api/ai-room/generate` returns HTTP 401. Old `x-ai-room-access-key` does not bypass PIN.
3. Wrong PIN returns 401, 6th attempt per address returns 429 (try only on a disposable Redis/test scope).
4. Correct PIN issues HttpOnly cookie; `GET /api/ai-room/generation-pin` reports `active: true` but never returns the PIN or secret.
5. Confirm another private account cannot reuse a PIN session and logout clears authorization.
6. Use a **mock provider** for authorization regression tests. Only attempt an actual paid generation after confirming account quota, provider balance, and operator approval.

Rollback: set `AI_ROOM_GENERATION_PIN_ENABLED=false` in the affected Vercel environment and redeploy. For browser mode, the legacy `AI_ROOM_GENERATE_ACCESS_KEY` remains the fallback until migration is finalized. Do not disable OCI private-storage authorization to roll back the PIN.
