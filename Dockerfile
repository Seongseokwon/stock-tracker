FROM node:18-alpine
WORKDIR /app

# 의존성 설치 (express, ws, dotenv, pg)
COPY package.json package-lock.json ./
RUN npm install --production --ignore-scripts

# 백엔드 소스 복사
COPY backend/ ./backend/

EXPOSE 3000

# 헬스체크 (Railway가 /api/health 응답 확인)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# DATABASE_URL 있으면 마이그레이션 실행 후 서버 기동 (start.sh 인라인)
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then echo '▶ DB 마이그레이션 실행...' && node backend/migrate.js && echo '✅ 마이그레이션 완료'; fi && exec node backend/server.js"]
