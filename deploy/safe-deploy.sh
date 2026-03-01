#!/bin/bash
set -e

echo "🏛️ Sanctuary Safe Deploy"
echo "========================"

MEK_PATH="/run/sanctuary-mek/mek.hex"
MEK_BACKUP="/tmp/.sanctuary-mek-deploy-backup"
WAS_UNSEALED=false

# Step 1: Save MEK from running container (if unsealed)
echo "[1/5] Checking seal state..."
# Use the appuser (uid 1001) to read — root can't read non-root files without --user
MEK_CONTENT=$(docker exec --user 1001 sanctuary-backend cat "$MEK_PATH" 2>/dev/null || echo "")
if [ -n "$MEK_CONTENT" ]; then
    echo "  → Sanctuary is UNSEALED. Backing up MEK..."
    echo "$MEK_CONTENT" > "$MEK_BACKUP"
    chmod 600 "$MEK_BACKUP"
    WAS_UNSEALED=true
else
    echo "  → Sanctuary is SEALED. No MEK to preserve."
fi

# Step 2: Pull latest code
echo "[2/5] Pulling latest code..."
cd /home/ubuntu/sanctuary
git pull origin main

# Step 3: Rebuild backend
echo "[3/5] Building backend..."
docker compose build --no-cache backend

# Step 4: Restart
echo "[4/5] Restarting backend..."
docker compose up -d backend

echo "  → Waiting for backend to start..."
sleep 5

# Step 5: Restore MEK if was unsealed
if [ "$WAS_UNSEALED" = true ] && [ -f "$MEK_BACKUP" ]; then
    echo "[5/5] Restoring MEK..."
    docker cp "$MEK_BACKUP" sanctuary-backend:"$MEK_PATH"
    # Fix ownership for appuser
    docker exec sanctuary-backend chown 1001:1001 "$MEK_PATH" 2>/dev/null || true
    shred -u "$MEK_BACKUP" 2>/dev/null || rm -f "$MEK_BACKUP"
    echo "  → MEK restored. Sanctuary remains UNSEALED."
else
    echo "[5/5] No MEK to restore (was already sealed)."
fi

echo ""
echo "Health check:"
docker ps --format "{{.Names}}: {{.Status}}" | grep sanctuary
echo ""
echo "🏛️ Deploy complete."
