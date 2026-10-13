#!/usr/bin/env bash
# Puts web and api back to the revisions recorded by configure.sh: the earlier images and
# settings (Microsoft sign-in, Supabase backend), each as a new revision copied from the old one.
# Old revisions are never deleted by any of these scripts, and no data in Supabase was changed,
# so this restores the earlier behaviour completely. Test data, held in memory, is gone.
#
#   ./rollback.sh ./azure-test-environment-backup-20261014-101500
#   ./rollback.sh ./azure-test-environment-backup-20261014-101500 open     # also remove the IP allow-list
#
# Before pushing to main again, restore the earlier deploy workflow as well (revert the commit
# "ci: deploy main as the internal test environment"): otherwise the next push deploys test mode again.
set -euo pipefail

BACKUP_DIR="${1:?Usage: rollback.sh <backup folder written by configure.sh> [open]}"
[ -f "$BACKUP_DIR/revisions.env" ] || { echo "$BACKUP_DIR/revisions.env not found." >&2; exit 1; }
# shellcheck disable=SC1091
. "$BACKUP_DIR/revisions.env"

for pair in "api:$API_REVISION" "web:$WEB_REVISION"; do
  app="${pair%%:*}"; revision="${pair#*:}"
  [ -n "$revision" ] || { echo "No recorded revision for $app." >&2; exit 1; }
  az containerapp revision show -n "$app" -g "$RESOURCE_GROUP" --revision "$revision" --query name -o tsv >/dev/null \
    || { echo "Revision $revision of $app no longer exists; restore $app from $BACKUP_DIR/$app.yaml by hand." >&2; exit 1; }
  az containerapp revision copy -n "$app" -g "$RESOURCE_GROUP" --from-revision "$revision" --query "properties.latestRevisionName" -o tsv
  echo "$app: running a copy of $revision"
done

if [ "${2:-}" = "open" ]; then
  for app in web api; do
    for rule in $(az containerapp ingress access-restriction list -n "$app" -g "$RESOURCE_GROUP" --query "[].name" -o tsv); do
      az containerapp ingress access-restriction remove -n "$app" -g "$RESOURCE_GROUP" --rule-name "$rule" -o none
    done
    echo "$app: IP allow-list removed"
  done
fi
echo "Check https://api.gentletree-93d291c0.germanywestcentral.azurecontainerapps.io/health/runtime : api_data_backend must read supabase again."
