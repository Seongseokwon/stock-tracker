# AI 종목 브리핑 (시간대별 요약)

**최종 갱신:** 2026-05-19  
**작업 ID:** A-0 ~ A-8 ([TASKS.md](./TASKS.md))  
**연관:** 종목 모달(`openModal`), `/api/market-status`, `/api/news`, `/api/chart`, `/api/quote`

---

## 1. 사용자 경험 (목표)

관심종목 카드를 **클릭(모달 열기)** 하면, **해당 종목 시장의 현재 시각**에 맞는 **AI 요약 브리핑**을 상단에 표시한다.

| 구간 | 조건 (한국 종목 · KST) | 조건 (미국 종목 · ET) | 요약 내용 |
|------|------------------------|------------------------|-----------|
| **장전** `pre_open` | `session: pre` 또는 정규장 전 (09:00 미만) | `pre` 또는 정규장 전 | **전일(어제)** 뉴스 + 주가·등락 요약 |
| **오전 마감** `midday` | 정규장 중 **12:00 이후** (09:00~12:00은 「오전 진행 중」) | 정규장 중 **12:00 ET 이후** | **당일 오전장** 시가·고저·거래량·뉴스 흐름 요약 |
| **장마감 후** `post_close` | `closed` / 장후 (15:30 이후) | `after` / `closed` (16:00 ET 이후) | **당일 종일** 뉴스 + 주가·종가 기준 요약 |

> 사용자 표현 「12시 기준 오전 장」→ 구현은 **12:00 이후**에 `midday` 브리핑 노출. 09:00~11:59에는 「장 중 · 오전 브리핑은 12시 이후 제공」 안내.

**휴장일(주말·공휴일):** 직전 **거래일** 기준 `post_close` 또는 「최근 거래일 요약」으로 폴백.

---

## 2. 화면 위치 (UI)

```
[모달 상단]
┌─────────────────────────────────────┐
│ 🤖 AI 브리핑 · 장전 / 오전장 / 장마감  │  ← 슬롯 뱃지
│ (요약 본문 3~8문장, 불릿 가능)        │
│ 생성 시각 · 데이터 출처 · 면책 링크    │
└─────────────────────────────────────┘
[기존: 가격 · 차트 · 통계 · 뉴스 목록 …]
```

- `openModal(symbol)` 시 `loadModalBriefing(symbol)` 호출  
- 기존 뉴스 리스트는 **원문 링크** 유지, AI 블록은 **요약만** (저작권)  
- KR 종목: 뉴스 API 없을 때 「뉴스 데이터 제한 · 주가 위주 요약」(K-3 전)

---

## 3. 슬롯 자동 판별 (`auto`)

백엔드 `resolveBriefingSlot(symbol, now)`:

```text
symbol → market = KR | US  (isKoreanSymbol)
market + clock + market-status.session → pre_open | midday | post_close
```

### 한국 (KST)

| session (기존 API) | 시각 추가 조건 | slot |
|--------------------|----------------|------|
| `pre` | — | `pre_open` |
| `closed` | 09:00 전 | `pre_open` |
| `regular` | &lt; 12:00 | `intraday_early` *(UI: 오전 브리핑 12시 이후)* |
| `regular` | ≥ 12:00 | `midday` |
| `closed` | 15:30 이후 등 | `post_close` |

### 미국 (ET)

| session | 시각 | slot |
|---------|------|------|
| `pre` | — | `pre_open` |
| `regular` | &lt; 12:00 | `intraday_early` |
| `regular` | ≥ 12:00 | `midday` |
| `after` / `closed` | — | `post_close` |

`intraday_early`: AI 호출 생략 또는 짧은 「현재가·등락률만」 규칙 요약.

---

## 4. API 설계

### 4.1 브리핑 조회

```
GET /api/briefing?symbol=AAPL&slot=auto
```

**응답 예:**

```json
{
  "symbol": "AAPL",
  "market": "US",
  "slot": "midday",
  "slotLabel": "오전장 요약 (12:00 기준)",
  "tradingDate": "2026-05-19",
  "summary": "… AI 또는 규칙 기반 텍스트 …",
  "bullets": ["시가 …", "오전 고가 …", "관련 뉴스: …"],
  "sources": {
    "newsCount": 5,
    "newsUrls": ["https://…"],
    "priceAsOf": "2026-05-19T17:00:00Z"
  },
  "generatedAt": "2026-05-19T17:05:00Z",
  "cached": true,
  "disclaimer": "투자 자문이 아닙니다."
}
```

### 4.2 수집 파이프라인 (서버 내부)

1. `quote` + `chart` (당일/전일 range)  
2. `news` (US: Finnhub 7일 → 슬롯별 필터)  
3. (선택) `profile` / `metrics`  
4. **프롬프트 입력 JSON** → LLM 또는 규칙 엔진  
5. **캐시** 키: `{symbol}:{tradingDate}:{slot}` (Vercel KV / 메모리 / JSON 파일)

---

## 5. AI vs 규칙 기반 (단계)

| 단계 | ID | 방식 | 비용 |
|------|-----|------|------|
| **MVP** | A-2 | 규칙 템플릿 (가격·%·뉴스 제목 나열) | $0 |
| **v1** | A-3 | OpenAI / Claude 등 **서버 프록시** | API 사용량 |
| **v2** | A-5 | 슬롯별 Cron 선생성 + 캐시 | 트래픽↓ |

**환경 변수 (v1):** `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` — `backend/.env`, Vercel Env (프론트 노출 금지)

**프롬프트 원칙:**

- 투자 **권유·매수·매도 지시 금지**  
- 수치는 **제공된 JSON만** 인용 (환각 방지)  
- 뉴스는 **제목·출처 요약**, 본문 장문 복제 금지  
- 한국어 출력 (기본)

---

## 6. 슬롯별 입력 데이터

| slot | chart | news 필터 | 요약 초점 |
|------|-------|-----------|-----------|
| `pre_open` | **전일** 일봉 또는 전일 종가 | 전일~당일 새벽 | 전일 종가, 등락, 전일 뉴스 |
| `midday` | 당일 5m/15m, 09:00~12:00 구간 | 당일 00:00~12:00 | 시가, 오전 고저, 거래량, 오전 뉴스 |
| `post_close` | 당일 일봉 전체 | 당일 전체 | 종가, 일중 고저, 당일 뉴스 종합 |

---

## 7. 제약·리스크

| 항목 | 내용 |
|------|------|
| KR 뉴스 | 현재 `/api/news` → `[]` → **주가·차트 위주** 요약만 (K-3 후 보강) |
| Finnhub 429 | 브리핑 실패 시 캐시·규칙 폴백 |
| Vercel 30s | 종목당 LLM 1회, 토큰 제한·스트리밍 선택 |
| 법무 | [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md) — AI 요약·투자 자문 아님 |
| 비용 | 관심종목 20 × 3슬롯 × 일 1회 → **Cron 선캐시** 권장 |

---

## 8. 구현 작업 (A-*)

| ID | 작업 |
|----|------|
| A-0 | 슬롯 규칙 확정·`resolveBriefingSlot` 스펙 (KR/US, 12:00) |
| A-1 | `GET /api/briefing` + 입력 데이터 수집기 |
| A-2 | 규칙 기반 MVP 요약 (LLM 없이) |
| A-3 | LLM 연동 (서버 프록시, 프롬프트·토큰 제한) |
| A-4 | 모달 UI 「AI 브리핑」섹션 |
| A-5 | 일별·슬롯별 캐시 + (선택) Vercel Cron |
| A-6 | `intraday_early` UX (12시 전 안내) |
| A-7 | QA·면책 문구·`npm run qa` 확장 |
| A-8 | (선택) 프리미엄: 브리핑 무제한·푸시 (M-8 연계) |

---

## 9. 프론트 연동 포인트

| 파일 | 변경 |
|------|------|
| `frontend/index.html` | `#modalBriefing` 블록 |
| `frontend/app.js` | `loadModalBriefing`, `openModal` 내 await |
| `frontend/style.css` | `.modal-briefing` |
| `backend/server.js` | `/api/briefing` 라우트 |
| `backend/briefing.js` | (신규) 슬롯·수집·요약 |

---

## 10. 완료 기준 (QA)

- [ ] US 종목 · 장전 / 12시 이후 / 장마감 후 각각 slot 라벨 정확  
- [ ] KR 종목 · KST 기준 동일  
- [ ] 뉴스 없는 KR · 주가 요약만 표시, 오류 없음  
- [ ] API 키 없을 때 규칙 MVP 또는 안내 메시지  
- [ ] 면책 문구 표시  

---

## 11. 수익화 연계

- 무료: 슬롯당 1회/일 또는 종목 3개만 AI  
- 유료: 전 종목·장마감 후 자동 푸시 ([MONETIZATION.md](./MONETIZATION.md) M-8)

---

*구현 시 HANDOFF §11·TASKS A-* 상태를 함께 갱신할 것.*
