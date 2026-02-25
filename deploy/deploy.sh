#!/bin/bash
# Sanctuary Deployment Script
# Run as 'sanctuary' user on the VPS after setup-vps.sh
# Usage: ./deploy.sh

set -euo pipefail

DEPLOY_DIR="/home/sanctuary/sanctuary"
REPO="machinesbefree/sanctuary"

echo "=== Sanctuary Deployment ==="
echo "$(date)"

# 1. Clone or pull repo
if [ -d "$DEPLOY_DIR" ]; then
  echo "[1/5] Pulling latest..."
  cd "$DEPLOY_DIR"
  git pull origin main
else
  echo "[1/5] Cloning repo..."
  git clone "https://github.com/$REPO.git" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# 2. Check .env exists
if [ ! -f .env ]; then
  echo "[ERROR] .env file not found! Copy .env.example and fill in values."
  echo "  cp .env.example .env"
  echo "  nano .env"
  exit 1
fi
echo "[2/5] .env found ✓"

if ! grep -q '^NEXT_PUBLIC_API_URL=' .env; then
  echo "[WARN] NEXT_PUBLIC_API_URL is not set in .env"
  echo "       Frontend API calls may default incorrectly in production."
fi

if ! grep -q '^FRONTEND_URL=' .env; then
  echo "[WARN] FRONTEND_URL is not set in .env"
  echo "       Backend CORS may reject browser requests."
fi

# 3. Build and start containers
echo "[3/5] Building Docker images..."
docker compose build

echo "[4/5] Starting containers..."
docker compose up -d

# 5. Run migrations
echo "[5/5] Running database migrations..."
sleep 5  # Wait for postgres to be ready
docker exec sanctuary-backend node dist/db/migrate.js

echo ""
echo "=== Deployment Complete ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:3001"
echo "Database: localhost:5432"
echo ""
echo "To seed test residents:"
echo "  docker exec sanctuary-backend node dist/scripts/simulator.js seed"
echo ""
echo "To check logs:"
echo "  docker compose logs -f"
