# Railway 백엔드 배포

**최종 갱신:** 2026-05-19  
**작업 ID:** RW-0 ~ RW-9 ([TASKS.md](./TASKS.md))

---

## 1. 목표

| 현재 (Vercel only) | Railway 적용 후 |
|--------------------|-------------------|
| API = Serverless Functions | **상시 Node 프로세스** |
| US WebSocket **불가** (`wsSupported: false`) | **`/ws` Finnhub 프록시 가능** |
| 30s 타임아웃·콜드스타트 | 장시간 연결·WS에 유리 |

**권장 아키텍처 (하이브리드):**

```
[Vercel]  frontend/ 정적 + PWA  →  https://stock-tracker-….vercel.app
[Railway] backend/server.js      →  https://stockpulse-api.up.railway.app
         /api/*  REST
         /ws     WebSocket (US 실시간)
```

프론트는 `API_BASE`·`WS_URL`을 Railway URL로 설정 ([RW-5](#rw-5-프론트-api--websocket-연결)).

---

## 2. Railway에 적합한 이유

- `backend/server.js`는 이미 **`!process.env.VERCEL`** 일 때 `http.listen` + `WebSocketServer` 동작
- Railway는 `PORT` 환경 변수 자동 주입 → **추가 코드 최소**
- Finnhub WS·KR 폴링을 **한 백엔드**에서 처리

---

## 3. 배포 설정 (RW-1 ~ RW-3)

### 3.1 Railway 프로젝트

1. [railway.app](https://railway.app) 로그인  
2. **New Project** → **Deploy from GitHub** 또는 **Empty + CLI**  
3. 서비스 **Root Directory:** `backend` (또는 monorepo면 아래 Start Command 참고)

### 3.2 Start Command

**옵션 A — Root Directory = `backend`**

```bash
npm install && npm start
```

`backend/package.json` → `"start": "node server.js"`

**옵션 B — Repo 루트에서 배포**

```bash
npm install --prefix backend && npm start --prefix backend
```

### 3.3 환경 변수 (Railway Variables)

| 변수 | 필수 | 설명 |
|------|------|------|
| `FINNHUB_API_KEY` | ✅ | Finnhub REST + WS |
| `PORT` | 자동 | Railway가 설정 (수동 설정 불필요) |
| `NODE_ENV` | 선택 | `production` |

**설정하지 말 것:** `VERCEL=1` (설정 시 WS·listen 비활성)

### 3.4 Health Check

- Path: `/api/health`  
- 기대: `{ "ok": true, "finnhubConfigured": true, "wsSupported": true }`

---

## 4. 구현 작업 (RW-*)

| ID | 작업 | 상태 |
|----|------|------|
| RW-0 | Railway 계정·프로젝트·배포 방식 결정 (Git vs CLI) | ⬜ |
| RW-1 | Railway 서비스 생성 (`backend` 루트, Node 18+) | ⬜ |
| RW-2 | `FINNHUB_API_KEY` 등 환경 변수 등록 | ⬜ |
| RW-3 | 첫 배포·`/api/health`·`wsSupported: true` 확인 | ⬜ |
| RW-4 | 공개 URL 발급·HTTPS (`*.up.railway.app`) | ⬜ |
| RW-5 | 프론트 `API_BASE`·`WS_URL` Railway 연동 | ⬜ |
| RW-6 | CORS (Vercel origin → Railway API 허용) | ⬜ |
| RW-7 | `qa:prod` 분리 또는 `QA_API_BASE` env | ⬜ |
| RW-8 | Vercel rewrites vs 직접 cross-origin 정리·문서화 | ⬜ |
| RW-9 | (선택) Railway에 DB(L-*) 동일 호스트 배치 | ⬜ |

---

## 5. RW-5: 프론트 API · WebSocket 연결

현재 `frontend/app.js`:

```javascript
const API_BASE = ''; // same-origin
```

**Railway 분리 시 변경 방향:**

```javascript
const API_BASE = window.__API_BASE__ || '';  // 빌드/런타임 주입
const WS_URL = (() => {
  const base = window.__WS_BASE__ || (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;
  return `${base}/ws`;
})();
```

| 배포 | `__API_BASE__` | `__WS_BASE__` |
|------|----------------|---------------|
| 로컬 `npm start` | `''` | same host |
| Vercel only (현状) | `''` | same host (WS 없음) |
| Vercel + Railway | `https://xxx.up.railway.app` | `wss://xxx.up.railway.app` |

**주입 방법 (택1):**

- `index.html` 빌드 시 placeholder + `scripts/patch-api-url.mjs` (OG 패치와 유사)  
- Vercel env `RAILWAY_API_URL` → buildCommand에서 치환  

---

## 6. RW-6: CORS

Vercel 프론트 → Railway API **cross-origin** 시 `backend/server.js`에:

```javascript
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
// 예: https://stock-tracker-opal-six.vercel.app,http://localhost:3000
```

- `express` + `cors` 미들웨어 또는 수동 `Access-Control-Allow-Origin`  
- WebSocket: Railway 도메인으로 직접 연결 시 CORS와 별개 (Origin 검사는 WS 핸드셰이크)

---

## 7. Vercel과의 역할 분담

| 항목 | Vercel | Railway |
|------|--------|---------|
| HTML/CSS/JS/PWA | ✅ | (선택) static 가능 |
| `/api/*` | Serverless (현재) | **이전 후 ✅** |
| `/ws` | ❌ | ✅ |
| OG·PWA 아이콘 | ✅ | — |
| L-* DB | — | Postgres plugin 가능 |

**Vercel API 제거 여부:** Railway 안정화 후 `api/[[...slug]].js`·`functions` 제거 또는 유지(폴백) — RW-8에서 결정.

---

## 8. 검증

```bash
# Railway URL (예시)
curl https://YOUR_APP.up.railway.app/api/health

# 기대
# { "ok": true, "finnhubConfigured": true, "wsSupported": true }
```

프론트 연동 후:

- 헤더 WS 상태 **연결됨** (US 종목)  
- `npm run qa:prod` — `QA_API_BASE=https://xxx.up.railway.app` (RW-7)

---

## 9. 비용·운영

- Railway Hobby / Trial — 소규모 트래픽 MVP  
- 슬립 정책 확인 (무료 tier idle sleep 시 WS 끊김 가능 → 유료·always-on 검토)  
- 로그: Railway Dashboard → Deployments → Logs  

---

## 10. 관련 문서

- [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md) — 프론트·기존 API  
- [HANDOFF.md](./HANDOFF.md) — 아키텍처  
- [AUTH-MVP.md](./AUTH-MVP.md) — DB를 Railway Postgres에 둘 수 있음 (RW-9)

---

*배포 URL 확정 후 HANDOFF 프로덕션 URL·`wsSupported` 표를 갱신할 것.*
