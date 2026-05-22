# StockPulse — 작업 로그

> 세션별 작업 내용 기록. 최신 항목이 위에 오도록 유지.

---

## 2026-05-22

### 완료 작업

#### 1. 토스트 알림 z-index 수정 (BUG-01)

**증상:** 대시보드 모달이 열린 상태에서 보유 수량 저장 시 토스트 알림이 모달 뒤에 가려짐

**원인:** `.toast-container { z-index: 300 }` < `.modal-overlay { z-index: 1000 }`

**수정 내용:**
| 파일 | Before | After |
|------|--------|-------|
| `frontend/style.css` | `.toast-container { z-index: 300 }` | `.toast-container { z-index: 1100 }` |

---

#### 2. GA4 실 측정 ID 교체 (M-3b)

Google Analytics 4 콘솔에서 측정 ID(`G-KMCM3VCKN6`) 발급 후, 전체 HTML 4곳의 `G-XXXXXXXXXX` 플레이스홀더를 실제 ID로 교체.

| 파일 | 교체 위치 |
|------|----------|
| `frontend/index.html` | `<script async src="gtag.js?id=G-KMCM3VCKN6">` |
| `frontend/login.html` | 동일 |
| `frontend/disclaimer.html` | 동일 |
| `frontend/privacy.html` | 동일 |

---

#### 3. 로그인 코드 요청 시스템 구현 (REQ-1~5)

**목표:** 사용자가 이메일을 입력하고 방식 선택 → 관리자 Slack 알림 → 코드 자동 발송

**구현 범위:**

| 항목 | 내용 |
|------|------|
| DB 마이그레이션 | `backend/migrations/003_access_requests.sql` — `access_requests` 테이블 추가 |
| 신규 엔드포인트 3개 | `POST /api/access-requests`, `GET /api/access-requests/:token/status`, `POST /api/admin/approve-request` |
| Slack Webhook | `sendSlackNotification()` — 요청 수신 시 승인 curl 명령 포함 알림 발송 |
| Gmail SMTP | nodemailer `getMailer()` — 코드 생성 시 이메일 자동 발송 |
| 프론트 FAB 패널 교체 | "Slack으로 즉시 받기" + "이메일로 받기" 두 버튼 + 대기 UI (SVG 스피너·카운트다운) |
| 신규 환경변수 | `SLACK_WEBHOOK_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `BACKEND_URL` |

**Flow A (이메일):**
```
사용자 이메일 입력 → POST /api/access-requests { delivery:'email' }
→ DB 행 생성 + Slack 알림 → 관리자 curl 승인
→ nodemailer Gmail SMTP → 사용자 이메일로 코드 발송
```

**Flow B (즉시):**
```
사용자 이메일 입력 → POST /api/access-requests { delivery:'instant' }
→ DB 행 생성 + Slack 알림 → 대기 UI + 5초 폴링 시작
→ 관리자 curl 승인 → 코드 DB 저장 + 이메일 동시 발송
→ 다음 폴링 응답 { status:'approved', code:'SP-XXXX-XXXX' }
→ autoLogin(code) → 자동 로그인 + 리다이렉트
```

---

#### 4. migrate.js 자동 스캔 수정 (BUG-02)

**증상:** `003_access_requests.sql` 추가 후에도 DB 테이블이 생성되지 않아 `internal_error` 발생

**원인:** `migrate.js`에 마이그레이션 파일 목록이 하드코딩(`['001_auth.sql', '002_watchlist.sql']`)되어 있어 신규 파일 자동 인식 불가

**수정 내용:**
```js
// Before: 하드코딩
const migrations = ['001_auth.sql', '002_watchlist.sql'];

// After: 디렉터리 자동 스캔
const migrations = fs
  .readdirSync(path.join(__dirname, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
```

---

#### 5. 즉시 받기 자동 로그인 개선

폴링으로 코드를 수신하면 입력 필드에 넣고 버튼 클릭을 유도하는 방식 → `autoLogin(code)` 함수로 코드 자동 입력 + `POST /api/auth/login` 직접 호출 → 성공 시 즉시 `window.location.href = '/'` 리다이렉트.

---

#### 6. 이메일 동시 발송 (재로그인 문제 해결)

즉시(instant) 방식으로 로그인한 사용자가 이후 재로그인 수단이 없는 문제 해결.  
관리자 승인 시 `delivery:'instant'`이더라도 동시에 Gmail SMTP로 이메일 발송하여 코드 영구 보존.

---

#### 7. 이메일 발송 진단 수정 — emailSent 오진 수정

**증상:** `emailSent: true` 응답이 오지만 실제 이메일이 도착하지 않음

**원인:** `emailSent: Boolean(mailer)` — 발송 성공 여부가 아닌 mailer 객체 존재 여부를 반환; `.catch()`가 오류를 삼키고 `emailSent = true` 설정

**수정 내용:**
```js
// Before
emailSent: Boolean(mailer)
mailer.sendMail({...}).catch(e => console.error(e));

// After
let emailSent = false;
let emailError = null;
try {
  await mailer.sendMail({...});
  emailSent = true;
} catch (e) {
  emailError = e.message;
}
res.json({ ok: true, ..., emailSent, emailError });
```

이제 응답에 `emailError` 필드가 포함되어 실제 SMTP 오류 메시지 확인 가능.

---

---

#### 8. AI 종목 브리핑 MVP (A-0 ~ A-7)

**목표:** 모달 상단에 규칙 기반 종목 브리핑 표시 (LLM 없음, AdSense 콘텐츠 강화)

**슬롯 규칙 (ET 기준, A-0):**

| 슬롯 | 시간대 (ET) | 요약 내용 |
|------|------------|---------|
| `pre_open` | 자정~09:29 | 전일 종가·등락 + 뉴스 헤드라인 |
| `null` | 09:30~11:59 | 해당 없음 → "오전 브리핑은 12시 이후" 안내 |
| `midday` | 12:00~15:59 | 오전 흐름 + 뉴스 |
| `post_close` | 16:00~ (주말 포함) | 당일 종합 |

**구현 범위:**

| 항목 | 내용 |
|------|------|
| DB 마이그레이션 | `backend/migrations/004_briefings.sql` — `briefings` 테이블 + UNIQUE(symbol, slot, trading_date) |
| 새 엔드포인트 | `GET /api/briefing?symbol=&slot=auto` |
| 규칙 기반 요약 | `buildBriefingSummary()` — Finnhub 시세·뉴스·프로필 조합 → 텍스트 생성 |
| DB 캐시 | 슬롯·거래일 단위로 `briefings` 테이블 캐시 (`cached: true` 반환) |
| 프론트 UI (A-4) | 모달 상단 `.modal-briefing` 섹션 — 로딩 → 요약 표시 → 캐시 시각 |
| 한국 종목 숨김 | `market === 'KR'` 시 섹션 hidden (K-3 이후 보강 예정) |
| 안내 문구 (A-6) | `slot === null` 시 "오전 브리핑은 12시 이후…" notice 반환 |
| 면책 문구 (A-7) | 브리핑 본문 하단 면책 고지 자동 포함 |

**API 응답 예시:**
```json
{
  "ok": true,
  "slot": "post_close",
  "tradingDate": "2026-05-22",
  "summary": "AAPL (Apple Inc.) — 2026-05-22 장 마감 요약...",
  "cached": false
}
```

---

#### 9. ERD 문서 자동 생성 (docs/ERD.md)

**목표:** `backend/migrations/*.sql` 변경 시 ERD 문서를 자동 갱신

**구현:**

| 항목 | 내용 |
|------|------|
| `scripts/update-erd.mjs` | SQL 파싱(CREATE TABLE/INDEX regex) → Mermaid ER 다이어그램 + 테이블 상세 + 인덱스 목록 생성 |
| `docs/ERD.md` | 6개 테이블, 9개 인덱스, 마이그레이션 이력 포함 자동 생성 문서 |
| `.claude/settings.json` | PostToolUse 훅 — `Write\|Edit` 후 `backend/migrations/*.sql` 감지 시 `node scripts/update-erd.mjs` 자동 실행 |

---

### 커밋 이력 (오늘)

| 해시 | 메시지 |
|------|--------|
| `fd13a40` | fix: 토스트 알림 z-index 상향 (300 → 1100) — 모달 위에 표시 |
| `91e147b` | feat(M-3b): GA4 측정 ID 교체 — G-KMCM3VCKN6 적용 |
| `d80a7bc` | docs(TASKS): M-3b 완료 반영 및 우선순위 재정렬 |
| `f5ed10c` | feat: 로그인 코드 요청 시스템 (Slack + 이메일/즉시 수신) |
| `19d2def` | fix: migrate.js — SQL 파일 하드코딩 제거, migrations/ 디렉터리 자동 스캔 |
| `ad76823` | feat: Slack 즉시 받기 → 코드 수신 시 자동 로그인 |
| `1afcccf` | feat: Slack 즉시 수신 시 로그인 코드 이메일 동시 발송 |
| `22e6d1a` | fix: 이메일 발송 결과 await + 실제 오류 메시지 응답에 포함 |

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
| M-5a | Google AdSense 계정 신청 + 사이트 등록 | 높음 |
| M-5b | AdSense 자동 광고 스크립트 삽입 | 높음 |
| A-3 | Claude / GPT 연동 브리핑 고도화 (AdSense 수익 확보 후) | 낮음 |

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
