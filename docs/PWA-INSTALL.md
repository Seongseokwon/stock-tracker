# PWA 앱 설치 가이드 (D-2b 확인)

**최종 갱신:** 2026-05-19

**URL:** https://stock-tracker-opal-six.vercel.app  
**로컬:** `npm start` 후 http://localhost:3000  
**SW 캐시:** `stockpulse-v4`

---

## 먼저 확인

| 항목 | 확인 방법 | 정상 |
|------|-----------|------|
| manifest | 브라우저에서 `/manifest.json` 열기 | `icon-512.png` 항목 있음 |
| 아이콘 | `/icon-512.png` 열기 | 이미지 표시 |
| **배포** | D-2 후 `npx vercel deploy --prod` 했는지 | 필수 |

`file://` 로 연 HTML 파일은 **설치 불가**. 반드시 **https://…vercel.app** 또는 **localhost:3000** 으로 접속하세요.

---

## Windows — Chrome / Edge

### 방법 A: 주소창 설치 버튼

1. **Chrome** 또는 **Edge** 에서 사이트 접속  
2. 주소창 **오른쪽**을 본다  
3. **⊕ 설치** 또는 **컴퓨터에 StockPulse 설치** 아이콘이 있으면 클릭  
4. 「설치」 확인  

> 버튼이 **안 보이면** 방법 B·C·아래 「안 될 때」 참고.

### 방법 B: 메뉴에서 설치

**Chrome**

1. 주소창 오른쪽 **⋮** (맞춤설정 및 제어)  
2. **캐스트, 저장 및 공유** → **StockPulse 설치…**  
   - 또는 **앱을 설치하여 StockPulse에 쉽게 액세스…**  
3. 「설치」  

**Edge**

1. **⋯** 메뉴 → **앱** → **StockPulse을(를) 설치**

### 방법 C: DevTools (가장 확실)

1. `F12` → **Application** (애플리케이션) 탭  
2. 왼쪽 **Manifest** 클릭  
3. 아래쪽 **「Installability」** / 설치 관련 메시지 확인  
4. **Install** / **설치** 링크가 있으면 클릭  

**Service Workers** 항목에서 `sw.js` 가 **activated** 인지 확인.

### 설치됐는지 확인

- Chrome: 주소창에 `chrome://apps` 입력 → StockPulse 카드  
- Windows 시작 메뉴에 **StockPulse** 앱  

---

## Android — Chrome

1. https://stock-tracker-opal-six.vercel.app 접속  
2. **⋮** 메뉴 → **앱 설치** 또는 **홈 화면에 추가**  
3. 홈 화면 아이콘 확인  

---

## iPhone — Safari

Chrome 설치 버튼이 **없습니다**. Safari만 해당:

1. Safari로 사이트 접속  
2. 하단 **공유** (↑) → **홈 화면에 추가**  
3. 이름 확인 후 **추가**  

---

## DevTools로 원인 찾기 (안 될 때)

1. `F12` → **Application** → **Manifest**  
2. 빨간 경고가 있으면 내용 확인  

| 메시지 예시 | 의미 |
|-------------|------|
| No matching service worker | `sw.js` 미등록 → 새로고침, 캐시 삭제 |
| Manifest does not have PNG 192 | `icon-192.png` 배포 확인 → `npm run fix:pwa` 후 재배포 |
| Page is not served over HTTPS | `https://` 로 접속 |
| Already installed | 이미 설치됨 → `chrome://apps` 에서 확인 |

3. **Console** 탭에서 `Service Worker` / `manifest` 오류 검색  

### 캐시·SW 초기화 후 재시도

1. `F12` → **Application**  
2. **Service Workers** → **Unregister**  
3. **Storage** → **Clear site data**  
4. `Ctrl+Shift+R` 강력 새로고침  
5. 10~30초 머문 뒤 설치 버튼 다시 확인  

---

## 자주 있는 이유 (설치 버튼 없음)

1. **로컬 HTML 파일로 열음** (`index.html` 더블클릭) → `npm start` 또는 Vercel URL 사용  
2. **D-2 배포 전** manifest에 512 없음 → `vercel deploy --prod`  
3. **시크릿 모드** — 일반 창에서 시도  
4. **이미 설치됨** — `chrome://apps` 확인  
5. **PC Chrome** — 방문·체류 시간이 짧으면 버튼이 늦게 뜸 (1~2분 대기)  
6. **예전 설치본** — manifest·아이콘 변경 후 **앱 제거 후 재설치** (`chrome://apps`)  

---

## DevTools 경고 대응 (2026-05-19)

| 경고 | 조치 |
|------|------|
| icon-512 실제 크기 불일치 | `icon-512.png` → **512×512** PNG로 재생성 |
| icon-192.svg 로드 실패 | **`icon-192.png`** 로 교체 |
| wide 스크린샷 없음 | `screenshots/desktop-wide.png` (1280×720) |
| mobile 스크린샷 없음 | `screenshots/mobile-narrow.png` (390×844) |

재생성: `npm run fix:pwa` 후 `npx vercel deploy --prod`

---

## 체크리스트

- [ ] `https://stock-tracker-opal-six.vercel.app` 접속 (https)  
- [ ] Application → Manifest 에 오류 없음  
- [ ] Application → Service Workers → `sw.js` 활성  
- [ ] 메뉴 또는 DevTools로 설치 시도  
- [ ] `chrome://apps` 에 앱 표시
