# AI ROOM — OCI private video Production cutover

**Status:** runbook only. No Production bucket, key, or env flags are created by committing this file.

**Scope:** AI ROOM on `harisnukurniawan-star/Free-Repo` and the Vercel `ai-room` project. Do not apply these settings to Internal Task Manager, Hasnaria, or HC Connect.

## Principles / preflight

- Production runs in OCI Batam (`ap-batam-1`) with its **own private bucket, OCI IAM service user, API signing key, Vercel session secret and account hashes**, separate from Preview.
- Never set a public bucket policy or pre-authenticated request (PAR). No automatic object expiry. Keep versioning disabled if deletion must remove the stored video immediately.
- The original fal.ai media link can have an independent retention period; storing in OCI does not revoke that link.
- Before cutover, confirm the previous browser-based videos are downloaded if they need to be preserved. Browser history is **not** migrated automatically.
- Do not enable Mature 18+ as part of storage migration; its provider and age gates are separate.

## 1. Bucket and dedicated identity (OCI Cloud Shell)

Use OCI Cloud Shell with a sufficiently authorized administrator. Select and verify the intended compartment; do not paste OCIDs or private keys in GitHub/issues/chat.

```bash
export OCI_COMPARTMENT_ID="<OCI compartment OCID>"
bash scripts/oci-production-bucket-prepare.sh
```

The script prepares **`ai-room-private-videos-prod`** (not Preview's `ai-room-private-videos`), checks `NoPublicAccess`, Standard tier, no versioning, lifecycle deletion or replication, and refuses unsafe existing configuration. The application also **enforces this Production bucket name at runtime**, so setting a Preview bucket name cannot silently redirect Production Gallery operations. Do not set `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED=true` merely because the bucket exists.

Create a **dedicated Production OCI IAM user and group** with object read/list/write/delete rights restricted to that bucket and, only if required, bucket-inspection rights. A policy pattern, after substituting the *real OCI group and compartment* and reviewing against Oracle IAM guidance:

```text
Allow group <AI_ROOM_PROD_GROUP> to manage objects in compartment <COMPARTMENT_NAME> where target.bucket.name='ai-room-private-videos-prod'
Allow group <AI_ROOM_PROD_GROUP> to read buckets in compartment <COMPARTMENT_NAME> where target.bucket.name='ai-room-private-videos-prod'
```

Avoid broad `manage object-family` across the tenancy. Apply policy and wait for propagation before testing access. Create an **OCI API signing key pair** specifically for this user and store the PEM and fingerprint in the approved secret manager. Do not reuse the Preview signer. The Native OCI driver does **not** use a Customer Secret Key.

## 2. Configure Vercel Production (secrets only, not yet activated)

In the single correct Vercel project (`ai-room`), create environment variables **targeted to Production only**. Keep all sensitive values server-side, never `NEXT_PUBLIC_`:

| Variable | Value or verification |
|---|---|
| `AI_ROOM_OCI_DRIVER` | `native` |
| `AI_ROOM_OCI_NAMESPACE` | Namespace returned by OCI in Batam (not a secret) |
| `AI_ROOM_OCI_BUCKET` | `ai-room-private-videos-prod` |
| `AI_ROOM_OCI_TENANCY_ID` | Production IAM tenancy OCID |
| `AI_ROOM_OCI_USER_ID` | Dedicated Production signer user OCID |
| `AI_ROOM_OCI_KEY_FINGERPRINT` | Fingerprint attached to that OCI user |
| `AI_ROOM_OCI_PRIVATE_KEY` | Sensitive PEM for matching Production API signing key |
| `AI_ROOM_SESSION_SECRET` | Sensitive random value, minimum 32 bytes; **different from Preview** |
| `AI_ROOM_USERS_JSON` | Sensitive JSON array of individual, salted-scrypt-hashed user records |
| `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED` | Set `true` only after the bucket/IAM/live read-write-delete and anonymous-denial checks pass |
| `AI_ROOM_OCI_PRODUCTION_APPROVED` | Set `true` **only as the final operator approval**; new server gate requires this AND Native driver |
| `AI_ROOM_STORAGE_MODE` | **Leave unset / `browser` until the final cutover** |
| `AI_ROOM_ENABLE_MATURE_MODE` | Unset / `false`; this is not part of the storage release |

`AI_ROOM_VIDEO_PROVIDER` and `AI_ROOM_FAL_KEY` remain as-is. Do not change them during storage cutover.

To create an account's hashed password record securely, follow the non-echoing local command in the README; do **not** paste passwords into Vercel logs, GitHub issues, or chat.

## 3. Gate test / no paid video generation

From a secure environment with the Production-only signing credentials, run the existing `scripts/verify-oci-native.mjs --probe` using the **Production bucket**. It creates one uniquely named disposable JSON object, checks exact readback/list, anonymous GET denial, and deletion. It is not a video generation request and does not consume fal.ai credits. Capture **only** PASS/FAIL and non-secret diagnostics; ensure the temporary object is gone.

Next: verify both accounts can log in to the separate private UI once the cutover is explicitly enabled, and verify each owner sees only their own Gallery. API calls for an unrelated owner's job, stream, download and delete must be denied (404). Verify no raw object names appear in application logs. Test a **preexisting, non-sensitive, authorized** video for playback/download/delete if available; do not submit a new paid generation request merely for this gate.

No user videos are present in the tested Preview Gallery: the last inspected record is a deletion tombstone. Do not treat that as evidence about the separate Production bucket.

## 4. Switch and rollback

1. Record the currently working Vercel Production deployment and Git commit as the rollback target. Back up any browser-mode MP4s first.
2. Verify Production environment variables are present and distinct from Preview (use key names/metadata, not decrypted contents).
3. Set `AI_ROOM_OCI_PRODUCTION_APPROVED=true` only after the dedicated credentials and signed-API probe pass.
4. Set `AI_ROOM_STORAGE_MODE=oci` in Production and redeploy. Check `/api/ai-room/health`: `storageMode=oci`, `storageReady=true`. Note: that is a configuration check, **not** a proof of live OCI connectivity.
5. Authenticate owner A and owner B, confirm Gallery, failed/empty states, owner separation, range playback/download if a suitable video exists, Delete with a disposable object and service-side deletion verification. Check any provider retention separately.
6. If any gate fails, **remove/set `AI_ROOM_STORAGE_MODE=browser` first and redeploy** (restore prior working UI). Keep the Production bucket and credentials intact; never delete the bucket during rollback. A browser-mode rollback will not display videos created only in OCI; re-enable private mode to recover them.

## Release criteria

- OCI API signing works in Production's own identity and compartment.
- Private bucket and anonymous access rules independently verified.
- Signed list, write, read and delete succeed; disposable object removed.
- Authenticated private Gallery returns correctly; multiple owners are isolated.
- No raw OCI retry traces, keys, prompts or object paths in logs.
- GitHub CI tests, lint, Vercel Preview build and Production health check pass.
- Only then switch storage; do not interpret a 200 health status as proof of a successful end-to-end video import.
