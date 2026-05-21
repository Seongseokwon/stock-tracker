# 인증 시스템

**최종 갱신:** 2026-05-21  
**작업 ID:** L-0 ~ L-10 ([TASKS.md](./TASKS.md))

---

## 현재 구현 (Phase 1 — DB 없는 경량 버전)

환경변수 코드 1개 + HMAC-SHA256 서명 HttpOnly 쿠키. 새 npm 패키지 없음.

### 흐름

```
방문자 → / (index.html)
  ↓ app.js init() → GET /api/auth/me
  ↓ 401 → /login.html 리다이렉트
  ↓ 코드 입력 → POST /api/auth/login
  ↓ 성공 → Set-Cookie: sp_sess (7일) → / (대시보드)
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `frontend/login.html` | 코드 입력 폼, 이메일/Slack 코드 요청 FAB |
| `frontend/app.js` | `checkSession()`, `logout()`, `init()` 인증 가드 |
| `frontend/index.html` | `<body style="visibility:hidden">` (FOUC 방지), 로그아웃 버튼 |
| `backend/server.js` | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |

### 환경 변수

| 변수 | 설명 |
|------|------|
| `AUTH_CODE` | 로그인 허용 코드 (대소문자 무시, 예: `SP-DEMO-0000`) |
| `SESSION_SECRET` | 쿠키 HMAC 서명 비밀키 (프로덕션에서 반드시 변경) |

### API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | `{ code }` → 검증 → HttpOnly 쿠키 발급 |
| GET | `/api/auth/me` | 쿠키 검증 → `{ loggedIn, uid }` |
| POST | `/api/auth/logout` | 쿠키 만료 처리 |

**특성:** Stateless (서버 재시작 후에도 세션 유지), Vercel serverless 동작

---

## Phase 2 계획 — DB 연동 (L-0~L-5)

현재 코드 1개 방식 → 다중 코드 관리 + 관심종목 서버 저장

### DB 후보

| 옵션 | Vercel | Railway | 비고 |
|------|--------|---------|------|
| **Neon** (Postgres) | ✅ | ✅ | 연동 문서 많음 |
| **Railway Postgres** | — | ✅ | RW-9, API와 동일 프로젝트 |
| **Turso** (libSQL) | ✅ | ✅ | 서버리스 최적화 |
| **Supabase** | ✅ | ✅ | 대시보드 편리 |

### DB 스키마 (최소)

```sql
users (id TEXT, created_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ)

login_codes (
  id TEXT, code_hash TEXT UNIQUE, expires_at TIMESTAMPTZ,
  max_uses INT DEFAULT 1, use_count INT DEFAULT 0
)

sessions (id TEXT, user_id TEXT, token_hash TEXT, expires_at TIMESTAMPTZ)

watchlist_items (
  id TEXT, user_id TEXT, symbol TEXT, market TEXT,
  sort_order INT, added_at TIMESTAMPTZ,
  UNIQUE(user_id, symbol)
)
```

### 추가 API (Phase 2)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/PUT/POST | `/api/watchlist` | 관심종목 서버 저장 |
| DELETE | `/api/watchlist/:symbol` | 1종목 삭제 |
| POST | `/api/admin/codes` | 코드 생성 (`ADMIN_SECRET` 필요) |

---

## 작업 현황

| ID | 작업 | 상태 |
|----|------|------|
| L-0 | DB 선택·`DATABASE_URL` | ⬜ |
| L-1 | 테이블 생성 | ⬜ |
| L-2 | `POST /api/auth/login` | ✅ 2026-05-21 |
| L-3 | `GET /api/auth/me` + logout | ✅ 2026-05-21 |
| L-4 | `/api/watchlist` CRUD | ⬜ DB 필요 |
| L-5 | 운영자 코드 생성 CLI | ⬜ DB 필요 |
| L-6 | SPA 인증 가드 + 로그아웃 버튼 | ✅ 2026-05-21 |
| L-7 | 종목 추가/삭제 서버 동기화 | ⬜ L-4 완료 후 |
| L-8 | 서버↔localStorage 병합 정책 | ⬜ |
| L-9 | `.env.example` 갱신 | ✅ 2026-05-21 |
| L-10 | 포트폴리오·알림 DB 확장 (선택) | ⬜ |

---

## localStorage 관계

| 키 | Phase 1 | Phase 2 (예정) |
|----|---------|----------------|
| `sp_watchlist` | localStorage | 서버 source of truth |
| `sp_portfolio` | localStorage | localStorage 유지 |
| `sp_alerts` | localStorage | localStorage 유지 |

충돌 시: 로그인 직후 서버 목록 우선, 로컬만 있으면 1회 업로드 옵션.

---

## 보안

- 코드·세션 **평문 DB 저장 금지** (SHA-256 해시)
- `SESSION_SECRET` 프로덕션용으로 교체 필수
- HTTPS (Vercel 기본)
- Rate limit: 로그인 시도 IP당 분당 N회 (Phase 2)
