# StockPulse — 실시간 주식 트래커

미국(Finnhub) · 한국(Yahoo Finance) 관심목록을 실시간(또는 준실시간)으로 추적하는 웹 앱입니다.

## 주요 기능

- **관심목록** — 추가/삭제, 정렬·필터, URL 공유(포트폴리오·알림 포함), JSON 백업/복원
- **종목 검색** — US: 영문 티커·회사명 / KR: **한글 종목명·6자리 코드**(예: 삼성전자, 005930)
- **실시간 시세** — US: WebSocket / KR: 3초(장중)·60초(장외) 폴링
- **차트** — 카드 미니 차트, 모달 라인·캔들(당일/일/주/월)
- **포트폴리오** — 수량·평단·평가손익
- **가격 알림** — 목표가·등락률, 브라우저 알림
- **테마** — 다크 / 라이트
- **PWA** — 홈 화면 추가, 오프라인 정적 캐시

## 프로젝트 구조

```
stock-tracker/
├── frontend/     index.html, app.js, style.css, manifest.json, sw.js, PWA·OG 이미지
├── backend/      server.js, kr-search.js, data/kr-stocks.json (~247종), .env
├── api/          [[...slug]].js (Vercel)
├── docs/         HANDOFF.md (마스터), TASKS, QA, 배포 가이드
├── PROJECT.md    로드맵·제한사항 요약
└── package.json  npm start, qa, vercel:prod, fix:pwa
```

**프로덕션:** https://stock-tracker-opal-six.vercel.app

## 실행 방법

```bash
# 1. 의존성
npm run install:all

# 2. API 키 (미국 주식·뉴스·재무·WebSocket에 필요)
cp backend/.env.example backend/.env
# backend/.env → FINNHUB_API_KEY=...  (https://finnhub.io 무료 발급)

# 3. 서버 실행
npm start
```

브라우저에서 **http://localhost:3000** 을 엽니다.

> `frontend/index.html`을 더블클릭해 열면 API가 동작하지 않습니다. 반드시 `npm start`를 사용하세요.

> 백엔드 라우트를 수정한 뒤에는 서버를 **재시작**하세요.

## API (백엔드 프록시)

| 경로 | 설명 |
|------|------|
| `GET /api/health` | 헬스체크 |
| `GET /api/quote?symbol=` | 시세 |
| `GET /api/profile?symbol=` | 종목 프로필 |
| `GET /api/chart?symbol=&interval=&range=` | 차트 (`ohlc=1` 캔들) |
| `GET /api/search?q=&market=US\|KR` | 검색 (KR 한글 → 로컬 인덱스) |
| `GET /api/market-status` | KR/US 장 상태 |
| `GET /api/fx?from=USD&to=KRW` | 환율 (Frankfurter) |
| `GET /api/news?symbol=` | 뉴스 (US) |
| `GET /api/metrics?symbol=` | 재무 지표 (US) |
| `WS /ws` | Finnhub WebSocket 프록시 |

## 아키텍처

```
브라우저 (frontend/)
    │
    ├── REST /api/*  → backend/server.js
    │                      ├── Finnhub (US quote, profile, news, metrics, search)
    │                      ├── kr-stocks.json (KR 한글 종목명 검색)
    │                      └── Yahoo (KR/US chart·quote, KR 영문 검색)
    └── WS /ws       → Finnhub WebSocket (US 실시간)
```

API 키는 **`backend/.env`의 `FINNHUB_API_KEY`** 에만 있습니다.

## 사용 팁

| 기능 | 방법 |
|------|------|
| 한국 종목 검색 | 🇰🇷 탭 → `삼성`, `삼성전자`, `005930` 입력 (자동완성 또는 추가) |
| 미국 종목 검색 | 🇺🇸 탭 → `Apple`, `AAPL` 등 영문 입력 |
| 관심목록 공유 | 툴바 **🔗 공유** → 포트폴리오·알림 포함 선택 후 URL 복사 |
| 통합 손익 | US+KR 보유 시 포트폴리오 **🌐 통합 (원화)** 카드 (실시간 USD/KRW 환율) |
| 백업 | **⬇ 백업** → JSON 다운로드 |
| 복원 | **⬆ 복원** → JSON 선택 |
| 테마 | 헤더 🌙 / ☀️ |
| 모바일 삭제 | 카드를 왼쪽으로 스와이프 |

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | HTML5, CSS, Vanilla JavaScript |
| Backend | Node.js, Express, ws |
| 데이터 | Finnhub REST/WebSocket, Yahoo Finance, Frankfurter FX, KR 로컬 검색 인덱스 |

### 한국 종목 검색 범위 늘리기

`scripts/build-kr-stocks.mjs`에 종목을 추가한 뒤:

```bash
npm run build:kr-stocks   # backend/data/kr-stocks.json 재생성
npm start               # 서버 재시작 (필수)
```

개별 항목 예시 (`priority`·`aliases`는 선택):

```json
{ "code": "123456", "market": "KS", "name": "회사명", "priority": 50, "aliases": ["별칭"] }
```

`market`은 `KS`(KOSPI) 또는 `KQ`(KOSDAQ). 현재 약 250종목 인덱스.

## Vercel 배포 (Git 불필요)

로컬 폴더를 그대로 CLI로 올릴 수 있습니다.

```bash
npm run install:all
npx vercel login
npx vercel env add FINNHUB_API_KEY   # Production + Preview
npm run vercel:prod
```

상세: [docs/DEPLOY-VERCEL.md](./docs/DEPLOY-VERCEL.md) (프론트)  
**백엔드·WebSocket:** [docs/DEPLOY-RAILWAY.md](./docs/DEPLOY-RAILWAY.md) (1순위, RW-*)

Vercel만 쓸 때는 US **WebSocket 없음**(폴링). Railway 연동 후 실시간 WS 가능.

## QA

```bash
npm start       # 다른 터미널
npm run qa      # 로컬 API·정적 검사 (43항목)
npm run qa:prod # 프로덕션(Vercel) 검사 — 43/43 PASS (2026-05-19)
```

체크리스트: [docs/QA-CHECKLIST.md](./docs/QA-CHECKLIST.md) · 결과: [docs/QA-RESULTS.md](./docs/QA-RESULTS.md)

**다른 AI·협업자용 전체 현황:** [docs/HANDOFF.md](./docs/HANDOFF.md) (이 파일 하나로 프로젝트 파악 가능)

로드맵: [PROJECT.md](./PROJECT.md) · 작업: [docs/TASKS.md](./docs/TASKS.md) · **Railway:** [docs/DEPLOY-RAILWAY.md](./docs/DEPLOY-RAILWAY.md) · [DESIGN-SYSTEM](docs/DESIGN-SYSTEM.md)

## 압축·백업

용량 절감: `npm run clean` 후 zip (`node_modules`·`.vercel` 제외, **~200MB 절약**).  
복구·주의사항: [docs/ARCHIVE.md](./docs/ARCHIVE.md)
