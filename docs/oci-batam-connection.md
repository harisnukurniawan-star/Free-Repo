# AI ROOM – OCI Object Storage Batam connection (Preview only)

**Status:** deployment code prepared; no claim of connection until live storage verification succeeds.
Target: region `ap-batam-1`, private Standard bucket `ai-room-private-videos`, owner-only access, user-initiated deletion/download.

## 1. Create/check the bucket in OCI (Cloud Shell)

Open the OCI Console in the Batam region and launch authenticated Cloud Shell.
Use a dedicated OCI compartment for AI ROOM storage. With the repository checked out on the security preview branch, run:

```bash
export OCI_COMPARTMENT_ID="ocid1.compartment.oc1..your-compartment-id"
bash scripts/oci-private-bucket-prepare.sh
```

This script creates the bucket if absent and verifies: correct compartment, private (`NoPublicAccess`), Standard and versioning Disabled. If a bucket already exists, it **does not modify** it. The script stops if the compartment differs, versioning is enabled, or public access is enabled. Keep Object Storage's default encryption.

The script also rejects lifecycle expiry and replication; a failed read never triggers bucket creation. It prints the OCI namespace; it does **not** generate or reveal a Customer Secret Key. Never paste credentials into source code, PRs or chat.

## 2. Create a dedicated app principal / customer secret key

In OCI, create a **dedicated AI ROOM storage user** with only Object Storage permissions required for the assigned bucket; scope IAM policies to the chosen compartment/bucket wherever supported. Grant inspect/list and object read/write/delete as needed for private gallery, transfer, delete and usage quota operations. Avoid tenancy-wide administrator permissions.

Under the user's **Customer Secret Keys**, generate a new key. The secret is displayed only at creation. Keep the access and secret halves in your password manager or store them directly in Vercel's encrypted environment-variable UI.

OCI's S3-compatible API uses a regional namespace endpoint; code in this repository uses path-style URLs in `ap-batam-1`. No public endpoint or pre-authenticated public link is required.

## 3. Configure Vercel Preview only

Vercel project: `ai-room`, team `ai-team-chat`. Under **Settings → Environment Variables**, add these keys for **Preview only**, ideally scoped to the reviewed security preview branch:

| Variable | Value / purpose |
| --- | --- |
| `AI_ROOM_OCI_NAMESPACE` | Namespace returned by the OCI Cloud Shell script |
| `AI_ROOM_OCI_BUCKET` | `ai-room-private-videos` |
| `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED` | `false` until **both** the bucket preflight and disposable S3 probe pass; then explicitly set `true` in Preview only |
| `AI_ROOM_OCI_ACCESS_KEY_ID` | Dedicated Customer Secret Key access key |
| `AI_ROOM_OCI_SECRET_ACCESS_KEY` | Dedicated Customer Secret Key secret |
| `AI_ROOM_SESSION_SECRET` | Random 32+ byte secret (generate securely and store only in Vercel) |
| `AI_ROOM_USERS_JSON` | Dedicated user identities with salted scrypt hash, not plaintext passwords |
| `AI_ROOM_STORAGE_MODE` | **Initially leave unset**; change to `oci` **only after** all preceding values are configured |
| `AI_ROOM_ENABLE_MATURE_MODE` | `false` until independent age assurance, moderation and approval are complete |
| `AI_ROOM_MATURE_USER_ALLOWLIST` | Leave blank before review |

Do not change Production variables. Vercel Preview deployment must be rebuilt after variables change. Production continues in legacy `browser` mode.

**Important:** `AI_ROOM_STORAGE_MODE=oci` switches the entire AI ROOM preview UI into the private-account version. An invalid bucket key, malformed `AI_ROOM_USERS_JSON`, or missing privacy-verification flag will fail closed.

## 4. Run the isolated storage preflight

The script requires its explicit `--probe` argument and uses a randomly named tiny object under `healthchecks/`. It tests authenticated upload, exact readback, **anonymous-access denial**, deletion and post-delete 404. It always attempts cleanup on failure, and never logs secrets.

Run from an approved secure environment with the same **Preview** variables loaded through your team's secure deployment process (not through command-line arguments):

```bash
node scripts/verify-oci-storage.mjs --probe
```

`AI_ROOM_STORAGE_MODE=oci` must be set in that environment. **No paid fal.ai video generation is involved.** A successful build alone does *not* prove OCI is connected.

## 5. Security smoke tests before any merge

- Login as owner A and owner B independently; owner B cannot list, preview, download, delete or query owner A's jobs, even with A's job ID.
- Upload one **non-sensitive**, minimal-cost video in Preview. Confirm video is copied to the private OCI bucket. Check signed playback / download URL expires and does not appear in browser localStorage.
- Delete that video and verify OCI object is removed, not just the gallery row. Check the deletion tombstone prevents resurrection after retries.
- Confirm quota behavior and that retrying after an ambiguous paid submission cannot double-charge.
- Confirm no bucket public access, no public pre-authenticated URLs, no accidental test data in Production.

## Rollback / recovery

First, keep mature mode disabled. If preview private mode breaks, set `AI_ROOM_STORAGE_MODE=browser` on **Preview**, redeploy, and preserve the bucket and every owner's data. Never delete the bucket as part of rollback. Record any orphaned `healthchecks/` object for cleanup. Retain OCI access for owners' backup/download while completing repair.

### Verification log

- GitHub build / unit tests: run under PR CI
- OCI bucket exists / privately configured: **not yet verified** (privacy verification flag must remain false)
- OCI signed upload, anonymous denial, delete: **not yet verified**
- End-to-end private video: **not yet verified**

References: Oracle Object Storage S3 Compatibility API, OCI CLI bucket create/get documentation.
