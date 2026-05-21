-- ============================================================
-- StockPulse — 인증 스키마 (Migration 001)
-- ============================================================

-- 사용자 (로그인 코드 1회 사용 시 자동 생성)
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 1회용 로그인 코드
-- code_hash: SHA-256(원본 코드) — 평문은 생성 시 1회만 노출
CREATE TABLE IF NOT EXISTS login_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   TEXT NOT NULL UNIQUE,
  user_id     UUID REFERENCES users(id),   -- 사용 후 연결된 user
  note        TEXT,                        -- 운영 메모 (예: "친구A용")
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ                  -- NULL = 미사용
);

-- 세션
-- token_hash: HMAC 토큰의 해시 — 쿠키 탈취 시 재사용 방지
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_login_codes_hash     ON login_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_login_codes_unused   ON login_codes(used_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_token       ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);

-- ============================================================
-- Phase 2 확장 예정 (주석 해제로 추가)
-- ============================================================
-- CREATE TABLE IF NOT EXISTS watchlist_items (
--   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   symbol      TEXT NOT NULL,
--   market      TEXT CHECK(market IN ('US', 'KR')),
--   sort_order  INT  NOT NULL DEFAULT 0,
--   added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE(user_id, symbol)
-- );
-- CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id);
