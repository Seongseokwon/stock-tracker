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

## [BUG-003] 이메일 배송 경로 `emailSent` 오진 + 예외 미처리

- **날짜:** 2026-05-22
- **심각도:** Medium
- **증상:**
  1. `email` 배송 경로에서 `sendMail()` 실패 시에도 `emailSent: true` 반환
  2. `sendMail()` 예외가 try/catch 없이 전파 → 500 응답, DB 상태 업데이트 미실행
  3. Gmail 자격증명 미설정 시 원인을 응답에 포함하지 않음
- **원인:**
  1. `emailSent: Boolean(mailer)` — mailer 객체 존재 여부로 판단, 실제 발송 결과와 무관
  2. `instant` 경로에는 try/catch가 있었으나 `email` 경로에는 없었음 (BUG-03 반쪽 수정)
- **수정:**
  - `email` 경로에 `instant`와 동일한 try/catch + `emailSent` / `emailError` 패턴 적용
  - 자격증명 미설정 시 `emailError: 'GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수 미설정'` 반환
  - `backend/test-email.js` — SMTP 연결·단건 발송 독립 테스트 스크립트 추가
  - `backend/test-email-flow.js` — 요청 → 승인 → 이메일 발송 전체 플로우 통합 테스트 추가
- **파일:** `backend/server.js`, `backend/test-email.js`(신규), `backend/test-email-flow.js`(신규), `package.json`
- **커밋:** (이번 커밋)
- **검증:** `npm run test:email-flow` — email/instant 모두 `emailSent: true`, `pam9411@naver.com` 수신 확인

---
