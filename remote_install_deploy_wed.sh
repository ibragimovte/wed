cat > /usr/local/bin/deploy-wed <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/ibragimovte/wed.git"
BRANCH="main"
SRC_DIR="/opt/wed-src"
WEB_ROOT="/var/www"
TARGET_DIR="$WEB_ROOT/wed"
TMP_DIR="$WEB_ROOT/wed.__new"
BACKUP_DIR="$WEB_ROOT/wed.__prev"
LOCK_FILE="/tmp/deploy-wed.lock"

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another deploy is running"; exit 1; }

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -d "$SRC_DIR/.git" ]]; then
  rm -rf "$SRC_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$SRC_DIR"
else
  git -C "$SRC_DIR" fetch origin "$BRANCH"
  git -C "$SRC_DIR" checkout "$BRANCH"
  git -C "$SRC_DIR" reset --hard "origin/$BRANCH"
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
rsync -a --delete --exclude '.git' "$SRC_DIR/" "$TMP_DIR/"

[[ -f "$TMP_DIR/index.html" ]] || { echo "Deploy aborted: index.html missing"; exit 1; }
[[ -f "$TMP_DIR/styles.css" ]] || { echo "Deploy aborted: styles.css missing"; exit 1; }
[[ -f "$TMP_DIR/server/index.js" ]] || { echo "Deploy aborted: server/index.js missing"; exit 1; }

# Keep runtime-critical files in place and deploy in-place to avoid
# moving a live working directory (which can send writes to .__prev).
mkdir -p "$TARGET_DIR"

if systemctl list-unit-files | grep -q '^wed-rsvp\.service'; then
  systemctl stop wed-rsvp || true
fi

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
if [[ -d "$TARGET_DIR/data" ]]; then rsync -a "$TARGET_DIR/data/" "$BACKUP_DIR/data/"; fi
if [[ -d "$TARGET_DIR/backup" ]]; then rsync -a "$TARGET_DIR/backup/" "$BACKUP_DIR/backup/"; fi
if [[ -f "$TARGET_DIR/.env" ]]; then cp -a "$TARGET_DIR/.env" "$BACKUP_DIR/.env"; fi

rsync -a --delete \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'backup/' \
  --exclude 'node_modules/' \
  "$TMP_DIR/" "$TARGET_DIR/"

if [[ ! -d "$TARGET_DIR/node_modules" && -f "$TARGET_DIR/package.json" ]]; then
  cd "$TARGET_DIR"
  npm install --omit=dev
fi

if systemctl list-unit-files | grep -q '^wed-rsvp\.service'; then
  systemctl start wed-rsvp || true
fi

chown -R www-data:www-data "$TARGET_DIR" || true

if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx || true
else
  echo "Warning: nginx config test failed; site files updated but nginx not reloaded"
fi

COMMIT="$(git -C "$SRC_DIR" rev-parse --short HEAD)"
echo "Deploy complete: $COMMIT"
EOF

chmod +x /usr/local/bin/deploy-wed
/usr/local/bin/deploy-wed
