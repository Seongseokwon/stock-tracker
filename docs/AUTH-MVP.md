# MVP 로그인·DB (일회용 코드)

**최종 갱신:** 2026-05-21  
**작업 ID:** L-0 ~ L-9 ([TASKS.md](./TASKS.md))

---

## 1. 목표

- **간단한 DB** + **일회용 로그인 코드**만으로 접근 제한 (초대형 MVP)
- 로그인한 사용자의 **관심종목**을 서버에 저장·복원
- 기존 `localStorage`(`sp_watchlist`)와 **병행 후 점진 이전**

**비목표 (MVP 제외):** 이메일/비밀번호, OAuth, 소셜 로그인, 회원가입 폼

---

## 2. 인증 흐름

```
[운영자] 코드 생성 (CLI 또는 관리 API)
    → DB login_codes 에 저장 (해시)

[사용자] 앱 → 「로그인」→ 코드 입력
    → POST /api/auth/login { code }
    → 검증 (미사용·미만료)
    → user 생성 또는 기존 user 연결
    → 세션 쿠키 발급
    → GET /api/watchlist 로 목록 로드
```

| 규칙 | 내용 |
|------|------|
| 코드 형식 | 예: `SP-XXXX-XXXX` (8~12자, 대문자+숫자) |
| 저장 | DB에는 **해시만** (평문 코드는 생성 시 1회만 표시) |
| 사용 횟수 | 기본 **1회** (`max_uses = 1`) — 사용 후 무효 |
| 만료 | 기본 7일 (설정 가능) |
| 세션 | HttpOnly 쿠키 + 서버 `sessions` (또는 signed JWT) |

---

## 3. DB 스키마 (최소)

### 3.1 후보 (L-0)

| 옵션 | 장점 | Vercel | Railway |
|------|------|--------|---------|
| **Turso** (libSQL) | 서버리스·무료 tier | ✅ | ✅ |
| **Neon** (Postgres) | 연동 문서 많음 | ✅ | ✅ |
| **Railway Postgres** | API와 동일 프로젝트 | — | ✅ **RW-9** |
| **Supabase** | 대시보드·RLS | ✅ | ✅ |
| **SQLite 파일** | 로컬 MVP 최단 | ❌ | ❌ |

**권장:** Railway 배포(RW-*) 시 **Railway Postgres** 또는 Neon — `DATABASE_URL`

### 3.2 테이블

```sql
-- 사용자 (코드 로그인마다 1 user — 코드 1회 = 1 계정)
users (
  id            TEXT PRIMARY KEY,  -- uuid
  created_at    TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
)

-- 일회용 로그인 코드
login_codes (
  id            TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  max_uses      INT DEFAULT 1,
  use_count     INT DEFAULT 0,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ,
  note          TEXT          -- 운영 메모 (선택)
)

-- 세션
sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ
)

-- 관심종목 (사용자별)
watchlist_items (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  symbol        TEXT NOT NULL,     -- e.g. AAPL, 005930.KS
  market        TEXT,              -- US | KR
  display_name  TEXT,              -- 검색 시 종목명 (선택)
  sort_order    INT DEFAULT 0,
  added_at      TIMESTAMPTZ,
  UNIQUE(user_id, symbol)
)
```

**포트폴리오·알림**은 MVP 이후 (`portfolio_items`, `alerts` 테이블 확장).

---

## 4. API 설계

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/login` | — | `{ "code": "SP-..." }` → Set-Cookie |
| POST | `/api/auth/logout` | 세션 | 세션 삭제 |
| GET | `/api/auth/me` | 세션 | `{ userId, loggedIn: true }` |
| GET | `/api/watchlist` | 세션 | 관심종목 배열 |
| PUT | `/api/watchlist` | 세션 | 전체 교체 `{ symbols: [...] }` |
| POST | `/api/watchlist` | 세션 | 1종목 추가 `{ symbol, displayName? }` |
| DELETE | `/api/watchlist/:symbol` | 세션 | 1종목 삭제 |

### 관리 (운영자만)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/admin/codes` | 코드 생성 (헤더 `ADMIN_SECRET`) |
| GET | `/api/admin/codes` | 미사용 코드 목록 (선택) |

**환경 변수:** `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRET`

---

## 5. 프론트 연동 (L-6, L-7)

| 시점 | 동작 |
|------|------|
| 앱 로드 | `GET /api/auth/me` → 로그인 여부 |
| 미로그인 | 기존처럼 `localStorage` only (또는 로그인 유도 배너) |
| 로그인 성공 | 서버 watchlist → `state.watchlist` 반영, UI 갱신 |
| 종목 추가/삭제 | API 호출 + `localStorage` 동기 (또는 서버만) |
| 로그아웃 | localStorage 유지 여부 선택 (문서화: 서버만 초기화 권장) |

**UI:** 헤더 「로그인」모달 — 코드 입력 1필드, 제출, 오류(만료·이미 사용)

**파일:** `frontend/index.html`, `frontend/app.js`, `frontend/style.css`

---

## 6. 보안·개인정보

- 코드·세션 **평문 DB 저장 금지** (bcrypt/SHA-256 해시)
- `ADMIN_SECRET`으로 코드 생성 API 보호
- HTTPS (Vercel 기본)
- [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md) 개인정보: user_id·관심종목·접속 로그
- Rate limit: 로그인 시도 IP당 분당 N회

---

## 7. 구현 작업 (L-*)

> **Phase 1 (완료 2026-05-21): DB 없는 경량 인증** — 환경변수 코드 + HMAC 쿠키  
> **Phase 2 (예정): DB 연동** — 다중 코드 관리 + 관심종목 서버 저장

| ID | 작업 | 상태 |
|----|------|------|
| L-0 | DB 선택·`DATABASE_URL`·마이그레이션 스크립트 | ⬜ |
| L-1 | 테이블 생성 (`users`, `login_codes`, `sessions`, `watchlist_items`) | ⬜ |
| L-2 | `POST /api/auth/login` · 코드 검증·세션 발급 | ✅ 2026-05-21 (환경변수 `AUTH_CODE` 방식) |
| L-3 | `GET /api/auth/me` · `POST /api/auth/logout` | ✅ 2026-05-21 (HMAC 서명 쿠키) |
| L-4 | `GET/PUT/POST/DELETE /api/watchlist` | ⬜ (DB 필요) |
| L-5 | `POST /api/admin/codes` + CLI `npm run auth:code` | ⬜ (DB 필요) |
| L-6 | 프론트 SPA 인증 가드·로그아웃 버튼 (`app.js`, `index.html`) | ✅ 2026-05-21 |
| L-7 | 관심종목 추가/삭제 시 서버 저장 (`app.js`) | ⬜ (L-4 완료 후) |
| L-8 | 로그인 시 서버 → localStorage 병합 정책 문서화 | ⬜ |
| L-9 | QA·`.env.example` 갱신 | ✅ 2026-05-21 |
| L-10 | (선택) 포트폴리오·알림 테이블 확장 | ⬜ |

### Phase 1 구현 상세 (DB 없는 경량 버전)

```
환경변수: AUTH_CODE, SESSION_SECRET

POST /api/auth/login
  { code } → AUTH_CODE 환경변수와 대소문자 무시 비교
  일치 → HMAC-SHA256 서명 토큰 생성 (uid, exp: 7일)
       → Set-Cookie: sp_sess=<token>; HttpOnly; SameSite=Strict

GET /api/auth/me
  Cookie 헤더의 sp_sess 토큰 검증
  유효 → { loggedIn: true, uid }
  만료/없음 → 401 { loggedIn: false }

POST /api/auth/logout
  Set-Cookie: sp_sess=; Max-Age=0  (쿠키 만료)
```

**특성:**
- 서버 재시작해도 세션 유지 (stateless JWT-like, SESSION_SECRET 동일 유지 시)
- Vercel serverless 환경에서도 동작 (in-memory 상태 없음)
- 코드 1개만 지원 (다중 코드는 L-0~L-1 DB 구현 후)

---

## 8. localStorage와의 관계

| 키 | MVP |
|----|-----|
| `sp_watchlist` | 로그인 시 **서버가 source of truth** 권장 |
| `sp_portfolio` | MVP는 localStorage 유지 |
| `sp_alerts` | MVP는 localStorage 유지 |

충돌 시: 로그인 직후 서버 목록 우선, 로컬만 있으면 **1회 업로드** (`PUT /api/watchlist`) 옵션.

---

## 9. 완료 기준

**Phase 1 (완료):**
- [x] `AUTH_CODE` 설정 → 사용자 코드 입력 → 로그인 성공
- [x] 잘못된 코드 → 401 거부
- [x] 로그인 후 대시보드 진입, 새로고침 시 세션 유지 (7일 쿠키)
- [x] 로그아웃 버튼 → 쿠키 만료 → 로그인 페이지 리다이렉트
- [x] 미로그인 시 `/login.html` 자동 리다이렉트

**Phase 2 (예정, DB 필요):**
- [ ] 운영자가 코드 생성 → DB 저장 (해시)
- [ ] 동일 코드 재사용 시 거부
- [ ] 만료 코드 거부
- [ ] 로그인 후 종목 추가 → 재로그인 시 목록 유지 (서버 저장)

---

## 10. 연관 작업

| ID | 관계 |
|----|------|
| M-8 | 장기 유료·결제 (L-* 이후) |
| A-* | AI 브리핑 — user_id별 캐시 가능 |
| O-5 | Git 시 `.env`·마이그레이션 제외 규칙 |

---

*구현 후 HANDOFF §저장·§API·TASKS L-* 상태를 갱신할 것.*
