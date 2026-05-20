# 카카오톡 링크 미리보기 (O-4)

**최종 갱신:** 2026-05-19 · **상태:** ✅ 완료 (사용자 확인)

**사이트 URL:** https://stock-tracker-opal-six.vercel.app

---

## 1. 서버 측 확인 (완료)

| 항목 | 상태 |
|------|------|
| `og:title` | StockPulse — 실시간 주식 트래커 |
| `og:description` | 미국·한국 주식 관심목록… |
| `og:image` | `https://stock-tracker-opal-six.vercel.app/og-image.png` |
| 이미지 크기 | 1200×630, PNG, HTTPS 200 |

브라우저에서 이미지 직접 열기:  
https://stock-tracker-opal-six.vercel.app/og-image.png

---

## 2. 카카오 캐시 삭제 (직접 수행)

1. [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing) 접속  
2. **로그인** (카카오 계정 — 개발자 앱 등록 불필요, 도구만 사용)  
3. URL 입력: `https://stock-tracker-opal-six.vercel.app`  
4. **「조회」** 클릭 → 미리보기·스크랩 결과 확인  
5. **「캐시 초기화」** (또는 「스크랩 정보 갱신」) 버튼 클릭  
6. 다시 **「조회」** 해서 썸네일·제목·설명이 바뀌었는지 확인  

---

## 3. 카카오톡에서 최종 확인

1. **새 채팅** 또는 **나와의 채팅**에 URL 붙여넣기  
2. 예전과 같이 「여기를 눌러 링크를 확인하세요」만 보이면:  
   - 디버거에서 캐시 초기화를 한 번 더  
   - URL 끝에 `?v=2` 붙여 테스트:  
     `https://stock-tracker-opal-six.vercel.app/?v=2`  
3. 썸네일·제목·설명이 보이면 **O-4 완료**

---

## 4. 문제 해결

| 증상 | 조치 |
|------|------|
| 이미지 안 보임 | `og-image.png` URL을 브라우저에서 직접 열어보기 |
| 예전 미리보기만 보임 | 디버거 **캐시 초기화** 후 1~2분 대기 |
| 제목만 있고 이미지 없음 | 이미지 8MB 이하·HTTPS 확인 (현재 ~1.5MB) |
| 설명이 기본 문구 | `og:description` 메타 확인 → 재배포 |

---

## 5. 참고 (Facebook·iMessage)

동일 OG 태그 사용. Facebook: [Sharing Debugger](https://developers.facebook.com/tools/debug/)
