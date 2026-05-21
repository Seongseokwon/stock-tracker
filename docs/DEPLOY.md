# 배포 가이드

**최종 갱신:** 2026-05-21  
**프로덕션:** https://stock-tracker-opal-six.vercel.app

---

## 1. Vercel 배포 (프론트 + API)

### 사전 준비

1. [Vercel 계정](https://vercel.com/signup) 생성
2. [Finnhub API 키](https://finnhub.io) 발급
3. Node.js 18+

### 처음 배포

```bash
npm run install:all
npx vercel login
npx vercel                     # 프리뷰 배포 (설정 확인용)
npx vercel env add FINNHUB_API_KEY   # Production + Preview 모두 선택
npx vercel env add AUTH_CODE         # 로그인 코드
npx vercel env add SESSION_SECRET    # 세션 서명 비밀키
npm run vercel:prod                  # 프로덕션 배포
```

> `npx vercel` 첫 실행 시 질문: Set up = Y, Link to existing = N, Directory = `./`, Modify settings = N

### 이후 업데이트

```bash
npm run vercel:prod   # 또는 npx vercel deploy --prod
```

### 환경 변수 (Vercel 대시보드)

Settings → Environment Variables

| 변수 | 필수 | 설명 |
|------|------|------|
| `FINNHUB_API_KEY` | ✅ | US 시세·뉴스·WebSocket |
| `AUTH_CODE` | ✅ | 로그인 코드 (대소문자 무시) |
| `SESSION_SECRET` | ✅ | 쿠키 서명 비밀키 |

환경 변수 추가 후 **재배포 필수**.

### Vercel 제약사항

| 항목 | 내용 |
|------|------|
| US WebSocket | ❌ 지원 안 함 (`wsSupported: false`, 폴링으로 대체) |
| 타임아웃 | 30초 |
| KR 시세 | Yahoo 폴링 — Vercel과 동일 |

### 문제 해결

| 증상 | 원인 / 해결 |
|------|------------|
| `No Output Directory "public"` | `vercel.json`의 `outputDirectory: "frontend"` 확인 |
| `/api/*` 404 | `api/index.js` 아님 → `api/[[...slug]].js` 사용 |
| API 500 | Vercel에 `FINNHUB_API_KEY` 설정 → 재배포 |
| `functions` + `builds` 오류 | `vercel.json`에 `builds`와 `functions` 동시 사용 불가 → `functions`만 유지 |

---

## 2. Railway 배포 (백엔드 · WebSocket)

> **목표:** Vercel(정적+PWA) + Railway(API·WebSocket) 하이브리드  
> **효과:** US 주식 WebSocket 실시간 시세 (`wsSupported: true`)

### 아키텍처

```
[Vercel]  frontend/ 정적 + PWA  →  https://stock-tracker-….vercel.app
[Railway] backend/server.js      →  https://stockpulse-api.up.railway.app
          /api/*  REST + /ws WebSocket
```

### 배포 설정

1. [railway.app](https://railway.app) 로그인 → **New Project**
2. **Root Directory:** `backend`
3. **Start Command:** `npm install && npm start`

### 환경 변수 (Railway Variables)

| 변수 | 설명 |
|------|------|
| `FINNHUB_API_KEY` | ✅ 필수 |
| `CORS_ORIGINS` | `https://stock-tracker-opal-six.vercel.app,http://localhost:3000` |
| `AUTH_CODE` | 로그인 코드 |
| `SESSION_SECRET` | 세션 비밀키 |

> `VERCEL=1` 설정 금지 — WS·listen 비활성화됨

### Health Check 확인

```bash
curl https://YOUR_APP.up.railway.app/api/health
# { "ok": true, "finnhubConfigured": true, "wsSupported": true }
```

### 프론트 연결 (RW-5, Railway URL 확정 후)

`frontend/app.js` 상단:

```javascript
const API_BASE = window.__API_BASE__ || '';   // Railway URL 주입
```

### 작업 현황 (RW-*)

| ID | 작업 | 상태 |
|----|------|------|
| RW-0 | 프로젝트·배포 방식 결정 | 🔄 Docker Hub 방식으로 전환 |
| RW-1 | Docker 이미지 빌드·push | 🔄 빌드 완료, push 대기 |
| RW-2 | 환경 변수 등록 | ⬜ |
| RW-3 | `/api/health` → `wsSupported: true` | ⬜ |
| RW-4 | 공개 HTTPS URL | ⬜ |
| RW-5 | 프론트 API_BASE·WS_URL 연동 | ⬜ |
| RW-6 | CORS | ✅ 2026-05-20 |
| RW-7~8 | QA·역할 분담 문서화 | ⬜ |

---

## 3. PWA 설치

**URL:** https://stock-tracker-opal-six.vercel.app · SW 캐시: `stockpulse-v4`

> `file://`로 연 파일은 설치 불가. 반드시 `https://` 또는 `localhost:3000` 사용.

### Windows — Chrome / Edge

- 주소창 오른쪽 **⊕ 설치** 버튼 클릭
- 없으면: **⋮ 메뉴 → 앱으로 설치** (Chrome) / **⋯ → 앱 → 설치** (Edge)
- 또는 `F12 → Application → Manifest → Install` 링크

### Android / iPhone

- Android Chrome: **⋮ → 앱 설치**
- iPhone Safari: **공유(↑) → 홈 화면에 추가**

### 안 될 때

```
F12 → Application → Manifest → Installability 메시지 확인
```

| 메시지 | 조치 |
|--------|------|
| No matching service worker | 새로고침 후 재시도 |
| Manifest PNG 192 없음 | `npm run fix:pwa` → 재배포 |
| Already installed | `chrome://apps` 확인 |

초기화: `F12 → Application → Service Workers → Unregister` → `Storage → Clear site data` → `Ctrl+Shift+R`

---

## 4. OG / 카카오 링크 미리보기

**상태:** ✅ 완료 (O-4)

| 항목 | 값 |
|------|-----|
| `og:image` | `og-image.png` (1200×630, HTTPS) |
| `og:title` | StockPulse — 실시간 주식 트래커 |

### 캐시 갱신 (OG 이미지 바꿨을 때)

1. [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing) → URL 입력 → **조회**
2. **캐시 초기화** → 다시 조회
3. 카카오톡에서 URL 붙여넣기로 최종 확인

URL 뒤 `?v=2` 붙이면 새 캐시로 강제 적용됨.

Facebook 동일 OG 태그 사용 → [Sharing Debugger](https://developers.facebook.com/tools/debug/)

---

## 5. 압축 · 백업

```bash
npm run clean          # node_modules·.vercel 제거 (~200MB 절약)
```

이후 폴더 압축. **`backend/.env`가 zip에 들어가지 않도록 주의** (API 키 유출 위험).

### 복구

```bash
npm run install:all
cp backend/.env.example backend/.env
# backend/.env → FINNHUB_API_KEY, AUTH_CODE, SESSION_SECRET 입력
npm start
```
