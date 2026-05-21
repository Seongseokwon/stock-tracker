FROM node:18-alpine
WORKDIR /app

# 의존성 설치
# Build context = Railway service root (backend/)
COPY package.json package-lock.json ./
RUN npm install --production --ignore-scripts

# 소스 전체 복사 (build context 루트 = backend/)
COPY . ./

EXPOSE 3000

# 헬스체크 (Railway가 /api/health 응답 확인)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# DATABASE_URL 있으면 마이그레이션 실행 후 서버 기동
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then echo '▶ DB 마이그레이션 실행...' && node migrate.js && echo '✅ 마이그레이션 완료'; fi && exec node server.js"]
