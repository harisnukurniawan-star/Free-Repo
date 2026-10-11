# AI ROOM — OCI Native Object Storage (Batam), staged rollout

## Confirmed facts

- Region: `ap-batam-1`
- Namespace: `axf1xcjq8gsy`
- Bucket: `ai-room-private-videos` in compartment `ai-room-storage`
- Bucket Cloud Shell preflight **PASS**: NoPublicAccess, Standard, no versioning, no lifecycle deletion, no replication, correct compartment, writable.
- Existing tenancy **S3 Compatibility designated compartment = tenancy root**, different from AI ROOM. **DO NOT CHANGE** it.
- This PR targets **OCI Native API** using OCI IAM API key signing, not Customer Secret Keys or S3-compatible URLs.
- Environment: stage Preview ONLY. Production browser mode and Mature disabled.

## 1. Create dedicated OCI IAM app user and group

In OCI Console > Identity & Security > Domains > Default > Users, create a **dedicated native-IAM app user** named `ai-room-storage-app`. Do not use the personal OCI administrator identity to sign application calls.

Create a group `ai-room-storage-apps` in the same identity domain and add the app user. Create **minimal policies** in the correct root/parent policy location that scope object access exclusively to the new compartment and named bucket; OCI domain-qualified group names vary by identity domain. As a policy starting point, have an OCI administrator review:

```text
Allow group 'Default'/'ai-room-storage-apps' to read buckets in compartment ai-room-storage where target.bucket.name = 'ai-room-private-videos'
Allow group 'Default'/'ai-room-storage-apps' to manage objects in compartment ai-room-storage where target.bucket.name = 'ai-room-private-videos'
```

Do not grant `manage all-resources`, `manage buckets`, or tenancy-wide privileges to the app user. Test the actual operations before enabling AI ROOM; bucket names and policy syntax must match your tenancy's identity-domain setup.

## 2. Create a dedicated OCI API signing key

Generate an RSA API signing key pair for the app user. For example in an approved secure machine/OCI Cloud Shell:

```bash
umask 077
mkdir -p ~/.oci
openssl genrsa -out ~/.oci/ai-room-native.pem 2048
openssl rsa -in ~/.oci/ai-room-native.pem -pubout -out ~/.oci/ai-room-native-public.pem
chmod 600 ~/.oci/ai-room-native.pem
```

Upload **only** `ai-room-native-public.pem` to that OCI user's API Keys. Copy the **fingerprint**, user OCID and tenancy OCID from OCI Console.

Keep `ai-room-native.pem` private. Never commit, paste into chat, share a screenshot of it, or place it in client-side Next.js variables. Enter it into Vercel directly as an encrypted/sensitive value. OCI Cloud Shell can be used for initial testing but the key should have a secure owner/back-up/rotation procedure.

## 3. Vercel Preview variables (branch feature/ai-room-oci-native-storage)

Project `ai-room`, team `ai-team-chat`. Settings > Environment Variables > **Preview**, restrict to this specific branch.

| Key | Value / instruction |
| --- | --- |
| `AI_ROOM_OCI_DRIVER` | `native` |
| `AI_ROOM_OCI_NAMESPACE` | `axf1xcjq8gsy` |
| `AI_ROOM_OCI_BUCKET` | `ai-room-private-videos` |
| `AI_ROOM_OCI_TENANCY_ID` | Tenancy OCID (secure Vercel Preview) |
| `AI_ROOM_OCI_USER_ID` | Dedicated app user OCID |
| `AI_ROOM_OCI_KEY_FINGERPRINT` | Fingerprint matching OCI API Keys |
| `AI_ROOM_OCI_PRIVATE_KEY` | Private PEM, multi-line or with literal `\\n` separators |
| `AI_ROOM_OCI_KEY_PASSPHRASE` | Optional if RSA PEM is encrypted |
| `AI_ROOM_SESSION_SECRET` | Random 32+ character secret, distinct from OCI credentials |
| `AI_ROOM_USERS_JSON` | Per-user scrypt password hashes; do NOT enter plaintext passwords |
| `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED` | Remain `false` until bucket audit and native probe both pass |
| `AI_ROOM_STORAGE_MODE` | Remain `browser` until completed and verified |
| `AI_ROOM_ENABLE_MATURE_MODE` | Keep `false` |

The six non-secret / safety variables (`AI_ROOM_OCI_DRIVER`, `AI_ROOM_OCI_NAMESPACE`, `AI_ROOM_OCI_BUCKET`, `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED`, `AI_ROOM_STORAGE_MODE`, and `AI_ROOM_ENABLE_MATURE_MODE`) are already staged to Vercel Preview on this branch. **Do not create new overriding global Preview values.**

## 4. Test the dedicated user through OCI Native API

After the same dedicated API signing key is available in your **secure** environment, load these values without pasting secrets into command arguments. Run from the cloned branch with dependencies installed:

```bash
npm install
node scripts/verify-oci-native.mjs --probe
```

The script uses a random disposable object inside `usage/nativeprobe/`. It tests `getBucket` privacy, `putObject`, exact `getObject` readback, `listObjects`, anonymous-read denial, and `deleteObject` + absence after delete. It uses OCI Native SDK, **not S3 compatibility**. It attempts cleanup even if a check fails.

Only after **all** these tests pass:
1. Set `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED=true` for this branch's **Preview only**.
2. Configure secure `AI_ROOM_USERS_JSON` and session secret.
3. Set `AI_ROOM_STORAGE_MODE=oci` in Preview, redeploy.
4. Smoke test two users: owner A can preview/download/delete own video; owner B cannot read A's ID; compare byte ranges; ensure cache/no-store; verify OCI deletion and no resurrection.
5. Produce one non-sensitive low-cost video. Confirm completed MP4 uploads without truncation, provider copy privacy, and gallery persistence across browser sessions.
6. **Review potential per-request bandwidth and OCI egress cost** of proxy streaming before production. OCI Native mode deliberately streams through Vercel, rather than exposing a shareable 5-minute presigned S3 link.
7. Do not activate Mature mode until independent age assurance and moderation are implemented.

## Rollback

Set `AI_ROOM_STORAGE_MODE=browser` in Preview, redeploy. Keep `AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED=false` until re-audited. Do not delete the bucket or owner files. The new provider coexists with the old S3 adapter for recovery. Production must remain unchanged until an explicit reviewed merge/cutover.

## Unverified / not yet complete

- User app IAM principal and actual dedicated OCI Native signing key.
- Live storage API key probe, multi-account isolation against the real OCI bucket.
- Vercel preview OCI authentication and end-to-end generation test.
- Provider-side fal video deletion/retention guarantees.
- Distributed atomic reservation/rate-limiting and paid-job recovery after failures.

Reference: Oracle Cloud Infrastructure TypeScript Object Storage SDK (`oci-common`, `oci-objectstorage`), and OCI IAM Object Storage policy guidance.
