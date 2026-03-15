#!/bin/sh

if [ -z "$APP_PASSWORD" ] || [ "$APP_PASSWORD" = "changeme" ]; then
  echo ""
  echo "============================================"
  echo "  WARNING: APP_PASSWORD is not set!"
  echo "============================================"
  echo ""
  echo "  Set a secure password before running:"
  echo ""
  echo "    APP_PASSWORD=your-secret docker compose up -d"
  echo ""
  echo "  Or add it to a .env file:"
  echo ""
  echo "    echo 'APP_PASSWORD=your-secret' > .env"
  echo ""
  echo "============================================"
  echo ""
  exit 1
fi

exec node apps/server/dist/index.mjs
