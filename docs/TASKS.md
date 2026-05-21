# StockPulse — 작업 목록

**최종 갱신:** 2026-05-22  
**프론트:** https://stock-tracker-opal-six.vercel.app  
**백엔드:** https://stock-tracker-production-7e54.up.railway.app  
**마스터 문서:** [HANDOFF.md](./HANDOFF.md)

> **수익화 목표:** AdSense 승인 최단 경로 → M-3b(GA4 실 ID) → A-0~A-2(브리핑 콘텐츠) → M-5(AdSense 신청)

---

## 완료

<details>
<summary>완료된 작업 전체 보기</summary>

| ID | 타스크 | 완료일 |
|----|--------|--------|
| O-1 | Vercel `FINNHUB_API_KEY` 등록·재배포 | 사용자 |
| O-2~7 | QA·문서·Git 초기화 | 2026-05-19~20 |
| DS-0~10 | Minimal + Glass Hybrid 리디자인 + PWA 스크린샷 | 2026-05-20~21 |
| RW-0~9 | Railway 백엔드·DB·WebSocket·CORS·Vercel 연동 | 2026-05-20~21 |
| L-0~9 | PostgreSQL 인증 스키마, 재사용 로그인 코드, watchlist DB 동기화 | 2026-05-21 |
| M-2a~c | 면책고지·개인정보처리방침 페이지 + 푸터 링크 | 2026-05-21 |
| M-3 | GA4 스크립트 삽입 (4개 HTML 파일) | 2026-05-21 |
| D-1~5 | PWA 아이콘·캐시·OG 이미지 | 2026-05-19 |
| UI-1 | 카드 종목명 위·코드 아래 | 2026-05-19 |
| BUG-01 | 토스트 알림 z-index 수정 (모달 위에 표시) | 2026-05-22 |
| — | README.md 개선 (스크린샷·현재 스택) | 2026-05-21 |

</details>

---

## 1순위 — GA4 측정 ID 교체 (사용자 직접)

> GA4 스크립트는 삽입됐지만 실제 측정 ID가 없어 데이터가 수집되지 않습니다.  
> AdSense 심사 시 트래픽 증거로 활용. 신청 전 최소 2~4주 데이터가 있으면 유리합니다.

| ID | 타스크 | 상태 |
|----|--------|------|
| M-3b | GA4 콘솔(analytics.google.com)에서 측정 ID 발급 후 `G-XXXXXXXXXX` → 실제 ID 교체 | ⬜ 사용자 직접 |

> 교체 대상 파일 (각 2곳씩, 총 8곳):  
> `frontend/index.html`, `frontend/login.html`, `frontend/disclaimer.html`, `frontend/privacy.html`

---

## 2순위 — 법적 고지 (완료)

| ID | 타스크 | 상태 |
|----|--------|------|
| M-2a | 면책고지 페이지 (`/disclaimer.html`) | ✅ 2026-05-21 |
| M-2b | 개인정보처리방침 페이지 (`/privacy.html`) | ✅ 2026-05-21 |
| M-2c | 푸터에 링크 삽입 (면책·개인정보, index.html·login.html) | ✅ 2026-05-21 |
| M-3 | GA4 스크립트 삽입 (스크립트 구조 완료, 측정 ID 교체 필요 → M-3b) | ✅ 2026-05-21 |

---

## 3순위 — AI 종목 브리핑 (콘텐츠 풍부화 · AdSense 핵심)

> 현재 앱은 숫자 나열 수준 → 브리핑 추가 시 "금융 콘텐츠 플랫폼"으로 격상.  
> A-2(규칙 기반)는 **LLM 비용 없음** — AdSense 승인 전 먼저 구현.

| ID | 타스크 | 상태 |
|----|--------|------|
| A-0 | 슬롯 규칙 정의 (KST/ET 기준 `pre_open`·`midday`·`post_close`) | ⬜ |
| A-1 | `GET /api/briefing?symbol=&slot=auto` — 시세·뉴스 데이터 수집 | ⬜ |
| A-2 | 규칙 기반 요약 MVP (LLM 없음 — 주가 변동·뉴스 헤드라인 조합) | ⬜ |
| A-4 | 모달 상단 「브리핑」 UI 섹션 | ⬜ |
| A-5 | 슬롯·거래일 단위 캐시 (Railway DB) | ⬜ |
| A-7 | 면책 문구 연동 (M-2 완료 후) | ⬜ |
| A-3 | LLM 연동 (Claude / GPT — **AdSense 수익 안정 후 도입**) | ⬜ |
| A-6 | 장중 12시 전 안내 문구 | ⬜ |
| A-8 | (선택) KR 뉴스 연동 후 브리핑 보강 | ⬜ |

---

## 4순위 — AdSense 신청 및 슬롯 삽입

> 1~3순위 완료 후 신청. 콘텐츠·법적 고지·Analytics 3가지 갖춰야 합격률 높음.

| ID | 타스크 | 상태 |
|----|--------|------|
| M-5a | Google AdSense 계정 신청 + 사이트 등록 | ⬜ |
| M-5b | AdSense 자동 광고 스크립트 삽입 | ⬜ |
| M-5c | 광고 슬롯 위치 결정 (브리핑 하단·카드 그리드 사이) | ⬜ |

---

## 5순위 — 브리핑 고도화 (LLM)

> A-3 포함. AdSense 수익이 LLM API 비용을 커버한 후 전환.

| ID | 타스크 | 상태 |
|----|--------|------|
| A-3 | Claude / GPT 연동 — 서버 프록시, `CLAUDE_API_KEY` 또는 `OPENAI_API_KEY` | ⬜ |

---

## 6순위 — 한국 시장 심화

| ID | 타스크 | 상태 |
|----|--------|------|
| K-1 | `kr-stocks` 종목 추가 | ⬜ |
| K-2 | KRX 전 종목 자동 갱신 조사 | ⬜ |
| K-3 | 한국 뉴스 API | ⬜ |
| K-4 | 한국 재무 API | ⬜ |
| K-5 | KIS/KRX 실시간 시세 | ⬜ |

---

## 7순위 — 프리미엄 기능 (유료화 기반)

> AdSense 외 수익 다변화. 로그인 인프라가 이미 갖춰져 있어 구현 난도 낮음.

| ID | 타스크 | 상태 |
|----|--------|------|
| L-10 | 포트폴리오·알림 DB 저장 (로그인 사용자 전용 프리미엄) | ⬜ |
| M-7 | 프리미엄 대기자 Form (의향 조사) | ⬜ |
| M-8 | 결제·유료 tier (Stripe 등) | ⬜ |
| M-4 | 증권사·브로커 제휴 링크 | ⬜ |
| M-1 | 후원·팁 링크 (Ko-fi 등) | ⬜ |

---

## 8순위 — 매크로 뉴스 허브

| ID | 타스크 | 상태 |
|----|--------|------|
| N-0 | 데이터 소스·약관 조사 | ⬜ |
| N-1 | `GET /api/macro-news` | ⬜ |
| N-2~6 | 수집·캐시·UI·필터·면책 | ⬜ |

---

## 9순위 — 품질

| ID | 타스크 | 상태 |
|----|--------|------|
| Q-1 | API 단위 테스트 | ⬜ |
| Q-2 | `npm run qa:prod` CI 연동 | ⬜ |

---

## 빠른 명령

```bash
npm start                              # 로컬 서버
npm run db:gen-code                    # 로그인 코드 생성
npm run qa                             # 자동 QA (로컬)
npm run qa:prod                        # 자동 QA (프로덕션)
npx vercel deploy --prod               # Vercel 배포
```
