# StockPulse — 데이터베이스 ERD

> **자동 갱신 규칙:** `backend/migrations/*.sql` 파일이 수정·추가될 때마다
> Claude Code 훅이 `node scripts/update-erd.mjs`를 실행하여 이 문서를 재생성합니다.

**최종 갱신:** 2026-05-22
**DB:** PostgreSQL 16 (로컬 Docker 5433 / Railway Postgres)
**마이그레이션 수:** 4개 (`001` ~ `004`)

---

## ER 다이어그램

```mermaid
erDiagram
    users {
        UUID id PK
        TIMESTAMPTZ created_at
        TIMESTAMPTZ last_login_at
    }

    login_codes {
        UUID id PK
        TEXT code_hash UK
        UUID user_id FK → users.id
        TEXT note
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ used_at
    }

    sessions {
        UUID id PK
        UUID user_id FK → users.id
        TEXT token_hash UK
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
    }

    watchlist_items {
        UUID id PK
        UUID user_id FK → users.id
        TEXT symbol
        TEXT market
        INT sort_order
        TIMESTAMPTZ added_at
    }

    access_requests {
        UUID id PK
        TEXT email
        TEXT delivery
        TEXT status
        TEXT request_token UK
        UUID code_id FK → login_codes.id
        TEXT plain_code
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
    }

    briefings {
        UUID id PK
        TEXT symbol
        TEXT slot
        DATE trading_date
        TEXT summary
        JSONB data_json
        TIMESTAMPTZ created_at
    }

    users ||--o{ login_codes : "1회용 코드 (재사용 가능)"
    users ||--o{ sessions : "로그인 세션"
    users ||--o{ watchlist_items : "관심종목"
    login_codes ||--o{ access_requests : "승인된 코드"
```

---

## 테이블 상세

### `users`
> Migration: `001_auth.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `last_login_at` | TIMESTAMPTZ |  | |

---

### `login_codes`
> Migration: `001_auth.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `code_hash` | TEXT | UK, NOT NULL | |
| `user_id` | UUID | FK → users.id | |
| `note` | TEXT |  | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `used_at` | TIMESTAMPTZ |  | |

---

### `sessions`
> Migration: `001_auth.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users.id, NOT NULL | |
| `token_hash` | TEXT | UK, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |

---

### `watchlist_items`
> Migration: `002_watchlist.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | FK → users.id, NOT NULL | |
| `symbol` | TEXT | NOT NULL | |
| `market` | TEXT |  | |
| `sort_order` | INT | NOT NULL, DEFAULT 0 | |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

---

### `access_requests`
> Migration: `003_access_requests.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `email` | TEXT | NOT NULL | |
| `delivery` | TEXT | NOT NULL | |
| `status` | TEXT | NOT NULL, DEFAULT 'pending' | |
| `request_token` | TEXT | UK, NOT NULL | |
| `code_id` | UUID | FK → login_codes.id | |
| `plain_code` | TEXT |  | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `expires_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() + INTERVAL '30 minutes' | |

---

### `briefings`
> Migration: `004_briefings.sql`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `symbol` | TEXT | NOT NULL | |
| `slot` | TEXT | NOT NULL | |
| `trading_date` | DATE | NOT NULL | |
| `summary` | TEXT | NOT NULL | |
| `data_json` | JSONB |  | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |


---

## 마이그레이션 이력

| 파일 | 날짜 | 내용 |
|------|------|------|
| `001_auth.sql` | 2026-05-21 | `users`, `login_codes`, `sessions` — 인증 스키마 |
| `002_watchlist.sql` | 2026-05-21 | `watchlist_items` — 관심종목 서버 저장 |
| `003_access_requests.sql` | 2026-05-22 | `access_requests` — 로그인 코드 요청 시스템 |
| `004_briefings.sql` | 2026-05-22 | `briefings` — AI 브리핑 캐시 |

---

## 인덱스 전체 목록

| 인덱스 | 테이블 | 컬럼 | 조건 |
|--------|--------|------|------|
| `idx_login_codes_hash` | `login_codes` | `code_hash` |  |
| `idx_login_codes_unused` | `login_codes` | `used_at` | WHERE used_at IS NULL |
| `idx_sessions_token` | `sessions` | `token_hash` |  |
| `idx_sessions_user` | `sessions` | `user_id` |  |
| `idx_watchlist_user` | `watchlist_items` | `user_id` |  |
| `idx_watchlist_user` | `watchlist_items` | `user_id` |  |
| `idx_access_requests_token` | `access_requests` | `request_token` |  |
| `idx_access_requests_pending` | `access_requests` | `status` | WHERE status = 'pending' |
| `idx_briefings_lookup` | `briefings` | `symbol, slot, trading_date` |  |

---

## 실행 명령

```bash
# 로컬 Docker PostgreSQL 시작
npm run db:up

# 전체 마이그레이션 실행 (migrations/ 자동 스캔)
npm run db:migrate

# ERD 문서 재생성 (이 파일 갱신)
node scripts/update-erd.mjs

# 현재 테이블 확인
docker exec stockpulse-db psql -U stockpulse -d stockpulse -c "\dt"
```
