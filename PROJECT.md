# StockPulse — 실시간 주식 트래커

> Vanilla HTML/CSS/JavaScript 프론트엔드 + Node.js(Express) API 프록시.  
> 미국 주식(Finnhub)과 한국 주식(Yahoo Finance) 관심목록을 한 화면에서 추적합니다.

---

## 📁 프로젝트 구조

```
stock-tracker/
├── frontend/              # 정적 UI (Vercel outputDirectory)
│   ├── index.html, app.js, style.css
│   ├── manifest.json, sw.js (CACHE: stockpulse-v4)
│   ├── icon-192.png, icon-512.png, og-image.png
│   └── screenshots/       # PWA wide·narrow
├── backend/
│   ├── server.js          # API + 로컬 정적·WS
│   ├── kr-search.js
│   ├── data/kr-stocks.json  # 한글 검색 (~247종)
│   └── .env / .env.example
├── api/[[...slug]].js     # Vercel → backend/server.js
├── scripts/               # qa.mjs, build-kr-stocks, fix-pwa, patch-og-url
├── docs/                  # HANDOFF, TASKS, QA, DEPLOY, PWA, OG-KAKAO
├── vercel.json
├── package.json
├── README.md
└── PROJECT.md             # 이 문서
```

---

## 🛠 기술 스택

| 분류 | 내용 |
|------|------|
| Frontend | HTML5, CSS 변수(다크/라이트), Vanilla JS (ES2020+) |
| Backend | Node.js 18+, Express, `ws` |
| 미국 시세 | Finnhub REST Quote + WebSocket (`/ws` 프록시) |
| 한국 시세 | Yahoo Finance Chart API (`v8/finance/chart`) — 백엔드 경유 |
| 한국 검색 | `kr-stocks.json` 로컬 인덱스(한글) + Yahoo Search(영문·숫자) |
| 환율 | Frankfurter API (`/api/fx`) — 포트폴리오 원화 합산 |
| 저장소 | `localStorage` (관심목록, 포트폴리오, 알림, 정렬/필터, 테마) |
| 차트 | HTML5 Canvas (미니 차트, 모달 라인/캔들) |

**API 키는 `backend/.env`에만 둡니다.** 프론트엔드에 Finnhub 키가 노출되지 않습니다.

---

## ✅ 구현 완료 기능 (P0 ~ P3)

### 핵심
- 관심목록 추가/삭제 (최대 20종목), `localStorage` 자동 저장
- 미국: Finnhub WebSocket 실시간 + REST 폴백 폴링
- 한국: Yahoo REST — **장중 3초**, **장외 60초** 폴링
- 시장 탭 🇺🇸 / 🇰🇷, KOSPI·KOSDAQ(`.KS` / `.KQ`)
- 검색 자동완성 — **US:** Finnhub / **KR:** 한글 종목명·코드(`kr-stocks.json`) + Yahoo(영문)
- API 요청 큐(250ms 간격) + 종목별 스태거(300ms)

### 차트·모달
- 카드 미니 차트 (최근 틱 히스토리)
- 모달: 당일/일/주/월, 라인·캔들 (`/api/chart?ohlc=1`)
- 시가/고가/저가/거래량/시총/PER, **미국** 뉴스·재무 지표

### 포트폴리오·알림
- 보유 수량·평단 → 평가손익 (US/KR 분리 + **원화 통합** 카드)
- 목표가·등락률 알림 + Notification API + 토스트

### UX·P3
- 다크/라이트 모드 (`sp_theme`)
- 관심목록 URL 공유 (`?watchlist=...`, 선택 `pf`·`al` base64)
- JSON 백업/복원 (watchlist, portfolio, alerts, sort/filter)
- PWA (`manifest.json`, `sw.js`)
- 모바일: 카드 왼쪽 스와이프 삭제
- 관심목록 카드: **종목명(위)** · **심볼 코드(아래)**
- 헤더: KR/US 장 운영 뱃지, WS/폴링 상태 표시

---

## 🔌 백엔드 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버·Finnhub 키 설정 여부 |
| GET | `/api/quote?symbol=` | 시세 (US: Finnhub, KR: Yahoo) |
| GET | `/api/profile?symbol=` | 프로필 (US: Finnhub, KR: Yahoo meta) |
| GET | `/api/chart?symbol=&interval=&range=&ohlc=1` | 차트 OHLC/종가 |
| GET | `/api/search?q=&market=US\|KR` | 종목 검색 (아래 참고) |
| GET | `/api/fx?from=USD&to=KRW` | 환율 (Frankfurter) |
| GET | `/api/market-status` | KR/US 장 상태 |
| GET | `/api/news?symbol=` | 뉴스 (US, Finnhub, 최근 7일) |
| GET | `/api/metrics?symbol=` | 재무 지표 (US, Finnhub) |
| WS | `/ws` | Finnhub WebSocket 프록시 |

> **라우트 추가 후에는 서버 재시작이 필요합니다.** (`npm start`)

### `/api/search` 동작

| 시장 | 입력 예 | 데이터 소스 |
|------|---------|-------------|
| **US** | `apple`, `AAPL` | Finnhub `/search` |
| **KR (한글)** | `삼성`, `삼성전자`, `005930` | `backend/data/kr-stocks.json` 로컬 매칭 |
| **KR (영문)** | `samsung` | 로컬 + Yahoo Finance Search 병합 |

- Yahoo 검색 API는 **한글 쿼리를 거부**하므로, 한글은 로컬 인덱스만 사용합니다.
- 목록에 없는 한국 종목은 `kr-stocks.json`에 `{ "code", "market", "name" }` 항목을 추가하세요.
- 프론트: 한국 탭에서 종목명 입력 후 **추가** 시 검색 API로 심볼(예: `005930.KS`)을 해석합니다.

---

## 💾 localStorage 키

| 키 | 내용 |
|----|------|
| `sp_watchlist` | 관심 종목 심볼 배열 |
| `sp_portfolio` | `{ symbol: { shares, avgCost } }` |
| `sp_alerts` | 종목별 알림 설정 |
| `sp_sort` | 정렬 (`added`, `change`, `price`, `symbol`, `pnl`) |
| `sp_filter` | 필터 (`all`, `US`, `KR`) |
| `sp_theme` | `dark` \| `light` |

---

## ⚙️ 실행

```bash
npm run install:all
cp backend/.env.example backend/.env
# backend/.env 에 FINNHUB_API_KEY 설정
npm start
# → http://localhost:3000
```

`frontend/index.html`을 파일로 직접 열면 API·WebSocket이 동작하지 않습니다.

---

## 📋 로드맵 진행 상태

| 우선순위 | 항목 | 상태 |
|----------|------|------|
| P0 | 백엔드 프록시, 키 보호, CORS 제거, 에러 재시도, 실차트 | ✅ 완료 |
| P1 | KR 폴링·큐, 카드 로딩/에러, .env, .KQ, 장 뱃지 | ✅ 완료 |
| P2 | 캔들·검색·정렬/필터·포트폴리오·알림 | ✅ 완료 |
| P3 | 테마·뉴스·재무·URL공유·PWA·스와이프·백업 | ✅ 완료 |
| B | 통합 손익·공유 확장·KR 시총·**한글 종목 검색** | ✅ 완료 |

---

## 🔜 다음 작업 (우선순위 제안)

### 1순위 — Railway 백엔드 배포
- [ ] **Vercel(프론트) + Railway(API·WS)** — [DEPLOY-RAILWAY.md](./docs/DEPLOY-RAILWAY.md) (RW-0~RW-8)
- [ ] `/api/health` → `wsSupported: true`, 프론트 `API_BASE` 연동

### 1-B순위 — 디자인 (Minimal + Glass Hybrid)
- [ ] **2025~26 SaaS/핀테크 리디자인** — [DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md) (DS-0~DS-10)
- [ ] Glass: 카드·모달만 · subtle gradient · IA·타이포·모바일

### 2순위 — 문서·운영 (낮은 비용)
- [x] `PROJECT.md` / `README.md` / `docs/HANDOFF.md` 현행화
- [x] 수동 QA — `docs/QA-CHECKLIST.md`, `docs/QA-RESULTS.md`, `npm run qa` / `qa:prod` (**43/43**)
- [x] Vercel 배포 + `FINNHUB_API_KEY`
- [x] 브라우저 최종 확인 7항 (O-3)
- [x] 카카오 링크 미리보기 (O-4)
- [ ] Git 저장소 초기화·첫 커밋 (O-5, 원할 때)

### 3순위 — MVP 로그인·DB
- [ ] **일회용 로그인 코드** + 간단 DB — [AUTH-MVP.md](./docs/AUTH-MVP.md) (L-0~L-8)
- [ ] 로그인 사용자 **관심종목 서버 저장** (`watchlist_items`)

### 3순위 — AI 종목 브리핑 (관심종목 클릭)
- [ ] **시간대별 요약** — [AI-BRIEFING.md](./docs/AI-BRIEFING.md) (A-0~A-7)
- [ ] 장전: 전일 뉴스·주가 / 12시 이후: 오전장 / 장마감 후: 당일 종합
- [ ] MVP: 규칙 요약 → v1: LLM (`/api/briefing`)

### 5순위 — 미국 매크로·경제 뉴스
- [ ] **Bloomberg·미국 경제 뉴스 정리 제공** — [NEWS-FEED.md](./docs/NEWS-FEED.md) (N-0~N-6)
- [ ] 소스: Finnhub market/general news·RSS 우선 (**본문 스크랩 비권장**, 원문 링크)
- [ ] `GET /api/macro-news` + 「미국 경제」 UI 패널

### 6순위 — 한국 시장 심화 (API·범위 큼)
- [ ] KRX/증권사 API로 **한국 실시간** (현재 Yahoo 3초 폴링)
- [ ] 한국 종목 **뉴스·재무** (현재 US만, K-3)
- [x] **검색 인덱스 확장** — `kr-stocks.json` ~250종목, `npm run build:kr-stocks`, priority·별칭 검색
- [ ] 전 종목·자동 갱신 (KRX 데이터 연동)

### 5순위 — 품질·배포
- [ ] 핵심 API 단위 테스트
- [x] Vercel HTTPS 배포 — [DEPLOY-VERCEL.md](./docs/DEPLOY-VERCEL.md)
- [x] SW 캐시 **`stockpulse-v4`** (배포 시 bump)
- [x] PWA PNG 192/512 + screenshots (`npm run fix:pwa`)
- [ ] PWA 설치·바탕화면 아이콘 최종 확인 (D-2b)
- [ ] 이미지 용량 최적화 (D-4)

### 7순위 — 수익화 (가장 빠른 시도)
- [ ] 면책·약관·개인정보 — [LEGAL-DISCLAIMER.md](./docs/LEGAL-DISCLAIMER.md) (M-2, **선행**)
- [ ] 후원 링크·Analytics — [MONETIZATION.md](./docs/MONETIZATION.md) (M-1, M-3)
- [ ] 증권사 제휴·AdSense·템플릿 판매 (M-4~M-6)
- [ ] 프리미엄·결제 (M-8, 장기)

### 6순위 — UX polish
- [x] 포트폴리오 환율 반영 통합 손익 (`/api/fx`, 원화 합산 카드)
- [x] 공유 URL에 portfolio/alerts 옵션 (`pf`, `al` base64 쿼리)
- [x] 한국 시가총액 — Yahoo quoteSummary 보조 조회 + 미제공 UX
- [x] Finnhub rate limit 사용자 안내 강화 (429 배너·토스트·갱신 간격·상태 표시)

---

## 🐛 알려진 제한사항

| 항목 | 내용 |
|------|------|
| 한국 실시간 | Yahoo 지연 + 3초 폴링 — 증권 HTS 수준 아님 |
| 한국 종목 검색 | `kr-stocks.json`에 없는 종목은 한글명 검색 불가 — `npm run build:kr-stocks`로 추가 |
| 한국 뉴스/재무 | Finnhub 미지원 → 모달 안내 문구만 표시 |
| 한국 시가총액 | Yahoo에서 종종 `null` → quoteSummary 보조 조회, 없으면 「미제공」 |
| Finnhub 무료 | Rate limit·WS 동시 구독 수 제한 |
| 포트폴리오 통합 | US+KR 동시 보유 시 원화 합산(환율은 Frankfurter 일일 기준) |
| Yahoo API | 비공식 — 스펙 변경 가능, **한글 검색 불가**, 백엔드 재시도로 완화 |

---

## 📐 데이터 흐름 (요약)

```
미국 (AAPL)
  addStock → GET /api/quote (Finnhub)
           → WS /ws 구독 (실시간)
           → WS 끊기면 REST 폴백 폴링 (~20초)

한국 (005930.KS / .KQ)
  addStock → GET /api/quote (Yahoo via backend)
           → WS 미사용
           → 장중 3초 / 장외 60초 폴링
```

---

*최종 업데이트: 2026-05-19 (Railway RW-* 1순위)*

**마스터 핸드오프 (AI·온보딩용):** [docs/HANDOFF.md](./docs/HANDOFF.md)  
Railway 배포: [docs/DEPLOY-RAILWAY.md](./docs/DEPLOY-RAILWAY.md)  
디자인: [docs/DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md)  
MVP 로그인·DB: [docs/AUTH-MVP.md](./docs/AUTH-MVP.md)  
AI 종목 브리핑: [docs/AI-BRIEFING.md](./docs/AI-BRIEFING.md)  
미국 경제 뉴스: [docs/NEWS-FEED.md](./docs/NEWS-FEED.md)  
수익화: [docs/MONETIZATION.md](./docs/MONETIZATION.md)  
작업 목록: [docs/TASKS.md](./docs/TASKS.md)
