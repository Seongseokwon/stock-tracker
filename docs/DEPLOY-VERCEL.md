# Vercel 배포 (Git 없이)

**최종 갱신:** 2026-05-19

> **백엔드·WebSocket:** Railway 이전 예정 → [DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md) (RW-*)

StockPulse는 **Vercel CLI**로 로컬 폴더를 그대로 업로드해 배포할 수 있습니다. Git 연동은 필요 없습니다.

**프로덕션:** https://stock-tracker-opal-six.vercel.app

## 사전 준비

1. [Vercel 계정](https://vercel.com/signup) 생성
2. [Finnhub API 키](https://finnhub.io) 발급
3. Node.js 18+

## 1. 의존성 설치

프로젝트 루트에서:

```bash
npm run install:all
```

## 2. Vercel CLI 로그인

```bash
npx vercel login
```

브라우저에서 인증합니다.

## 3. 첫 배포 (프리뷰)

```bash
npx vercel
```

질문이 나오면 예시:

| 질문 | 권장 |
|------|------|
| Set up and deploy? | **Y** |
| Which scope? | 본인 계정 |
| Link to existing project? | **N** (처음이면) |
| Project name? | `stockpulse` 등 |
| In which directory is your code located? | `./` (Enter) |
| Want to modify settings? | **N** (vercel.json 사용) |

배포가 끝나면 `https://xxxx.vercel.app` URL이 출력됩니다.

## 4. 환경 변수 (필수)

Finnhub 키는 **Vercel 대시보드** 또는 CLI로 설정합니다. `.env` 파일은 업로드되지 않습니다.

### CLI

```bash
npx vercel env add FINNHUB_API_KEY
# 값 입력 → Environment: Production, Preview, Development 모두 선택
```

변수 추가 후 **다시 배포**해야 적용됩니다.

### 대시보드

1. [vercel.com/dashboard](https://vercel.com/dashboard) → 프로젝트 선택  
2. **Settings** → **Environment Variables**  
3. `FINNHUB_API_KEY` = Finnhub 키 추가 (Production + Preview)

## 5. 프로덕션 배포

```bash
npm run vercel:prod
# 또는
npx vercel deploy --prod
```

## 이후 업데이트

코드 수정 후 같은 폴더에서:

```bash
npx vercel deploy --prod
```

Git 없이도 CLI가 변경 파일만 업로드합니다.

---

## 배포 후 검증

```bash
npm run qa:prod
```

`/api/health` → `finnhubConfigured: true`, `wsSupported: false` 확인.

```bash
npm run qa:prod   # 43/43 PASS 기대
```

---

## 링크 미리보기 (카카오톡 등)

상세 절차: **[docs/OG-KAKAO.md](./OG-KAKAO.md)**

1. [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing) → URL 입력 → **조회**
2. **캐시 초기화** → 다시 조회
3. 카카오톡에 `https://stock-tracker-opal-six.vercel.app` 붙여넣기

`frontend/og-image.png` (1200×630) · `index.html` Open Graph 메타

---

## Vercel vs 로컬 차이

| 항목 | 로컬 (`npm start`) | Vercel |
|------|-------------------|--------|
| 미국 주식 실시간 | WebSocket | **폴링** (약 20초) |
| 한국 주식 | Yahoo 3초 폴링 | 동일 (폴링) |
| API·검색·차트 | ✅ | ✅ |
| PWA / HTTPS | 수동 | ✅ 자동 |

헤더 상태가 `폴링 모드`로 보이면 정상입니다 (`/api/health` → `wsSupported: false`).

---

## 문제 해결

### `No Output Directory named "public" found`

`public` 폴더가 없어서가 **아닙니다**. Vercel 대시보드 기본값이 `public`이라 생기는 오류입니다.

현재 설정은 `vercel.json`의 **`"outputDirectory": "frontend"`** 로 해결합니다.

- **UI·정적 파일** → `frontend/` 폴더 (HTML, CSS, JS)
- **API** → `api/[[...slug]].js` (Express, `/api/*` 전체 경로)

1. `vercel.json`에 `outputDirectory: "frontend"` 있는지 확인
2. `npx vercel deploy --prod` 재배포
3. 여전히 실패 시 대시보드 → **Settings → General → Output Directory**를 **`frontend`** 로 맞추거나 Override 끄기

### `functions` cannot be used with `builds`

`vercel.json`에서 **`builds`와 `functions`는 둘 중 하나만** 쓸 수 있습니다. 최신 설정은 `functions` + `rewrites`만 사용합니다.

### `/api/*` 가 404 (NOT_FOUND)

`api/index.js`만 있으면 **`/api` 루트만** 동작하고 `/api/health` 등은 404입니다.  
`api/[[...slug]].js` 로 Express 앱을 연결해야 합니다 (현재 `vercel.json` 반영됨).

### API 500 / 종목 시세 없음

- Vercel에 `FINNHUB_API_KEY`가 설정됐는지 확인  
- 환경 변수 변경 후 `vercel deploy --prod` 재실행

### `FINNHUB_API_KEY not configured` 토스트

위와 동일. Preview URL에도 Preview 환경 변수를 넣었는지 확인.

### 빌드 실패

```bash
npm run build:kr-stocks
npm run install:all
npx vercel deploy
```

### 로컬은 되는데 Vercel만 안 됨

- 서버 재배포 후 `/api/health` 접속 → `finnhubConfigured: true` 확인  
- Functions 로그: Vercel 대시보드 → **Deployments** → **Functions**

---

## 파일 구조 (배포 관련)

```
stock-tracker/
├── frontend/             # 정적 배포 (outputDirectory)
├── api/[[...slug]].js    # /api/* 서버리스 (Express API 전체)
├── vercel.json           # outputDirectory: frontend
├── .vercelignore         # 업로드 제외 (.env 등)
└── backend/server.js     # API 로직 (로컬은 정적+WS 포함)
```

`.vercel/` 폴더는 CLI가 생성하며 Git에 올릴 필요 없습니다.
