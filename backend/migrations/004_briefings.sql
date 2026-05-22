-- ============================================================
-- StockPulse — 브리핑 캐시 (Migration 004)
-- symbol + slot + trading_date 단위로 캐시 저장
-- ============================================================

CREATE TABLE IF NOT EXISTS briefings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       TEXT NOT NULL,
  slot         TEXT NOT NULL CHECK(slot IN ('pre_open', 'midday', 'post_close')),
  trading_date DATE NOT NULL,              -- ET 기준 거래일 (KR: KST)
  summary      TEXT NOT NULL,             -- 규칙 기반 요약 텍스트
  data_json    JSONB,                     -- 생성에 사용한 원본 데이터 스냅샷
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, slot, trading_date)
);

CREATE INDEX IF NOT EXISTS idx_briefings_lookup
  ON briefings(symbol, slot, trading_date);
