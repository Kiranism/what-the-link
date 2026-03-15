#!/bin/sh
set -e

# Ensure .env exists with APP_PASSWORD
if [ ! -f .env ]; then
  printf "No .env file found. Enter your APP_PASSWORD: "
  read -r password
  echo "APP_PASSWORD=$password" > .env
  echo "Created .env file."
elif ! grep -q "APP_PASSWORD" .env; then
  printf "APP_PASSWORD not found in .env. Enter your APP_PASSWORD: "
  read -r password
  echo "APP_PASSWORD=$password" >> .env
  echo "Added APP_PASSWORD to .env."
fi

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
