# StockPulse — 작업 로그

> 세션별 작업 내용 기록. 최신 항목이 위에 오도록 유지.

---

## 2026-05-21

### 완료 작업

#### 1. Railway Dockerfile 빌드 오류 수정 (DEPLOY-04 / DEPLOY-05)

**증상:** Railway 배포마다 `[ERRO] COPY backend/ ./backend/ → /backend: not found` 로 빌드 실패

**원인:** Railway 서비스 루트가 `backend/`로 설정되어 있어 Docker build context = `backend/`.
Dockerfile이 `COPY backend/ ./backend/`를 시도하면 `backend/backend/` 를 찾게 되어 실패.

**수정 내용:**
| 파일 | Before | After |
|------|--------|-------|
| `Dockerfile` | `COPY backend/ ./backend/` | `COPY . ./` |
| `Dockerfile` CMD | `node backend/server.js` | `node server.js` |
| `Dockerfile` CMD | `node backend/migrate.js` | `node migrate.js` |
| `backend/package-lock.json` | `file:..` symlink 참조 포함 | isolated 디렉터리에서 재생성 (참조 제거) |
| `backend/.dockerignore` | 없음 | `.env`, `node_modules` 제외 추가 |

---

#### 2. Railway 백엔드 배포 완료 (RW-0 ~ RW-4, RW-6, RW-9)

**배포 URL:** `https://stock-tracker-production-7e54.up.railway.app`

- `/api/health` → `{"ok":true,"finnhubConfigured":true,"wsSupported":true}` ✅
- Railway Postgres `DATABASE_URL` 참조변수 연결 (`${{Postgres.DATABASE_URL}}`) ✅
- 배포 시 `migrate.js` 자동 실행 → `001_auth.sql` 마이그레이션 확인 ✅
- 환경변수: `FINNHUB_API_KEY`, `SESSION_SECRET`, `ADMIN_SECRET`, `CORS_ORIGINS` ✅

**검증:**
```bash
# 코드 생성 → 로그인 → 세션 확인 → 재사용 차단 전부 통과
curl https://stock-tracker-production-7e54.up.railway.app/api/health
# {"ok":true,"finnhubConfigured":true,"wsSupported":true}
```

---

#### 3. RW-5: 프론트엔드 ↔ Railway 완전 연동

**목표:** Vercel 프론트가 Railway 백엔드를 사용하도록 연결 (쿠키 동작 유지 + WebSocket 활성화)

**설계 결정:**
- `API_BASE = ''` 유지 + Vercel rewrite로 `/api/*` → Railway 프록시
  - 브라우저 관점에서 same-origin → 쿠키 `SameSite=Strict` 정상 작동
- WebSocket은 Vercel이 프록시 불가 → 브라우저가 Railway WSS에 직접 연결

**변경 파일:**

| 파일 | 변경 내용 |
|------|----------|
| `vercel.json` | `functions` 섹션 제거 → `rewrites` 추가: `/api/:path*` → Railway |
| `frontend/app.js` | `WS_PATH`: 로컬 `ws://localhost/ws`, 배포 `wss://railway.app/ws` 직접 연결 |
| `api/[[...slug]].js` | **삭제** — Vercel API Route가 rewrite보다 우선순위 높아 충돌 발생 |

**최종 아키텍처:**
```
브라우저
  ├── 정적 파일  → Vercel CDN
  ├── /api/*    → Vercel rewrite → Railway Express (DB 세션, 1회용 코드)
  └── WebSocket → wss://stock-tracker-production-7e54.up.railway.app/ws
                  (US 실시간 시세 wsSupported: true ✅)
```

**검증:**
```
GET  https://stock-tracker-opal-six.vercel.app/api/health
→ {"ok":true,"finnhubConfigured":true,"wsSupported":true}

POST https://stock-tracker-opal-six.vercel.app/api/auth/login  { code }
→ {"ok":true}  + Set-Cookie: sp_sess (Vercel 도메인)

GET  https://stock-tracker-opal-six.vercel.app/api/auth/me
→ {"loggedIn":true,"uid":"..."}
```

---

#### 4. ADMIN_SECRET 교체 (셸 특수문자 이슈)

**증상:** `curl -H "x-admin-secret: ((S)Xkkk*&@KJJJO2399SD!%#"` → `{"error":"unauthorized"}`

**원인:** `(`, `!`, `&` 등이 bash/zsh에서 명령어 확장·이력 치환으로 해석되어 실제 전송값이 달라짐

**해결:** Railway ADMIN_SECRET을 셸 안전 값(hex 대문자 + 하이픈)으로 교체

```
신규 ADMIN_SECRET: EA1C-0597-5301-8E3D-65D0-44BC-3BD8-FE51-8A6D-0D81
```

---

#### 5. 문서 최신화

- `docs/HANDOFF.md` — Railway URL, RW-* 완료 상태, 4.3절 업데이트, 버그 이력 DEPLOY-04/05 추가
- `docs/TASKS.md` — RW-0~5, RW-9 완료 처리, 완료 목록 이동
- `docs/AUTH.md` — 배포 환경별 동작 표 추가, Railway admin API curl 예시 추가

---

### 커밋 이력 (오늘)

| 해시 | 메시지 |
|------|--------|
| `a37678e` | fix: Dockerfile 경로 수정 — Railway 서비스 루트(backend/) 기준으로 변경 |
| `a36730b` | docs: Railway 배포 완료 반영 — HANDOFF, TASKS, AUTH 최신화 |
| `c09cd2b` | feat(RW-5): 프론트엔드 Railway 백엔드 연동 |
| `872e281` | docs: RW-5 완료 반영 — HANDOFF, TASKS 최신화 |
| `2ed0f58` | docs: WORK-LOG.md 생성 |
| `c0d63ca` | feat(M-2/M-3): 법적 고지 페이지 + GA4 스크립트 + 사이트 푸터 |

---

### 현재 프로덕션 엔드포인트

| 역할 | URL |
|------|-----|
| 프론트엔드 | https://stock-tracker-opal-six.vercel.app |
| 백엔드 API | https://stock-tracker-production-7e54.up.railway.app |

---

### 다음 작업 후보

| ID | 작업 | 우선순위 |
|----|------|----------|
| M-3 실 ID | GA4 콘솔에서 측정 ID 발급 후 `G-XXXXXXXXXX` 4곳 교체 | 높음 |
| A-0~A-2 | AI 브리핑 MVP (규칙 기반, LLM 없음) — AdSense 콘텐츠 강화 | 높음 |
| M-5 | Google AdSense 신청 (M-2/M-3 완료 후) | 중간 |
| RW-7 | `npm run qa:prod` Railway 백엔드 기준으로 재검사 | 낮음 |

---

## 이전 세션 (요약)

### 2026-05-21 (이전 세션)

- **L-0~L-6, L-9** PostgreSQL DB 인증 구현
  - Docker PostgreSQL 5433 (로컬 5432 충돌 회피)
  - `users`, `login_codes`, `sessions` 테이블 마이그레이션
  - `POST /api/auth/login` — DB 1회용 코드 + env fallback
  - `GET /api/auth/me`, `POST /api/auth/logout` — DB 세션 검증·삭제
  - `backend/gen-code.js` CLI (`--code`, `--days`, `--note`)
  - `POST /api/admin/codes` 관리자 API
  - SPA 인증 가드 (`app.js init()`) + 로그아웃 버튼 (`index.html`)
- **테스트:** `npm run test:auth` 10/10 PASS

### 2026-05-20

- **DS-0~DS-9** Minimal + Glass Hybrid 리디자인 완료
- Git 첫 커밋 (`41363fc`)
- Vercel 배포, QA 43/43 PASS
- Dockerfile 작성 (Railway 배포 준비)
