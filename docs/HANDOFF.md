# StockPulse — 프로젝트 핸드오프 문서 (단일 참조용)

> **이 파일 하나만 읽어도** 프로젝트의 목적·구조·현황·제약·향후 방향을 파악할 수 있도록 작성했습니다.  
> 다른 AI·개발자 온보딩용 **마스터 문서**입니다.

**문서 버전:** 2026-05-21 (PostgreSQL DB 연동 · 1회용 코드 인증 · Docker 로컬 DB)  
**프로덕션 URL:** https://stock-tracker-opal-six.vercel.app  
**로컬 실행:** `npm start` → http://localhost:3000  
**Git:** ✅ 초기 커밋 완료 (`41363fc`, 2026-05-20) — branch: `main`

---

## 1. 한 줄 요약

**StockPulse**는 미국 주식(Finnhub)과 한국 주식(Yahoo Finance)을 한 화면에서 추적하는 **Vanilla JS + Node/Express** 웹 앱이다. API 키는 서버에만 두고, 관심목록·포트폴리오·알림·차트·PWA·URL 공유를 제공한다. **현재** 관심목록은 **localStorage**; 로그인은 **Docker PostgreSQL 1회용 코드 + HMAC 쿠키 세션**; DB 없으면 환경변수 코드로 fallback; **예정(L-4~)** 관심종목 서버 저장.

---

## 2. 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | HTML5, CSS 변수(다크/라이트), Vanilla JS · **DS-* Minimal+Glass 리디자인 예정** |
| Backend | Node.js 18+, Express, `ws`, `dotenv` |
| US 데이터 | Finnhub REST + WebSocket |
| KR 데이터 | Yahoo Finance Chart/Quote/Summary (비공식) |
| KR 한글 검색 | `backend/data/kr-stocks.json` + `kr-search.js` (~247종) |
| 환율 | Frankfurter (`/api/fx`) |
| 저장 | `localStorage` (관심목록·포트폴리오·알림) · **로컬: Docker PostgreSQL 16** |
| 배포 | Vercel (프론트) · **Railway 백엔드 예정 (RW-*)** · 로컬 통합 |

---

## 3. 디렉터리 구조 (실제)

```
stock-tracker/
├── frontend/                 # 정적 UI (Vercel outputDirectory)
│   ├── index.html
│   ├── login.html            # 1회용 코드 로그인 페이지 (L-6 UI 완료)
│   ├── style.css
│   ├── app.js                # 전체 클라이언트 로직
│   ├── manifest.json         # PWA (192/512 PNG, screenshots)
│   ├── sw.js                 # Service Worker (CACHE: stockpulse-v4)
│   ├── icon-192.png, icon-512.png
│   ├── og-image.png          # 카카오/OG 링크 미리보기
│   ├── icon-192.svg          # 레거시 favicon 대체 가능
│   └── screenshots/          # PWA wide/narrow
├── docker-compose.yml        # 로컬 PostgreSQL 16 (포트 5433)
├── Dockerfile                # 백엔드 Docker 이미지 (node:18-alpine, 프로덕션 only)
├── .dockerignore             # Docker 빌드 제외 목록
├── backend/
│   ├── server.js             # Express 앱 export + 로컬 HTTP/WS + CORS 미들웨어
│   ├── db.js                 # pg Pool (DATABASE_URL 없으면 null)
│   ├── migrate.js            # 마이그레이션 실행 (npm run db:migrate)
│   ├── gen-code.js           # 1회용 로그인 코드 생성 CLI
│   ├── migrations/
│   │   └── 001_auth.sql      # users · login_codes · sessions 테이블
│   ├── kr-search.js          # 한글 로컬 검색 (priority, aliases)
│   ├── data/kr-stocks.json   # 빌드 스크립트로 생성 (~247종)
│   ├── .env                  # FINNHUB_API_KEY, DATABASE_URL (git 제외)
│   └── .env.example
├── api/
│   └── [[...slug]].js        # Vercel 진입점 → require(backend/server)
├── scripts/
│   ├── qa.mjs                # API·정적 자동 QA
│   ├── qa-prod.mjs           # QA_BASE=프로덕션 URL
│   ├── build-kr-stocks.mjs   # kr-stocks.json 재생성
│   ├── patch-og-url.mjs      # Vercel 빌드 시 OG URL 치환
│   └── fix-pwa-assets.mjs    # 아이콘·스크린샷 리사이즈
├── docs/                     # HANDOFF, DESIGN-SYSTEM, AUTH, AI-BRIEFING, QA, 배포
├── vercel.json
├── package.json              # 루트: start, qa, vercel, build:kr-stocks
└── README.md, PROJECT.md     # 요약·로드맵 (이 HANDOFF가 더 완전함)
```

---

## 4. 아키텍처

### 4.1 로컬 (`npm start`)

```
브라우저 ──REST /api/*──► Express (backend/server.js) ──► Finnhub / Yahoo / Frankfurter
         ──WS /ws──────► Express WS 프록시 ──► Finnhub WebSocket
         ◄──정적 파일─── Express static(frontend/)
```

- `server.js`가 `frontend/` 정적 서빙 + SPA fallback + API + `/ws` WebSocket 프록시를 **한 프로세스**에서 처리.
- `FINNHUB_API_KEY`는 `backend/.env`에서 `dotenv`로 로드.

### 4.2 Vercel (프로덕션)

```
브라우저 ──정적──► Vercel CDN (frontend/*)
         ──/api/*──► Serverless api/[[...slug]].js → backend/server.js (VERCEL=1)
```

| 항목 | 로컬 | Vercel |
|------|------|--------|
| US WebSocket `/ws` | ✅ | ❌ (`wsSupported: false`) |
| US 시세 | WS + REST 폴백 | REST 폴링 ~20초 |
| KR 시세 | Yahoo 폴링 3s/60s | 동일 |
| 정적 파일 | Express | `outputDirectory: frontend` |
| API | 동일 Express 라우트 | 서버리스 함수 |

**중요:** `api/index.js`만 두면 `/api/health` 등이 **404** → 반드시 `api/[[...slug]].js` 사용.

**중요:** `outputDirectory: public` 사용 시 빌드 실패 → `frontend` 사용.

환경 변수: Vercel 대시보드에 `FINNHUB_API_KEY` (Production + Preview). `.env`는 업로드되지 않음.

### 4.3 Railway 백엔드 (목표 · RW-*)

> 상세: **[docs/DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md)**

```
브라우저 (Vercel 정적)
    ├── REST /api/*  →  https://xxx.up.railway.app  (Express 상시)
    └── WS   /ws     →  wss://xxx.up.railway.app/ws  (Finnhub 프록시)
```

| 항목 | Vercel API | Railway |
|------|------------|---------|
| US WebSocket | ❌ | ✅ `wsSupported: true` |
| 프로세스 | Serverless | 상시 Node |
| `VERCEL` env | `1` | **설정 안 함** |

프론트: `API_BASE`·`WS_URL`을 Railway URL로 주입 (RW-5). CORS에 Vercel origin 허용 (RW-6).

---

## 5. 백엔드 API 전체

| 메서드 | 경로 | US | KR | 비고 |
|--------|------|----|----|------|
| GET | `/api/health` | — | — | `finnhubConfigured`, `wsSupported` |
| GET | `/api/quote?symbol=` | Finnhub | Yahoo | |
| GET | `/api/profile?symbol=` | Finnhub | Yahoo (+ quoteSummary 시총) | |
| GET | `/api/chart?symbol=&interval=&range=&ohlc=1` | Yahoo | Yahoo | OHLC 캔들 |
| GET | `/api/search?q=&market=US\|KR` | Finnhub | 로컬+Yahoo | 한글→로컬만 |
| GET | `/api/fx?from=USD&to=KRW` | Frankfurter | | 포트폴리오 원화 합산 |
| GET | `/api/market-status` | — | — | KST/ET 장 상태 |
| GET | `/api/news?symbol=` | Finnhub 7일 (종목별) | `[]` | |
| GET | `/api/macro-news` | *(미구현 N-1)* | — | 매크로·경제 허브 |
| GET | `/api/briefing?symbol=&slot=` | *(미구현 A-1)* | US/KR | 시간대별 AI·규칙 요약 |
| POST | `/api/auth/login` | ✅ | — | DB 1회용 코드 조회 → 쿠키 발급 (env fallback) |
| GET | `/api/auth/me` | ✅ | — | 쿠키·DB 세션 검증 → `{ loggedIn, uid }` |
| POST | `/api/auth/logout` | ✅ | — | DB 세션 삭제 + 쿠키 만료 |
| POST | `/api/admin/codes` | ✅ | — | `x-admin-secret` 인증 → 코드 생성 → `{ code, expiresAt }` 반환 |
| GET/PUT | `/api/watchlist` | *(미구현 L-4)* | — | 로그인 사용자 관심종목 (DB 필요) |
| GET | `/api/metrics?symbol=` | Finnhub | `null` | |
| WS | `/ws` | Finnhub 프록시 | 미지원 | 로컬만 |

라우트 추가·수정 후 **로컬은 서버 재시작 필수**.

### 한글 검색 (`/api/search`, market=KR)

1. `hasHangul(q)` → **Yahoo 호출 안 함** (Invalid Search Query 방지).
2. `searchKrLocal(q)` → `kr-stocks.json` (priority·aliases·이름/코드 매칭).
3. 영문/숫자만 → Yahoo KR 검색과 로컬 결과 `mergeSearchResults`.

프론트: KR 탭에서 Enter 시 **검색 API로 심볼 해석** 후 추가 (`삼성전자` → `005930.KS`, 과거 `삼성전자.KS` 버그 수정됨).

---

## 6. 프론트엔드 핵심 동작

### 6.1 상태·저장 (localStorage)

| 키 | 내용 |
|----|------|
| `sp_watchlist` | 심볼 배열 (최대 20) — **L-* 이후 서버 `watchlist_items`와 동기화 예정** |
| `sp_portfolio` | `{ symbol: { shares, avgCost } }` |
| `sp_alerts` | 종목별 목표가·등락률 알림 |
| `sp_sort` | added / change / price / symbol / pnl |
| `sp_filter` | all / US / KR |
| `sp_theme` | dark / light |

### 6.2 폴링·API 큐

- `API_QUEUE_GAP_MS`: 250ms (rate limit 시 900ms).
- KR: 장중 3초, 장외 60초.
- US (WS 없을 때): 20초 폴링.
- Finnhub **429** → 배너·토스트·`enterRateLimitMode()` (`/api/health`의 `wsSupported`와 별개).

### 6.3 UI (최근 변경 포함)

- **관심목록 카드:** **종목명(위)** + **종목코드(아래)** — 사용자 친화적 순서 (2026-05-19).
- 모달: `ensureModalOnBody()` — `document.body`로 이동해 헤더에 가리지 않음.
- **(예정 A-4)** 모달 상단 **AI 브리핑** — 장전(전일)·12시 이후 오전장·장마감 후(당일). [AI-BRIEFING.md](./AI-BRIEFING.md)
- 포트폴리오: US/KR 분리 + US+KR 동시 보유 시 **원화 통합 카드** (`/api/fx`).
- URL 공유: `?watchlist=SYMBOL1,SYMBOL2` + 선택 `pf`, `al` (base64).
- 모바일: 카드 스와이프 삭제.

### 6.4 PWA

- `manifest.json`: icon-192/512 PNG, screenshots wide(1280×720)·narrow(390×844).
- `sw.js`: `stockpulse-v4`, `/api/*`·`/ws`는 캐시 안 함.
- **Windows 바탕화면 아이콘:** 설치 시점 스냅샷 → manifest만 바꿔도 **재설치 전까지 안 바뀔 수 있음** (`chrome://apps` 제거 후 재설치).

---

## 7. 구현 완료 범위 (로드맵)

| 단계 | 내용 | 상태 |
|------|------|------|
| **P0** | 백엔드 프록시, 키 보호, CORS 제거, 재시도, 실차트 | ✅ |
| **P1** | KR 폴링·큐, 카드 로딩/에러, .KQ, 장 뱃지 | ✅ |
| **P2** | 캔들·검색·정렬/필터·포트폴리오·알림 | ✅ |
| **P3** | 테마·뉴스·재무(US)·URL공유·PWA·스와이프·JSON 백업 | ✅ |
| **B** | 통합 손익·공유 확장·KR 시총·한글 검색 인덱스 확장 | ✅ |
| **운영** | Vercel 배포, QA 자동화, OG/Kakao, rate limit UX | ✅ |
| **PWA** | 512/192 PNG, screenshots, DevTools installability 수정 | ✅ |
| **DS** | Minimal+Glass Hybrid 리디자인 (DS-0~DS-9) | ✅ 2026-05-20 |

---

## 8. 운영·QA 현황 (2026-05-21)

| 항목 | 상태 |
|------|------|
| O-1 Vercel `FINNHUB_API_KEY` | ✅ 사용자 완료 |
| O-2 `npm run qa:prod` | ✅ **43/43 PASS** (2026-05-19 확인) |
| O-3 브라우저 수동 QA | ✅ 사용자 완료 |
| O-4 카카오 링크 미리보기 | ✅ |
| O-5 Git 첫 커밋 | ✅ 2026-05-20 (`41363fc`) |
| D-2 / D-5 PWA 512·192 PNG + screenshots | ✅ (`npm run fix:pwa`) |
| D-2b PWA 설치·바탕화면 아이콘 | ⬜ 사용자 최종 확인 |
| O-6 / O-7 문서·HANDOFF | ✅ 2026-05-21 |
| UI-1 카드 종목명 위·코드 아래 | ✅ 2026-05-19 |
| DS-0~9 Minimal+Glass 리디자인 | ✅ 2026-05-20 |
| DS-10 PWA 스크린샷 갱신 | ⬜ `npm run fix:pwa` 후 재배포 필요 |
| L-0 Docker PostgreSQL 5433 + DATABASE_URL | ✅ 2026-05-21 |
| L-1 DB 마이그레이션 (users, login_codes, sessions) | ✅ 2026-05-21 |
| L-2 `POST /api/auth/login` (DB 코드 조회 + env fallback) | ✅ 2026-05-21 |
| L-3 `GET /api/auth/me` + `POST /api/auth/logout` (DB 세션) | ✅ 2026-05-21 |
| L-5 1회용 코드 생성 CLI (`gen-code.js`) | ✅ 2026-05-21 |
| L-6 SPA 인증 가드 + 로그아웃 버튼 | ✅ 2026-05-21 |

```bash
npm run install:all
cp backend/.env.example backend/.env   # FINNHUB_API_KEY=, DATABASE_URL=
npm run db:up                        # Docker PostgreSQL 시작 (포트 5433)
npm run db:migrate                   # 테이블 생성 (최초 1회)
npm run db:gen-code                  # 1회용 로그인 코드 생성 (랜덤)
npm run db:gen-code -- --code SP-USER-0001  # 커스텀 코드 지정
npm run test:auth                    # 인증 통합 테스트
npm start                            # 로컬
npm run qa                           # localhost:3000
npm run qa:prod                      # 프로덕션 URL
npm run build:kr-stocks              # kr-stocks.json 재생성
npm run fix:pwa                      # 아이콘·스크린샷 리사이즈
npx vercel deploy --prod             # 배포 (Git 없이 CLI 업로드 가능)
npm run clean                        # 압축 전 node_modules·.vercel 삭제
```

압축·백업: [docs/ARCHIVE.md](./ARCHIVE.md)

---

## 9. 알려진 제한사항 (반드시 숙지)

| 영역 | 제한 |
|------|------|
| 한국 실시간 | Yahoo 지연 + 3초 폴링 (HTS 아님) |
| 한국 검색 | `kr-stocks.json`에 없는 종목은 한글 검색 불가 |
| 한국 뉴스/재무 | API 없음 → 모달 안내 문구 |
| Finnhub 무료 | Rate limit, WS 구독 수 제한 |
| Yahoo | 비공식 API, 스펙 변경·차단 위험 |
| Vercel API | WS 없음, serverless 30s (→ **Railway로 API 이전 예정**) |
| 포트폴리오 원화 | Frankfurter **일일** 환율 |
| 데이터 영속성 | 현재 localStorage만 · **L-* 후 로그인 사용자는 DB 관심목록** |
| Git | ✅ 초기화 완료 (`main` 브랜치, `41363fc`) |

---

## 10. 주요 버그·이슈 이력 (재발 방지)

| ID | 문제 | 해결 |
|----|------|------|
| QA-05 | 한글 검색 실패 | `kr-stocks.json` + `kr-search.js` |
| QA-06 | `삼성전자.KS` 잘못된 심볼 | KR 검색 API로 해석 후 추가 |
| QA-07 | `삼성` 검색 1위 오류 | `priority`·별칭 `삼전` |
| DEPLOY-01 | Vercel `/api/*` 404 | `api/[[...slug]].js` |
| DEPLOY-02 | `public` output 오류 | `outputDirectory: frontend` |
| DEPLOY-03 | `functions`+`builds` 동시 사용 불가 | `functions`+`rewrites`만 |
| UI | 모달 헤더에 가림 | `z-index`, `ensureModalOnBody()` |
| UI | 배당률 % 표시 오류 | `formatFinnhubPercent` |
| PWA | icon 크기·스크린샷 | 512×512 PNG, wide/narrow screenshots |

---

## 11. 앞으로의 개발 방향

### 11.1 1순위 — Railway 백엔드 배포

> 상세: **[docs/DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md)**

| ID | 작업 | 요약 |
|----|------|------|
| RW-0~RW-4 | Railway 서비스·env·배포 | Docker 이미지 방식으로 전환, Hub push 대기 중 |
| RW-5 | 프론트 API_BASE/WS_URL | Railway URL 확정 후 진행 |
| RW-6 | CORS | ✅ `CORS_ORIGINS` 미들웨어 (`server.js`) |
| Docker | Dockerfile + 빌드·테스트 | ✅ `wsSupported: true` 로컬 확인 완료 |
| RW-7~RW-8 | QA·역할 분담 | `wsSupported: true`, Vercel API 유지 여부 |
| RW-9 | (선택) | Railway Postgres + L-* |

**목표:** Vercel은 **프론트+PWA** 유지, **API·WebSocket은 Railway**로 이전 → US 실시간 시세.

### 11.1-B 1-B순위 — 디자인 (Minimal + Glass Hybrid) ✅ 2026-05-20 완료

> 상세: **[docs/DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)** · 구현: `frontend/style.css`

| ID | 작업 | 상태 |
|----|------|------|
| DS-0~DS-2 | 토큰·배경·Glass | ✅ |
| DS-3~DS-4 | Typography·컴포넌트 | ✅ |
| DS-5~DS-6 | IA·우선순위 | ✅ |
| DS-7~DS-9 | Light·모바일·reduced-motion·폴백 | ✅ |
| DS-10 | PWA 스크린샷 갱신 | ⬜ `npm run fix:pwa` 필요 |

**완료:** 그리드·네온 제거, glass 카드·모달·헤더, flat 버튼, subtle body gradient  
**남은 것:** DS-10 — `npm run fix:pwa` 실행 후 Vercel 재배포 시 PWA 스크린샷 반영

### 11.2 2순위 — 운영 마무리

| ID | 작업 | 비고 |
|----|------|------|
| O-5 | Git 초기화·첫 커밋 | `.env`, `.vercel`, `node_modules` 제외 |
| D-2b | PWA 설치·바탕화면 아이콘 최종 확인 | [docs/PWA-INSTALL.md](./PWA-INSTALL.md) |
| D-3 | Vercel Functions 로그 | 429·타임아웃 |
| D-4 | `og-image.png`·`icon-512.png` 용량 최적화 | icon-192: 28KB · icon-512: 196KB · og-image: 120KB — 허용 범위 |

### 11.3 3순위 — Vercel·PWA

| ID | 작업 | 비고 |
|----|------|------|
| D-2b | PWA 설치·바탕화면 아이콘 | [PWA-INSTALL.md](./PWA-INSTALL.md) |
| D-3 | Functions 로그 | 429·타임아웃 |
| D-4 | 이미지 용량 최적화 | og-image, icon-512 |

### 11.4 4순위 — MVP 로그인·DB

> [AUTH-MVP.md](./AUTH-MVP.md) — 일회용 코드 · `watchlist_items` 서버 저장 (L-0~L-8)

| ID | 상태 | 내용 |
|----|------|------|
| L-0 | ✅ 2026-05-21 | Docker PostgreSQL 5433 + `DATABASE_URL` 설정 |
| L-1 | ✅ 2026-05-21 | `users` · `login_codes` · `sessions` 테이블 생성 (001_auth.sql) |
| L-2 | ✅ 2026-05-21 | `POST /api/auth/login` — DB 1회용 코드 조회 + env fallback |
| L-3 | ✅ 2026-05-21 | `GET /api/auth/me` + `POST /api/auth/logout` — DB 세션 검증/삭제 |
| L-5 | ✅ 2026-05-21 | 1회용 코드 생성 CLI (`backend/gen-code.js`) |
| L-6 | ✅ 2026-05-21 | `login.html` UI + SPA 인증 가드 (`app.js init()`) + 헤더 로그아웃 버튼 |
| L-4 | ⬜ | `/api/watchlist` CRUD — DB 연결 완료, 구현 대기 |
| L-7~9 | ⬜ | localStorage↔서버 병합·포트폴리오·알림 DB 확장 |

**현재 인증 방식:**
- `npm run db:gen-code` 로 1회용 코드 생성 → DB `login_codes` 저장
- 로그인 시 DB 코드 조회 → 사용 후 `used_at` 기록 (재사용 불가)
- 신규 사용자 자동 생성(`users`), 세션 DB 저장(`sessions`)
- DB 없거나 오류 시 `AUTH_CODE` 환경변수로 fallback (하위호환)
- Vercel은 DATABASE_URL 없으므로 env 모드 동작

**Slack 링크 수정 필요:** `#slackRequestBtn` href를 실제 워크스페이스 채널로 교체

### 11.5 5순위 — AI 종목 브리핑 (관심종목 클릭)

> [AI-BRIEFING.md](./AI-BRIEFING.md) — 장전 / 12시 이후 오전장 / 장마감 후 (A-0~A-7)

### 11.6 6순위 — 한국 시장 심화

| ID | 작업 | 설명 |
|----|------|------|
| K-1 | `kr-stocks` 종목 추가 | `build-kr-stocks.mjs` |
| K-2 | KRX 전 종목 자동 갱신 | 수동 JSON 한계 해소 |
| K-3 | 한국 뉴스 | Finnhub 미지원 → 별도 API |
| K-4 | 한국 재무 | 모달 지표 확장 |
| K-5 | KIS/KRX 실시간 시세 | Yahoo 대체, **계좌·API 키 필요** |

#### 외국인 수급 (별도 기획, 미구현)

| Phase | 내용 | 데이터 |
|-------|------|--------|
| 0 | TR·약관 조사 | KIS Open API, KRX 일별 |
| 1 | 일별 확정 순매수 | `/api/investor-flow`, KR 모달 |
| 2 | 장중 지연 + 캐시 | KIS, Vercel 한도 고려 |
| 3 | 준실시간 | 유료 피드·상시 워커 검토 |

**KIS Open API 참고:** API 사용료는 통상 **무료**(거래 수수료·계좌·호출 한도 별도). Windows 설치 아이콘은 manifest `icons`가 설치 후 자동 갱신 안 될 수 있음.

### 11.7 7순위 — 미국 매크로·경제 뉴스 (Bloomberg 등)

> 상세: **[docs/NEWS-FEED.md](./NEWS-FEED.md)**

| ID | 작업 | 설명 |
|----|------|------|
| N-0 | 소스·약관 조사 | 스크랩 vs Finnhub/RSS; **Bloomberg 본문 스크랩 비권장** |
| N-1 | `/api/macro-news` | 매크로·경제 헤드라인 (기존 종목별 `/api/news`와 분리) |
| N-2 | 수집·캐시 | Cron·중복 제거·429 대비 |
| N-3 | 「미국 경제」 UI | 제목·출처·원문 링크 패널 |
| N-4 | 정리·필터 | 카테고리·관심종목 연관·기간 |
| N-5 | (선택) 요약 | 3줄 브리핑, 본문 복제 금지 |
| N-6 | 출처·면책 | LEGAL-DISCLAIMER 연동 |

**현재:** US **종목 모달** 뉴스만 Finnhub `company-news` (P3). KR·매크로 허브는 미구현.

### 11.8 8순위 — 품질

| ID | 작업 |
|----|------|
| Q-1 | `/api/*` 단위 테스트 (`node:test` 또는 Jest) |
| Q-2 | CI에서 `npm run qa:prod` |
| — | SW 캐시 버전 배포마다 bump (`stockpulse-vN`) |

### 11.9 9순위 — UX·기능 백로그

- 검색 자동완성도 **이름 위 / 코드 아래** 통일 (카드 UI-1은 완료)
- US WebSocket on Vercel 대안 (상시 서버 또는 폴링 유지)
- 커스텀 도메인
- 알림·스와이프 실기기 회귀 테스트 자동화 (어려움)

### 11.10 수익화 — 가장 빠른 시도 순 (요약)

> 상세·체크리스트·문구: **[docs/MONETIZATION.md](./MONETIZATION.md)** · 고지 템플릿: **[docs/LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md)**

| 순위 | 방식 | 소요 | 코드 | 비고 |
|------|------|------|------|------|
| **1** | **면책·약관·개인정보** | 1일 | 정적 페이지·푸터 | 수익화 **전 필수** (M-2) |
| **2** | **후원·팁** (토스·Ko-fi 등) | 당일 | 푸터 링크만 | 트래픽 적으면 ₩0 (M-1) |
| **3** | **증권사 제휴 링크** | 1~2주 | 푸터·모달 CTA | 「제휴」표시·심사 대기 (M-4) |
| **4** | **템플릿·소스 판매** | 3~7일 | 패키징·Gumroad | HANDOFF 포함 판매 (M-6) |
| **5** | **AdSense** | 2~4주 | 광고 슬롯 | 트래픽·금융 콘텐츠 심사 (M-5) |
| **6** | **프리미엄** (종목 수·동기화) | 2~4주+ | DB·결제 | Form으로 의향 먼저 (M-7) |

**이번 주 권장:** M-2(고지) → M-1(후원) → M-3(Analytics) → M-4(제휴 신청)

**하지 말 것:** Finnhub/Yahoo 데이터 재판매 API, 수익률·매수 추천 문구, API 키 유료 노출.

**손익 감:** Vercel·Finnhub 무료로 운영 가능 → 트래픽 없으면 Tier 1만으로는 거의 수익 없음. 제휴 1건 또는 유료 구독 10명급이 1차 목표.

---

## 12. 새 AI/개발자 온보딩 체크리스트

1. 이 문서(`HANDOFF.md`) 읽기  
2. `npm run install:all` → `backend/.env`에 `FINNHUB_API_KEY`  
3. `npm start` → http://localhost:3000  
4. `npm run qa` → 전부 PASS 확인  
5. 코드 진입점: `frontend/app.js` `init()`, `backend/server.js` 라우트  
6. 배포 변경 시: `vercel.json` + `api/[[...slug]].js` + `npx vercel deploy --prod`  
7. KR 검색 종목 추가: `scripts/build-kr-stocks.mjs` 편집 → `npm run build:kr-stocks` → 서버/배포 재시작  

**하지 말 것**

- 프론트에 Finnhub 키 넣기  
- `file://`로 index.html 열기  
- `api/index.js`만으로 Vercel 배포 (하위 경로 404)  
- Git 없이 `.env` 커밋  

---

## 13. 환경 변수

| 변수 | 위치 | 필수 |
|------|------|------|
| `FINNHUB_API_KEY` | `backend/.env` / Vercel Env | US 기능 필수 |
| `PORT` | `backend/.env` | 선택 (기본 3000) |
| `VERCEL` | Vercel 자동 | 서버가 정적 서빙·WS 분기 |
| `AUTH_CODE` | `backend/.env` / Vercel Env | fallback 인증 코드 (쉼표 구분 다중 지원, 대소문자 무시) |
| `SESSION_SECRET` | `backend/.env` / Vercel Env | 세션 쿠키 HMAC 서명 비밀키 (기본값: `dev-secret-change-me`) |
| `DATABASE_URL` | `backend/.env` | PostgreSQL 연결 URL (없으면 env 모드). 예: `postgresql://stockpulse:localdev@127.0.0.1:5433/stockpulse` |
| `ADMIN_SECRET` | `backend/.env` | 관리자 API 키 — `POST /api/admin/codes` 헤더 `x-admin-secret` 값 |

---

## 14. 데이터 흐름 다이어그램

```
[US 종목 AAPL]
  추가 → GET /api/quote (Finnhub)
       → 로컬: WS /ws 구독 → 실시간 tick
       → Vercel: 폴링 ~20s (wsSupported: false)

[KR 종목 005930.KS]
  추가 → GET /api/quote (Yahoo)
       → 폴링: 장중 3s / 장외 60s
       → 검색(한글): kr-stocks.json only
```

---

## 15. 보조 문서 (선택 읽기)

| 파일 | 용도 |
|------|------|
| **docs/HANDOFF.md** | **이 문서 (마스터)** |
| README.md | 빠른 시작 |
| docs/TASKS.md | 작업 ID 트래킹 |
| docs/DEPLOY.md | Vercel·Railway 배포, PWA 설치, OG·카카오, 백업 |
| docs/AUTH.md | 인증 현황 (Phase 1 완료) + Phase 2 DB 계획 |
| docs/QA.md | 자동·수동 QA 체크리스트 + 최근 결과 |
| docs/ROADMAP.md | AI 브리핑·매크로 뉴스·수익화·한국 시장 |
| **docs/DESIGN-SYSTEM.md** | Minimal + Glass Hybrid · 토큰·IA·컴포넌트 규칙 |
| **docs/LEGAL-DISCLAIMER.md** | 면책·제휴·개인정보 템플릿 |

---

## 16. 의사결정 로그 (요약)

| 결정 | 이유 |
|------|------|
| Vanilla JS (프레임워크 없음) | 단순 배포·학습 곡선 |
| Finnhub + Yahoo 조합 | US WS·무료 tier / KR Yahoo 무료 |
| KR 한글 검색 로컬 JSON | Yahoo 한글 거부 |
| Vercel serverless | Git 없이 CLI 배포 요청 |
| localStorage | MVP 속도; **L-* 로 관심목록만 DB 이전 예정** |
| Git 보류 | 사용자가 마지막에 진행하기로 |
| 수익화 문서 분리 | HANDOFF는 요약, MONETIZATION·LEGAL에 상세 |
| 인증: HMAC 쿠키 | Stateless 토큰 — 서버 재시작 후 세션 유지, Vercel serverless 동작 |
| DB: Docker PostgreSQL 5433 | 로컬 5432 충돌 회피; Railway 배포 시 Railway Postgres URL로 교체 |
| DB auth: 환경변수 fallback 유지 | Vercel(DB 없음) + 기존 env 코드 하위호환 동시 지원 |

---

*문서 유지: 기능·배포·수익화 실험 시 HANDOFF §11.5·MONETIZATION.md를 함께 갱신할 것.*
