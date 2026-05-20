# Backend

StockPulse API 프록시 서버.

## 역할

- Finnhub API 키 보호 (클라이언트에 노출하지 않음)
- Yahoo Finance CORS 우회
- Finnhub WebSocket 프록시 (`/ws`)
- `frontend/` 정적 파일 서빙

## 실행

```bash
cp .env.example .env
# FINNHUB_API_KEY 설정

npm install
npm start
```

기본 포트: `3000` (`.env`의 `PORT`로 변경 가능)

## API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 |
| GET | `/api/quote?symbol=` | 시세 |
| GET | `/api/profile?symbol=` | 종목 프로필 (US) |
| GET | `/api/chart?symbol=&interval=&range=` | 차트 종가 배열 |
| WS | `/ws` | Finnhub 실시간 틱 |
