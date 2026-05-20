FROM node:18-alpine
WORKDIR /app

# 루트 의존성 설치 (express, ws, dotenv — backend가 여기서 resolve)
COPY package.json package-lock.json ./
RUN npm install --production --ignore-scripts

# 백엔드 소스만 복사
COPY backend/ ./backend/

EXPOSE 3000

CMD ["node", "backend/server.js"]
