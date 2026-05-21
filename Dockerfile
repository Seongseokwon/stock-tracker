FROM node:18-alpine
WORKDIR /app

# 의존성 설치 (express, ws, dotenv, pg)
COPY package.json package-lock.json ./
RUN npm install --production --ignore-scripts

# 백엔드 소스 복사
COPY backend/ ./backend/

# 시작 스크립트 복사 + 실행 권한
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

# 헬스체크 (Railway가 /api/health 응답 확인)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["./start.sh"]
