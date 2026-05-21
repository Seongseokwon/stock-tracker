# StockPulse — 실시간 주식 트래커

미국(Finnhub) · 한국(Yahoo Finance) 관심목록을 실시간으로 추적하는 웹 앱.

**프로덕션:** https://stock-tracker-opal-six.vercel.app

## 빠른 시작

```bash
npm run install:all
cp backend/.env.example backend/.env
# backend/.env → FINNHUB_API_KEY, AUTH_CODE, SESSION_SECRET 입력
npm start
# → http://localhost:3000 (로그인 페이지 → 코드 입력 → 대시보드)
```

> `frontend/index.html`을 직접 열면 API가 동작하지 않습니다. 반드시 `npm start` 사용.

## 주요 기능

- 관심목록 추가·삭제, URL 공유, JSON 백업/복원
- US 종목: 영문 티커·회사명 / KR 종목: 한글명·6자리 코드 (`삼성전자`, `005930`)
- US WebSocket 실시간 시세 / KR 폴링 (3~60초)
- 모달: 라인·캔들 차트, 재무 지표, 뉴스
- 포트폴리오 평가손익 + 통합 원화 손익 (USD/KRW 환율)
- 가격 알림, 다크/라이트 테마, PWA

## 구조

```
frontend/   index.html, login.html, app.js, style.css, manifest.json, sw.js
backend/    server.js (Express + auth), kr-search.js, data/kr-stocks.json
api/        [[...slug]].js (Vercel 라우팅)
docs/       HANDOFF.md (마스터), TASKS.md, DEPLOY.md, AUTH.md, QA.md, ROADMAP.md
```

## 주요 명령

```bash
npm start           # 로컬 서버
npm run qa          # 자동 QA (43항목)
npm run qa:prod     # 프로덕션 QA
npm run vercel:prod # Vercel 배포
npm run clean       # node_modules·.vercel 제거
```

## 문서

| 파일 | 내용 |
|------|------|
| [docs/HANDOFF.md](./docs/HANDOFF.md) | 마스터 — 구조·API·현황·의사결정 |
| [docs/TASKS.md](./docs/TASKS.md) | 작업 ID 트래킹 |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Vercel·Railway 배포, PWA, 백업 |
| [docs/AUTH.md](./docs/AUTH.md) | 인증 현황 + DB 계획 |
| [docs/QA.md](./docs/QA.md) | QA 체크리스트 + 결과 |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | AI 브리핑·뉴스·수익화 |
