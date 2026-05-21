# 인증 시스템

**최종 갱신:** 2026-05-21 (관리자 API · 커스텀 코드 CLI · 통합 테스트)  
**작업 ID:** L-0 ~ L-10 ([TASKS.md](./TASKS.md))

---

## 현재 구현 (Phase 2 — Docker PostgreSQL + 1회용 코드)

로컬 Docker PostgreSQL(5433) + HMAC-SHA256 서명 HttpOnly 쿠키.  
DB 1회용 코드가 우선, 없으면 `AUTH_CODE` 환경변수로 fallback.

### 로그인 흐름

```
방문자 → / (index.html)
  ↓ app.js init() → GET /api/auth/me
  ↓ 401 → /login.html 리다이렉트
  ↓ 코드 입력 → POST /api/auth/login
        ├─ DB login_codes WHERE code_hash = $1
        │   ├─ 존재 + used_at IS NULL + expires_at 유효
        │   │   → user 생성/갱신, used_at 기록, sessions INSERT (src='db')
        │   ├─ 존재 + used_at 있거나 만료
        │   │   → 401 (env fallback 없음 — 재사용·만료 차단)
        │   └─ 미존재 → AUTH_CODE 환경변수 fallback (src='env')
        └─ Set-Cookie: sp_sess (7일) → / (대시보드)

관리자 → POST /api/admin/codes { code, days, note }
  ← { ok, code, expiresAt }   # 코드를 사용자에게 전달
```

### 세션 토큰 구조

`base64url(JSON).HMAC_sig` — HMAC-SHA256, `SESSION_SECRET` 서명

```json
{ "uid": "<uuid>", "src": "db|env", "exp": <epoch_ms> }
```

- `src: "db"` — DB 코드로 로그인, DB sessions 테이블에 token_hash 저장됨
- `src: "env"` — 환경변수 코드로 로그인, HMAC 검증만 (하위호환)

**특성:** 서버 재시작 시 `env` 세션 유지 (`SESSION_SECRET` 동일 시). `db` 세션은 DB sessions 레코드로 추적.

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `docker-compose.yml` | PostgreSQL 16-alpine 컨테이너 (포트 5433) |
| `backend/db.js` | pg Pool 초기화 (DATABASE_URL 없으면 null — env 모드 유지) |
| `backend/migrate.js` | 마이그레이션 실행 (`npm run db:migrate`) |
| `backend/migrations/001_auth.sql` | users · login_codes · sessions 테이블 + 인덱스 |
| `backend/gen-code.js` | 1회용 코드 생성 CLI — 랜덤 또는 `--code` 직접 지정 |
| `backend/server.js` | auth 라우트 3개 + `POST /api/admin/codes` (관리자 코드 생성 API) |
| `scripts/test-auth.mjs` | 인증 통합 테스트 (`npm run test:auth`) |
| `frontend/login.html` | 코드 입력 폼 |
| `frontend/app.js` | `checkSession()`, `logout()`, `init()` 인증 가드, bfcache 핸들러 |
| `frontend/index.html` | `<body style="visibility:hidden">` (FOUC 방지), 로그아웃 버튼 |

---

## DB 스키마 (001_auth.sql)

```sql
users (id UUID PK, created_at, last_login_at)

login_codes (
  id UUID PK, code_hash TEXT UNIQUE,   -- SHA-256(원본코드)
  user_id UUID → users,                -- 사용 후 연결
  note TEXT, created_at, expires_at,
  used_at TIMESTAMPTZ                  -- NULL = 미사용 (1회용)
)

sessions (
  id UUID PK, user_id UUID → users ON DELETE CASCADE,
  token_hash TEXT UNIQUE,              -- SHA-256(쿠키 raw token)
  created_at, expires_at
)

-- Phase 2 확장 예정 (001_auth.sql 주석 해제):
-- watchlist_items (id, user_id, symbol, market, sort_order, added_at)
```

---

## 환경 변수

| 변수 | 설명 |
|------|------|
| `AUTH_CODE` | fallback 코드 (대소문자 무시, 쉼표 구분 다중 지원). DB 코드 없을 때만 사용 |
| `SESSION_SECRET` | 쿠키 HMAC 서명 비밀키 (프로덕션에서 반드시 변경) |
| `DATABASE_URL` | PostgreSQL 연결 URL (없으면 env 모드로 동작) |
| `ADMIN_SECRET` | 관리자 API 인증 키 — `POST /api/admin/codes` 헤더 `x-admin-secret` 값 |

---

## API

### 사용자 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | `{ code }` → DB 조회 → 쿠키 발급 |
| GET | `/api/auth/me` | 쿠키 검증 + DB 세션 확인(src=db) → `{ loggedIn, uid }` |
| POST | `/api/auth/logout` | DB 세션 삭제 + 쿠키 만료 |

### 관리자 — 코드 생성

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/admin/codes` | `x-admin-secret` 헤더 | 코드 생성 → `{ ok, code, expiresAt }` 반환 |

**요청 바디:**
```json
{
  "code":  "SP-USER-0001",   // 생략 시 SP-XXXX-XXXX 랜덤 생성
  "days":  30,               // 유효기간(일), 기본 30
  "note":  "VIP용"           // 운영 메모 (선택)
}
```

**응답 예:**
```json
{ "ok": true, "code": "SP-USER-0001", "expiresAt": "2026-06-20T00:00:00.000Z" }
```

**에러 코드:**
- `401 unauthorized` — ADMIN_SECRET 불일치
- `409 code_already_exists` — 동일 코드 중복 등록
- `503 database_not_available` — DB 미연결 상태

---

## npm 스크립트 (로컬 DB)

```bash
npm run db:up        # Docker PostgreSQL 컨테이너 시작 (5433)
npm run db:down      # 컨테이너 중지
npm run db:migrate   # 마이그레이션 실행 (001_auth.sql)
npm run db:logs      # DB 로그 스트리밍
npm run db:gen-code  # 1회용 코드 생성 (랜덤)
npm run test:auth    # 인증 통합 테스트 (10개 시나리오)
```

### gen-code 옵션

```bash
# 랜덤 코드 (SP-XXXX-XXXX), 30일 유효
npm run db:gen-code

# 커스텀 코드 직접 지정
npm run db:gen-code -- --code SP-USER-0001

# 유효기간 + 메모 지정
npm run db:gen-code -- --code SP-USER-0002 --days 7 --note "VIP 초대"

# node 직접 실행
node backend/gen-code.js --code SP-USER-0001 --days 90 --note "장기 사용자"
```

### 관리자 API 호출 예 (curl)

```bash
# SP-USER-0001 등록 (커스텀 코드)
curl -X POST http://localhost:3000/api/admin/codes \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: local-admin-secret" \
  -d '{"code":"SP-USER-0001","days":30,"note":"VIP용"}'

# 랜덤 코드 생성
curl -X POST http://localhost:3000/api/admin/codes \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: local-admin-secret" \
  -d '{"days":7}'
```

---

## 작업 현황

| ID | 작업 | 상태 |
|----|------|------|
| L-0 | DB 선택·`DATABASE_URL` (Docker PostgreSQL 5433) | ✅ 2026-05-21 |
| L-1 | 테이블 생성 (`users`, `login_codes`, `sessions`) | ✅ 2026-05-21 |
| L-2 | `POST /api/auth/login` (DB 코드 조회 + env fallback) | ✅ 2026-05-21 |
| L-3 | `GET /api/auth/me` + `POST /api/auth/logout` (DB 세션 검증/삭제) | ✅ 2026-05-21 |
| L-5 | 1회용 코드 생성 CLI (`gen-code.js`) | ✅ 2026-05-21 |
| L-6 | SPA 인증 가드 + 로그아웃 버튼 | ✅ 2026-05-21 |
| L-9 | `.env.example` 갱신 | ✅ 2026-05-21 |
| L-4 | `/api/watchlist` CRUD | ⬜ DB 연결 완료, 구현 대기 |
| L-7 | 관심종목 추가/삭제 서버 동기화 | ⬜ L-4 완료 후 |
| L-8 | 서버↔localStorage 병합 정책 | ⬜ |
| L-10 | 포트폴리오·알림 DB 확장 (선택) | ⬜ |

---

## localStorage 관계

| 키 | 현재 | Phase 3 (예정) |
|----|------|----------------|
| `sp_watchlist` | localStorage | 서버 source of truth (L-4/L-7) |
| `sp_portfolio` | localStorage | localStorage 유지 |
| `sp_alerts` | localStorage | localStorage 유지 |

충돌 시: 로그인 직후 서버 목록 우선, 로컬만 있으면 1회 업로드 옵션.

---

## 보안

- 코드·세션 **평문 DB 저장 금지** (SHA-256 해시)
- `SESSION_SECRET` 프로덕션용으로 교체 필수
- HTTPS (Vercel 기본) — Vercel 배포 시 `Secure` 쿠키 플래그 자동 적용
- bfcache 재검증: `pageshow` 이벤트에서 `/api/auth/me` 재확인
- Rate limit: 로그인 시도 IP당 분당 N회 (Phase 3 예정)

---

## 프로덕션 (Vercel) 대응

Vercel에는 DATABASE_URL이 없으므로 **env 모드**(환경변수 코드만)로 동작.  
DB 기반 인증은 로컬·Railway 배포 환경에서 활성화됨.

Railway 배포 시: `DATABASE_URL` 환경변수를 Railway Postgres URL로 설정하면 자동 전환.
