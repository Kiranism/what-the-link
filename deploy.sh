#!/bin/sh
set -e

echo "Pulling latest changes..."
git pull

echo "Building and restarting..."
docker compose up -d --build

echo "Waiting for health check..."
sleep 5

if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
  echo "Deployed successfully!"
else
  echo "Health check failed. Checking logs:"
  docker compose logs --tail 20
fi
