#!/usr/bin/env bash
# Prepares the existing Azure deployment for use as the internal test environment:
#
#   1. records the current state of the four apps (revisions, images, settings) for rollback
#   2. restricts the ingress of web and api to the testers' addresses
#
# It does not switch anything to test mode: that happens when the deploy workflow on main runs,
# and the workflow refuses to run until step 2 is in place. Nothing is deleted, no secret is
# read or changed, and Supabase is not touched.
#
#   ALLOWED_CIDRS="203.0.113.10/32 198.51.100.0/28" ./configure.sh
#   ALLOWED_CIDRS="..." ./configure.sh access      # only replace the allow-list (new tester, new office address)
#
# Requires the Azure CLI with the containerapp extension, signed in with rights on the resource group.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-borek-pitch-prod}"
ALLOWED_CIDRS="${ALLOWED_CIDRS:-}"   # space-separated office and VPN egress addresses of the testers, in CIDR form
BACKUP_DIR="${BACKUP_DIR:-./azure-test-environment-backup-$(date +%Y%m%d-%H%M%S)}"
APPS="web api worker renderer"

if [ -z "$ALLOWED_CIDRS" ]; then
  echo "ALLOWED_CIDRS is empty. The development sign-in needs no password: name the testers' addresses." >&2
  exit 1
fi
for cidr in $ALLOWED_CIDRS; do
  case "$cidr" in
    0.0.0.0/*|*/0) echo "Refusing '$cidr': that would allow the whole internet." >&2; exit 1 ;;
    */*) ;;
    *) echo "'$cidr' is not in CIDR form (for one address use /32)." >&2; exit 1 ;;
  esac
done

restrict() {  # only the listed addresses reach the app; everyone else gets 403 from the ingress
  local app="$1" index=0
  for existing in $(az containerapp ingress access-restriction list -n "$app" -g "$RESOURCE_GROUP" --query "[].name" -o tsv); do
    az containerapp ingress access-restriction remove -n "$app" -g "$RESOURCE_GROUP" --rule-name "$existing" -o none
  done
  for cidr in $ALLOWED_CIDRS; do
    index=$((index + 1))
    az containerapp ingress access-restriction set -n "$app" -g "$RESOURCE_GROUP" --rule-name "tester-$index" --ip-address "$cidr" --action Allow -o none
  done
  echo "$app: reachable only from $ALLOWED_CIDRS"
}

if [ "${1:-}" != "access" ]; then
  [ -e "$BACKUP_DIR" ] && { echo "$BACKUP_DIR exists already; a backup is never overwritten." >&2; exit 1; }
  mkdir -p "$BACKUP_DIR"
  : > "$BACKUP_DIR/revisions.env"
  for app in $APPS; do
    # Settings as Azure reports them. Secret values are not part of this output.
    az containerapp show -n "$app" -g "$RESOURCE_GROUP" -o yaml > "$BACKUP_DIR/$app.yaml"
    az containerapp revision list -n "$app" -g "$RESOURCE_GROUP" --all -o table > "$BACKUP_DIR/$app.revisions.txt"
    az containerapp ingress access-restriction list -n "$app" -g "$RESOURCE_GROUP" -o json > "$BACKUP_DIR/$app.access.json" 2>/dev/null || echo "[]" > "$BACKUP_DIR/$app.access.json"
    revision="$(az containerapp show -n "$app" -g "$RESOURCE_GROUP" --query properties.latestReadyRevisionName -o tsv)"
    image="$(az containerapp show -n "$app" -g "$RESOURCE_GROUP" --query "properties.template.containers[0].image" -o tsv)"
    echo "${app^^}_REVISION=$revision" >> "$BACKUP_DIR/revisions.env"
    echo "$app: revision $revision, image $image"
  done
  echo "RESOURCE_GROUP=$RESOURCE_GROUP" >> "$BACKUP_DIR/revisions.env"
  echo "State recorded in $BACKUP_DIR. Keep this folder: rollback.sh needs it."
fi

restrict web
restrict api

cat <<EOF

Check before anything is deployed:
  - from an allowed address   https://web.gentletree-93d291c0.germanywestcentral.azurecontainerapps.io/login   opens
  - from any other network (for example a phone on mobile data) the same address answers 403
  - the same two checks for   https://api.gentletree-93d291c0.germanywestcentral.azurecontainerapps.io/health

The environment still runs as before (Microsoft sign-in, Supabase). It changes to test mode when
the "Deploy" workflow runs on main.
EOF
