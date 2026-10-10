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
if oci os bucket get --region "$REGION" --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" >/dev/null 2>&1; then
  echo "Bucket already exists; inspecting instead of modifying it."
else
  echo "Creating new private bucket in $REGION (no public access, no object versioning)."
  oci os bucket create --region "$REGION" --compartment-id "$COMPARTMENT" \
    --namespace-name "$NAMESPACE" --name "$BUCKET" \
    --public-access-type NoPublicAccess --storage-tier Standard --versioning Disabled >/dev/null
fi
META="$(oci os bucket get --region "$REGION" --namespace-name "$NAMESPACE" --bucket-name "$BUCKET" --output json)"
PRIVATE_STATE="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"].get("public-access-type","UNKNOWN"))')"
VERSIONING="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"].get("versioning","UNKNOWN"))')"
COMPARTMENT_ACTUAL="$(printf '%s' "$META" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"].get("compartment-id","UNKNOWN"))')"
if [[ "$PRIVATE_STATE" != "NoPublicAccess" ]]; then
  echo "STOP: Bucket does not have NoPublicAccess." >&2; exit 4
fi
if [[ "$VERSIONING" != "Disabled" ]]; then
  echo "STOP: Versioning is not Disabled. Owner deletion requires additional version cleanup." >&2; exit 4
fi
if [[ "$COMPARTMENT_ACTUAL" != "$COMPARTMENT" ]]; then
  echo "STOP: Existing bucket belongs to another compartment." >&2; exit 4
fi
echo "PASS: bucket is private, versioning disabled, compartment verified."
echo "Region: $REGION"
echo "OCI namespace: $NAMESPACE"
echo "Bucket: $BUCKET"
echo "Next: configure a dedicated least-privilege Customer Secret Key in Vercel Preview (never here in chat)."
