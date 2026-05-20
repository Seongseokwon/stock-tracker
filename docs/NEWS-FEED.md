# 미국 매크로·경제 뉴스 피드 (기획)

**최종 갱신:** 2026-05-19  
**작업 ID:** N-0 ~ N-6 ([TASKS.md](./TASKS.md))

---

## 1. 목표

블룸버그·미국 경제 매체 등에서 **거시·시장 뉴스**를 모아 사용자에게 **한곳에서 정리·제공**한다.

| 현재 | 목표 |
|------|------|
| 종목 모달에 **US 종목별** 뉴스만 (Finnhub `company-news`) | **매크로·경제** 뉴스 허브 (금리, CPI, 연준, 지수 등) |
| KR 뉴스 없음 | (별도 K-3) |

---

## 2. 블룸버그 「스크랩」에 대한 전제 (중요)

| 방식 | 권장 | 이유 |
|------|------|------|
| Bloomberg 웹 **HTML 스크랩** | ❌ **비권장** | 이용약관·저작권·페이월, IP 차단, 법적 리스크 |
| Bloomberg **공식 API/라이선스** | △ | 유료·B2B 계약 필요 시에만 |
| **RSS·공식 API·Finnhub** 등 합법 소스 | ✅ **1차 구현** | 유지보수·배포(Vercel)에 적합 |

**제품 방향:** 본문 전문 무단 복제 대신 **제목·요약·출처·원문 링크** + (선택) 짧은 **편집 요약**(자체 문장)으로 「정리」한다.

---

## 3. 데이터 소스 후보 (N-0 조사)

### 3.1 우선 검토 (합법·구현 용이)

| 소스 | 유형 | 내용 | 비고 |
|------|------|------|------|
| **Finnhub** `market-news` / `general-news` | REST (기존 키) | US 시장·경제 헤드라인 | 이미 `FINNHUB_API_KEY` 사용 중 |
| **Fed, BLS, SEC** RSS | RSS | FOMC, 고용·물가, 공시 | 무료·안정 |
| **Reuters / AP** (라이선스·RSS) | RSS/API | 거시 뉴스 | 약관 확인 필수 |
| **Yahoo Finance** RSS | RSS | 시장 헤드라인 | 비공식·변경 가능 (시세와 동일 리스크) |

### 3.2 보류·유료

| 소스 | 비고 |
|------|------|
| Bloomberg Terminal / B-PIPE | 기관용 |
| NewsAPI.org, Marketaux, Benzinga | 유료 tier·한도 |
| 웹 스크랩 (Bloomberg, WSJ 전문) | ToS 위반 가능성 |

---

## 4. 기능 범위 (단계)

### Phase 0 — N-0 소스·약관 조사

- [ ] 후보 소스별: 재배포 허용 여부, 상업 이용, attribution 요구  
- [ ] Bloomberg: **링크만** vs 라이선스 API 여부 결정  
- [ ] Finnhub general/market news 엔드포인트·한도 확인  

### Phase 1 — N-1 백엔드 API

```
GET /api/macro-news?category=market|economy|fed&limit=20
```

**응답 예:**

```json
[
  {
    "id": "hash-or-uuid",
    "title": "...",
    "summary": "...",
    "source": "Finnhub",
    "url": "https://...",
    "publishedAt": "2026-05-19T12:00:00Z",
    "tags": ["FOMC", "rates"]
  }
]
```

- US 종목 `/api/news` 와 **분리** (매크로 전용)  
- KR: 기존처럼 `[]` 또는 추후 K-3 연동  

**파일:** `backend/server.js`, (선택) `backend/macro-news.js`

### Phase 2 — N-2 수집·캐시

| 항목 | 내용 |
|------|------|
| Vercel Cron | 15~30분마다 소스 fetch → JSON/ KV 캐시 |
| 중복 제거 | URL·제목 해시 |
| Rate limit | Finnhub 429와 동일 큐·백오프 |

**파일:** `api/cron/macro-news.js` (Vercel Cron), `backend/data/macro-news-cache.json` (초기 MVP는 요청 시 fetch만도 가능)

### Phase 3 — N-3 프론트 UI

- 헤더 또는 툴바 **「미국 경제」** 탭 / 접이식 패널  
- 카드: 제목, 출처, 상대 시간, **원문 보기** (새 탭)  
- 다크/라이트 테마 유지  

**파일:** `frontend/index.html`, `frontend/app.js`, `frontend/style.css`

### Phase 4 — N-4 정리·필터

- 카테고리: 시장 / 거시 / 연준·금리 / 실적 시즌  
- 관심종목 심볼과 **연관 뉴스** 하이라이트 (제목·요약 키워드 매칭)  
- 「오늘」「이번 주」 필터  

### Phase 5 — N-5 (선택) 편집 요약

- LLM 또는 규칙 기반 **3줄 브리핑** (저작권: 원문 복제 금지, 요약만)  
- 비용·API 키 별도  

### Phase 6 — N-6 Bloomberg 브랜딩 UX

- 「Bloomberg 등 주요 매체」→ 실제로는 **허용된 소스 목록** 표시  
- Bloomberg 기사는 **원문 링크**만 (스크랩 본문 X)  

---

## 5. 아키텍처 (목표)

```
[Cron 또는 사용자 요청]
    → macro-news 수집기 (Finnhub + RSS 파서)
    → 정규화·중복 제거·태그
    → 캐시 (메모리 / Vercel KV / JSON)
    → GET /api/macro-news
    → 프론트 「미국 경제」 패널
```

**의존성 후보:** `rss-parser` (npm), 기존 Express 라우트

---

## 6. 법·UX 고지

- [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md)에 뉴스 지연·제3자 저작권·투자 자문 아님 명시  
- 각 카드에 **출처·원문 링크** 필수  
- 「Bloomberg에서 가져온다」가 아니라 **「다양한 공개 소스를 링크로 정리」** 표현 권장  

---

## 7. QA·완료 기준

| # | 기준 |
|---|------|
| 1 | `/api/macro-news` 200, 항목 ≥5 (장중 Finnhub 가용 시) |
| 2 | 프론트 패널에서 목록·원문 링크 동작 |
| 3 | Finnhub 429 시 캐시·빈 상태 메시지 |
| 4 | `npm run qa`에 macro-news 스모크 추가 (구현 후) |
| 5 | 스크랩 코드 없음 또는 ToS 문서화된 소스만 |

---

## 8. 관련 작업

| ID | 관계 |
|----|------|
| K-3 | 한국 뉴스 (별도) |
| P3-2 | US 종목별 뉴스 ✅ 완료 |
| **A-1~A-4** | 종목 모달 **시간대별 AI 브리핑** — [AI-BRIEFING.md](./AI-BRIEFING.md) |
| M-9 | 뉴스레터·스폰서 (수익화, 선택) |

---

*구현 시작 시 N-0 결과를 이 문서 상단에 「확정 소스」표로 갱신할 것.*
