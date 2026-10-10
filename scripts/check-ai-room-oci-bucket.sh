#!/usr/bin/env bash
# AI ROOM OCI Object Storage bootstrap/preflight (safe: inspect-only by default).
# Requires an authenticated OCI CLI profile that can view/create Object Storage buckets.
set -euo pipefail

REGION="ap-batam-1"
BUCKET="ai-room-private-videos"
ACTION="${1:---check}"
if [[ "$ACTION" != "--check" && "$ACTION" != "--create" ]]; then
  echo "Usage: $0 [--check|--create]" >&2
  exit 2
fi
if ! command -v oci >/dev/null || ! command -v python3 >/dev/null; then
  echo "OCI CLI and Python 3 are required. No changes made." >&2
  exit 2
fi
oci_options=(--region "$REGION")
if [[ -n "${OCI_PROFILE:-}" ]]; then
  oci_options+=(--profile "$OCI_PROFILE")
fi

echo "AI ROOM preflight: region=$REGION bucket=$BUCKET action=$ACTION"
errfile="$(mktemp)"
trap 'rm -f "$errfile"' EXIT

if ! metadata="$(oci os bucket get --bucket-name "$BUCKET" "${oci_options[@]}" --output json 2>"$errfile")"; then
  if [[ "$ACTION" == "--check" ]]; then
    echo "Bucket unavailable, not created. Specify --create only after verifying compartment and OCI access." >&2
    exit 1
  fi
  if ! grep -Eq 'BucketNotFound|NotFound|404' "$errfile"; then
    echo "Bucket inspection failed for a reason other than not-found. No creation attempted." >&2
    exit 1
  fi
  : "${OCI_COMPARTMENT_OCID:?Set OCI_COMPARTMENT_OCID to create bucket.}"
  echo "Creating private, Standard, unversioned bucket in Batam ..."
  oci os bucket create --name "$BUCKET" --compartment-id "$OCI_COMPARTMENT_OCID" \
    --public-access-type NoPublicAccess --storage-tier Standard --versioning Disabled \
    "${oci_options[@]}" --output json >/dev/null
  metadata="$(oci os bucket get --bucket-name "$BUCKET" "${oci_options[@]}" --output json)"
fi

# Never mark a configuration as private without inspecting the actual API response.
METADATA="$metadata" python3 - <<'PY'
import json, os, sys
data=json.loads(os.environ["METADATA"])["data"]
checks={
  "name": (data.get("name") == "ai-room-private-videos", data.get("name")),
  "public-access-type": (data.get("public-access-type") == "NoPublicAccess", data.get("public-access-type")),
  "storage-tier": (data.get("storage-tier") == "Standard", data.get("storage-tier")),
  "versioning": (data.get("versioning") == "Disabled", data.get("versioning")),
  "object-lifecycle-policy-etag": (data.get("object-lifecycle-policy-etag") is None, data.get("object-lifecycle-policy-etag")),
  "replication-enabled": (data.get("replication-enabled") is False, data.get("replication-enabled")),
  "is-read-only": (data.get("is-read-only") is False, data.get("is-read-only")),
}
print("Region: ap-batam-1")
print("Namespace:",data.get("namespace","[unknown]"))
for name, (ok, value) in checks.items():
  print(("PASS" if ok else "FAIL"), name, "=", value)
if not all(ok for ok,_ in checks.values()):
  print("Unsafe or unverifiable bucket state; do not enable private OCI mode.",file=sys.stderr)
  sys.exit(1)
print("PASS — bucket settings permit private AI ROOM smoke testing.")
print("NEXT: verify IAM scope and authenticated S3-compatible access; then test with a non-sensitive video.")
PY
