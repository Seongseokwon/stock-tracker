# Bug & Error Log

**형식:**
```
## [BUG-NNN] 제목
- 날짜: YYYY-MM-DD
- 심각도: Critical / High / Medium / Low
- 증상: 사용자가 경험한 현상
- 원인: 근본 원인
- 수정: 어떻게 고쳤는지
- 파일: 변경된 파일
- 커밋: git commit hash
```

---

## [BUG-001] 미인증 사용자가 URL 직접 입력으로 대시보드 진입 가능

- **날짜:** 2026-05-21
- **심각도:** High
- **증상:** 로그인 코드를 입력하지 않고 `/`(홈) URL로 직접 이동해도 대시보드에 정상 진입됨
- **원인:**
  1. `express.static`이 인증 검사 없이 `index.html`을 서빙 (서버 사이드 가드 없음)
  2. 클라이언트 사이드 `fetch('/api/auth/me')` 호출 시 `credentials` 옵션 미지정
  3. 브라우저 bfcache(뒤로 가기 캐시)로 페이지 복원 시 세션 재검증 로직 없음
  4. `login.html`에 이미 로그인된 사용자를 `/`로 보내는 로직 없음
- **수정:**
  - `backend/server.js`: `express.static` 앞에 `GET /` 서버 사이드 가드 추가 — 쿠키 없으면 `/login.html` 리다이렉트
  - `frontend/app.js`: `fetch` 에 `credentials: 'same-origin'` 추가, `pageshow` 이벤트로 bfcache 복원 시 재검증
  - `frontend/login.html`: 페이지 로드 시 이미 로그인 상태면 `/`로 `window.location.replace()`
- **파일:** `backend/server.js`, `frontend/app.js`, `frontend/login.html`
- **커밋:** `734b750`

---
