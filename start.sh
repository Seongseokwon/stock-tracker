#!/bin/sh
# Railway/Docker 컨테이너 시작 스크립트
# DATABASE_URL이 있으면 마이그레이션 먼저 실행 후 서버 기동
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "▶ DB 마이그레이션 실행..."
  node backend/migrate.js
  echo "✅ 마이그레이션 완료"
fi

echo "▶ StockPulse 서버 시작 (PORT=${PORT:-3000})"
exec node backend/server.js
