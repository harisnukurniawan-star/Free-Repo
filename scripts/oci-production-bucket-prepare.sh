#!/usr/bin/env bash
# Prepare a distinct Production bucket in OCI Batam; refuse Preview's bucket.
# Does not create credentials, modify customer objects, or enable Vercel flags.
set -euo pipefail
BASENAME="ai-room-private-videos-prod"
if [[ -n "${AI_ROOM_OCI_BUCKET:-}" && "${AI_ROOM_OCI_BUCKET}" != "$BASENAME" ]]; then
  echo "Refusing to prepare a non-Production bucket from this script." >&2
  exit 2
fi
if [[ -z "${OCI_COMPARTMENT_ID:-}" ]]; then
  echo "Set OCI_COMPARTMENT_ID to the intended Production compartment." >&2
  exit 2
fi
export AI_ROOM_OCI_BUCKET="$BASENAME"
exec bash "$(dirname "$0")/oci-private-bucket-prepare.sh"
