#!/usr/bin/env bash
# Run in OCI Cloud Shell (already authenticated), not on production Vercel.
# Idempotently create or inspect a private Standard bucket in Batam.
set -euo pipefail
REGION="ap-batam-1"
BUCKET="${AI_ROOM_OCI_BUCKET:-ai-room-private-videos}"
COMPARTMENT="${OCI_COMPARTMENT_ID:-}"
if ! command -v oci >/dev/null; then
  echo "OCI CLI not installed. Run from authenticated OCI Cloud Shell." >&2; exit 2
fi
if [[ ! "$COMPARTMENT" =~ ^ocid1\.(compartment|tenancy)\. ]]; then
  echo "Set OCI_COMPARTMENT_ID in your Cloud Shell to the intended compartment OCID." >&2; exit 2
fi
if [[ ! "$BUCKET" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,126}$ ]]; then
  echo "Invalid bucket name" >&2; exit 2
fi
NAMESPACE="$(oci os ns get --region "$REGION" --query data --raw-output)"
if [[ -z "$NAMESPACE" || "$NAMESPACE" == "null" ]]; then
  echo "Unable to resolve OCI Object Storage namespace" >&2; exit 3
fi
# Abort on IAM/network errors; only create if OCI explicitly reports a missing bucket.
ERR_FILE="$(mktemp)"
trap 'rm -f "$ERR_FILE"' EXIT
if oci os bucket get --region "$REGION" --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" >/dev/null 2>"$ERR_FILE"; then
  echo "Bucket already exists; inspecting instead of modifying it."
elif grep -Eq 'BucketNotFound|NotFound|404' "$ERR_FILE"; then
  echo "Creating new private bucket in $REGION (no public access, no object versioning)."
  oci os bucket create --region "$REGION" --compartment-id "$COMPARTMENT" \
    --namespace-name "$NAMESPACE" --name "$BUCKET" \
    --public-access-type NoPublicAccess --storage-tier Standard --versioning Disabled >/dev/null
else
  echo "Bucket inspection failed (permissions or connectivity). No bucket created." >&2
  exit 3
fi
META="$(oci os bucket get --region "$REGION" --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" --output json)"
# Fail closed for settings that could expose copies or undermine owner deletion.
printf '%s' "$META" | OCI_EXPECTED_COMPARTMENT="$COMPARTMENT" OCI_EXPECTED_BUCKET="$BUCKET" python3 -c '
import json,os,sys
data=json.load(sys.stdin)["data"]
checks={
  "bucket name": data.get("name")==os.environ["OCI_EXPECTED_BUCKET"],
  "compartment": data.get("compartment-id")==os.environ["OCI_EXPECTED_COMPARTMENT"],
  "no public access": data.get("public-access-type")=="NoPublicAccess",
  "standard tier": data.get("storage-tier")=="Standard",
  "versioning disabled": data.get("versioning")=="Disabled",
  "no lifecycle deletion": data.get("object-lifecycle-policy-etag") is None,
  "no replication": data.get("replication-enabled") is False,
  "not read-only": data.get("is-read-only") is False,
}
for label, passed in checks.items():
  print(("PASS" if passed else "FAIL")+": "+label)
if not all(checks.values()):
  print("STOP: Unsafe/unverified bucket state. Do not enable private AI ROOM.",file=sys.stderr)
  sys.exit(4)
print("Bucket privacy preflight PASS. Retain these settings until production cutover.")
'
echo "Region: $REGION"
echo "OCI namespace: $NAMESPACE"
echo "Bucket: $BUCKET"
echo "Next: configure a dedicated least-privilege Customer Secret Key in Vercel Preview."
echo "After an authenticated disposable upload/read/delete probe succeeds, set AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED=true only in the tested environment."
