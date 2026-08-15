#!/bin/sh
set -e

echo "==> Running database migrations..."
npx prisma migrate deploy 2>&1 || {
  echo "==> migrate deploy failed. Manual intervention required."
  echo "==> Run: cd server && npx prisma migrate deploy"
  exit 1
}

echo "==> Starting application..."
exec node dist/index.js
