# StockPulse — 작업 목록

**최종 갱신:** 2026-05-21 (재사용 가능 로그인 코드 인증 · Railway 배포 완료 · PWA 아이콘 확인)  
**프론트:** https://stock-tracker-opal-six.vercel.app  
**백엔드:** https://stock-tracker-production-7e54.up.railway.app  
**마스터 문서:** [HANDOFF.md](./HANDOFF.md)

---

## 완료

| ID | 타스크 | 완료일 |
|----|--------|--------|
| O-1 | Vercel `FINNHUB_API_KEY` 등록·재배포 | 사용자 |
| O-2 | 프로덕션 스모크 (`npm run qa:prod` **43/43**) | 2026-05-19 |
| O-3 | 브라우저 수동 QA 7항 | 사용자 |
| O-4 | 카카오 링크 미리보기 | 사용자 |
| O-5 | Git 초기화·첫 커밋 (`41363fc`) | 2026-05-20 |
| O-6 | 문서 동기화 (전체 docs·README·PROJECT) | 2026-05-19 |
| O-7 | AI 핸드오프 문서 `HANDOFF.md` | 2026-05-19 |
| DS-0~9 | 디자인 리디자인 (Minimal + Glass Hybrid) | 2026-05-20 |
| RW-0 | Railway 프로젝트·서비스 생성 | 2026-05-21 |
| RW-1 | Dockerfile `backend/` build context 수정·배포 | 2026-05-21 |
| RW-2 | Railway 환경변수 `FINNHUB_API_KEY`, `SESSION_SECRET`, `ADMIN_SECRET` | 2026-05-21 |
| RW-3 | `/api/health` → `{"ok":true,"wsSupported":true}` | 2026-05-21 |
| RW-4 | 공개 URL `stock-tracker-production-7e54.up.railway.app` | 2026-05-21 |
| RW-5 | Vercel rewrite `/api/*`→Railway + WS_PATH Railway WSS | 2026-05-21 |
| RW-6 | CORS — Vercel origin 허용 | 2026-05-20 |
| RW-9 | Railway Postgres `DATABASE_URL` + 자동 마이그레이션 | 2026-05-21 |
| L-0 | Docker PostgreSQL 5433 + `DATABASE_URL` 설정 | 2026-05-21 |
| L-1 | `users` · `login_codes` · `sessions` 스키마 (001_auth.sql) | 2026-05-21 |
| L-2 | `POST /api/auth/login` — DB 로그인 코드 조회(재사용 가능) + env fallback | 2026-05-21 |
| L-3 | `GET /api/auth/me` + `POST /api/auth/logout` — DB 세션 검증·삭제 | 2026-05-21 |
| L-5 | 로그인 코드 생성 CLI (`backend/gen-code.js`, `npm run db:gen-code`) | 2026-05-21 |
| L-6 | SPA 인증 가드 (`app.js init()`) + 헤더 로그아웃 버튼 | 2026-05-21 |
| L-9 | `.env.example` 갱신 (`AUTH_CODE`, `SESSION_SECRET`, `DATABASE_URL`) | 2026-05-21 |
| D-1 | SW 캐시 **`stockpulse-v4`** | 2026-05-19 |
| D-2 | PWA 아이콘 512 PNG + manifest | 2026-05-19 |
| D-2b | PWA 설치·바탕화면 아이콘 최종 확인 | 사용자 확인 |
| D-4 | `og-image.png` / `icon-512.png` 용량 최적화 | 2026-05-19 |
| D-5 | `icon-192.png` (Chrome 설치 조건) | 2026-05-19 |
| UI-1 | 관심목록 카드: **종목명 위 / 코드 아래** | 2026-05-19 |
| — | OG 메타·`og-image.png` | 2026-05-19 |
| — | PWA assets (`fix:pwa`, screenshots, 192/512 PNG) | 2026-05-19 |
| — | 수익화·법적 고지 문서 (`MONETIZATION`, `LEGAL-DISCLAIMER`) | 2026-05-19 |

---

## 1순위 — 디자인 마무리 (Minimal + Glass Hybrid)

| ID | 타스크 | 상태 |
|----|--------|------|
| DS-10 | 디자인 QA·PWA 스크린샷 갱신 (`npm run fix:pwa` 후 Vercel 재배포) | ⬜ |

---

## 2순위 — Vercel·PWA

| ID | 타스크 | 상태 |
|----|--------|------|
| D-3 | 배포 후 Vercel Functions 로그 점검 (429·타임아웃) | ⬜ |

---

## 3순위 — MVP 로그인·DB (재사용 가능 로그인 코드)

> 기획: [AUTH-MVP.md](./AUTH-MVP.md) — 코드 입력만 로그인, **관심종목 서버 저장**

| ID | 타스크 | 상태 |
|----|--------|------|
| L-4 | `GET/PUT/POST/DELETE /api/watchlist` | ⬜ DB 연결 완료, 구현 대기 |
| L-7 | 관심종목 추가/삭제 → 서버 동기화 (`app.js`) | ⬜ L-4 완료 후 |
| L-8 | 로그인 시 서버↔localStorage 병합 정책·QA | ⬜ |
| L-10 | (선택) 포트폴리오·알림 DB 확장 | ⬜ |

---

## 4순위 — AI 종목 브리핑 (관심종목 클릭 · 시간대별)

> 기획: [AI-BRIEFING.md](./AI-BRIEFING.md) — 장전(전일) · **12시 이후** 오전장 · 장마감 후(당일)

| ID | 타스크 | 상태 |
|----|--------|------|
| A-0 | 슬롯 규칙 (KR KST / US ET, `pre_open`·`midday`·`post_close`) | ⬜ |
| A-1 | `GET /api/briefing?symbol=&slot=auto` + 시세·차트·뉴스 수집 | ⬜ |
| A-2 | 규칙 기반 MVP 요약 (LLM 없이, US 뉴스+주가) | ⬜ |
| A-3 | LLM 연동 (서버 프록시, `OPENAI_API_KEY` 등) | ⬜ |
| A-4 | 모달 상단 「AI 브리핑」UI (`openModal` 연동) | ⬜ |
| A-5 | 슬롯·거래일별 캐시 (+ 선택 Cron 선생성) | ⬜ |
| A-6 | 12시 전 장중: 「오전 브리핑은 12시 이후」 안내 | ⬜ |
| A-7 | 면책·QA (`LEGAL` 연동) | ⬜ |
| A-8 | (선택) KR 뉴스 연동 후 브리핑 보강 (K-3) | ⬜ |

---

## 5순위 — 한국 시장 심화

| ID | 타스크 | 상태 |
|----|--------|------|
| K-1 | `kr-stocks` 종목 추가 | ⬜ |
| K-2 | KRX 전 종목 자동 갱신 조사 | ⬜ |
| K-3 | 한국 뉴스 API | ⬜ |
| K-4 | 한국 재무 API | ⬜ |
| K-5 | KIS/KRX 실시간 시세 | ⬜ |
| K-6~8 | 외국인 수급 Phase 0→2 | ⬜ |

---

## 6순위 — 미국 매크로·경제 뉴스 (Bloomberg 등)

> 기획: [NEWS-FEED.md](./NEWS-FEED.md) — **블룸버그 HTML 스크랩은 비권장**, RSS·Finnhub·원문 링크 중심

| ID | 타스크 | 상태 |
|----|--------|------|
| N-0 | 데이터 소스·약관 조사 (Finnhub general/market news, Fed RSS, Bloomberg 링크만 등) | ⬜ |
| N-1 | `GET /api/macro-news` — 매크로 뉴스 API (종목 `/api/news`와 분리) | ⬜ |
| N-2 | 수집·캐시 (Vercel Cron 또는 주기 fetch, 중복 제거) | ⬜ |
| N-3 | 프론트 **「미국 경제」** 패널/탭 (제목·출처·원문 링크) | ⬜ |
| N-4 | 카테고리·관심종목 연관 필터·「오늘/이번 주」 | ⬜ |
| N-5 | (선택) 3줄 브리핑·태그 정리 (요약만, 본문 무단 복제 금지) | ⬜ |
| N-6 | 출처 표시·면책 (LEGAL 연동, Bloomberg는 링크 아웃만) | ⬜ |

---

## 7순위 — 품질

| ID | 타스크 | 상태 |
|----|--------|------|
| Q-1 | API 단위 테스트 | ⬜ |
| Q-2 | `npm run qa:prod` CI 연동 (선택) | ⬜ |

---

## 8순위 — 수익화 (빠른 순)

상세: [MONETIZATION.md](./MONETIZATION.md) · 고지: [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md)

| ID | 타스크 | Tier | 상태 |
|----|--------|------|------|
| M-2 | 면책·이용약관·개인정보 푸터/페이지 | 1 | ⬜ **먼저** |
| M-1 | 후원·팁 링크 (푸터) | 1 | ⬜ |
| M-3 | Analytics (GA4 또는 Vercel) | 1 | ⬜ |
| M-4 | 증권사·브로커 제휴 링크 + 광고 표시 | 2 | ⬜ |
| M-5 | AdSense 슬롯 | 2 | ⬜ |
| M-6 | 템플릿·소스 판매 패키지 | 2 | ⬜ |
| M-7 | 프리미엄 대기자 Form (의향 조사) | 2 | ⬜ |
| M-8 | 결제·유료 tier (로그인 MVP는 **L-*** 완료 후) | 3 | ⬜ |

---

## 빠른 명령

```bash
npm run qa          # 로컬
npm run qa:prod     # 프로덕션
npx vercel deploy --prod
```
