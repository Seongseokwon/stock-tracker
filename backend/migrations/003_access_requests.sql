-- 003_access_requests.sql
-- 로그인 코드 요청 테이블 (Slack 알림 + 이메일/즉시 수신)

CREATE TABLE IF NOT EXISTS access_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  delivery       TEXT NOT NULL CHECK(delivery IN ('email', 'instant')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending', 'approved', 'sent', 'expired')),
  request_token  TEXT NOT NULL UNIQUE,   -- 브라우저 폴링용 랜덤 토큰
  code_id        UUID REFERENCES login_codes(id),
  plain_code     TEXT,                   -- instant 전용: 1회 전달 후 NULL 처리
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE INDEX IF NOT EXISTS idx_access_requests_token
  ON access_requests(request_token);

CREATE INDEX IF NOT EXISTS idx_access_requests_pending
  ON access_requests(status) WHERE status = 'pending';
