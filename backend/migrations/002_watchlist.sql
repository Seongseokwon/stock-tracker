-- ============================================================
-- StockPulse — 관심종목 서버 저장 (Migration 002)
-- ============================================================

CREATE TABLE IF NOT EXISTS watchlist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol      TEXT NOT NULL,
  market      TEXT CHECK(market IN ('US', 'KR')),
  sort_order  INT  NOT NULL DEFAULT 0,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id);
