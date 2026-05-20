# Design System — Minimal + Glass Hybrid (2025~2026)

**최종 갱신:** 2026-05-20 (DS-0~DS-9 구현 완료)  
**작업 ID:** DS-0 ~ DS-10 ([TASKS.md](./TASKS.md))  
**구현 파일:** `frontend/style.css`, `frontend/index.html`, `frontend/app.js` (클래스만)

> 프로젝트는 **Vanilla CSS + CSS 변수**로 구현. 아래 Tailwind 표기는 **디자인 토큰 참고용**이며, 실제 코드는 `:root` 변수로 매핑한다.

---

## 1. 디자인 목표

| 목표 | 설명 |
|------|------|
| 톤 | 미니멀·고급·미래지향 SaaS/핀테크 |
| Glass | **핵심 카드·모달·floating panel만** — 과하지 않게 |
| 가독성 | 반투명·blur 낮게, 텍스트 우선 |
| 참고 | Apple · Linear · Stripe · Notion · 최신 핀테크 대시보드 |
| 완성도 | Dribbble 컨셉이 아닌 **운영 SaaS 수준** |

### 피할 것

과도한 네온 · 사이버펑크 · 강한 blur · 전 요소 glass · 과한 gradient · 장식 과다

---

## 2. 정보 구조(IA) 개선 방향

| 영역 | 현재 | 개선 |
|------|------|------|
| 헤더 | 로고·장상태·WS·테마·알림 혼재 | **1행:** 브랜드 + 장 뱃지 · **2행(모바일):** 액션 그룹 |
| 툴바 | 검색·정렬·필터·공유 밀집 | **Primary:** 검색+추가 · **Secondary:** 정렬·필터 · **Tertiary:** 공유·백업 |
| 관심목록 | 카드 그리드 동일 무게 | **가격·등락** 시각 1순위 · 종목명 2순위 · 심볼 3순위 |
| 모달 | 차트·통계·뉴스·포폴·알림 동일 섹션 | **Sticky 요약** (가격+P&L) → 차트 → 탭(뉴스/재무/설정) |
| 빈 상태 | 텍스트만 | 짧은 CTA + 일러스트 없이 **여백·타이포**만 |

**시선 흐름:** 상태(장) → 내 종목 핵심 수치 → 상세(모달)

---

## 3. 컬러 팔레트

### 3.1 Dark (기본·우선)

| 토큰 | CSS 변수 (제안) | Hex | Tailwind 유사 |
|------|-----------------|-----|---------------|
| Base BG | `--bg-base` | `#07090e` | `slate-950` |
| Surface | `--bg-surface` | `#0c1018` | custom |
| Glass fill | `--glass-bg` | `rgba(255,255,255,0.04)` | white/5 |
| Glass border | `--glass-border` | `rgba(255,255,255,0.08)` | white/10 |
| Text primary | `--text-primary` | `#f4f6fb` | `slate-50` |
| Text secondary | `--text-secondary` | `#8b95a8` | `slate-400` |
| Text muted | `--text-muted` | `#5c6678` | `slate-500` |
| Accent | `--accent` | `#4f7cff` | `blue-500` 조정 |
| Positive | `--green` | `#22c55e` | `green-500` |
| Negative | `--red` | `#ef4444` | `red-500` |

**배경 gradient (subtle):**

```css
--bg-gradient: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(79, 124, 255, 0.08), transparent 60%),
               linear-gradient(180deg, #07090e 0%, #0a0e16 100%);
```

### 3.2 Light

| 토큰 | Hex |
|------|-----|
| Base | `#f6f7f9` |
| Glass fill | `rgba(255,255,255,0.72)` |
| Glass border | `rgba(15,23,42,0.06)` |
| Text primary | `#0f1419` |

---

## 4. Glass 시스템 (제한적 적용)

**적용 대상:** `.stock-card`, `.modal-panel`, `.toolbar-floating`, `.toast` (선택)

**미적용:** 본문 배경, 일반 텍스트 블록, 리스트 전체, 버튼 다수

| 토큰 | 값 | Tailwind 참고 |
|------|-----|---------------|
| Blur | `12px` ~ `16px` | `backdrop-blur-md` (과하면 `xl` 금지) |
| Saturation | `1.2` (선택) | `backdrop-saturate-150` |
| Fill dark | `rgba(255,255,255,0.04)` | — |
| Fill light | `rgba(255,255,255,0.65)` | — |
| Border | `1px solid var(--glass-border)` | `ring-1 ring-white/10` |

```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-soft);
}
```

---

## 5. Radius · Shadow · Spacing

### Radius

| 토큰 | px | 용도 |
|------|-----|------|
| `--radius-sm` | 8 | chip, badge |
| `--radius-md` | 12 | input, button |
| `--radius-lg` | 16 | card |
| `--radius-xl` | 20 | modal |
| `--radius-2xl` | 24 | modal (large only) |

### Shadow (soft)

| 토큰 | 값 |
|------|-----|
| `--shadow-soft` | `0 1px 2px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.18)` |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.16)` |
| `--shadow-modal` | `0 24px 64px rgba(0,0,0,0.35)` |

### Spacing (4px base)

| 토큰 | px | Tailwind |
|------|-----|----------|
| `--space-1` | 4 | `1` |
| `--space-2` | 8 | `2` |
| `--space-3` | 12 | `3` |
| `--space-4` | 16 | `4` |
| `--space-5` | 20 | `5` |
| `--space-6` | 24 | `6` |
| `--space-8` | 32 | `8` |
| `--space-10` | 40 | `10` |
| `--space-12` | 48 | `12` |

**레이아웃:** 카드 gap `16~24px`, 섹션 margin `32~48px`, 모달 padding `24~32px`

---

## 6. Typography

| 역할 | 크기 | weight | tracking |
|------|------|--------|----------|
| Display (모달 가격) | 28~32px | 600 | -0.02em |
| H1 (페이지) | 20~22px | 600 | -0.01em |
| H2 (섹션) | 14~16px | 600 | 0 |
| Body | 14px | 400 | 0 |
| Caption / 심볼 | 12px | 400~500 | 0.02em (mono) |
| Price (카드) | 18~20px | 600 | tabular-nums |

**폰트:** `Inter` 유지 · 숫자/심볼 `JetBrains Mono` · `font-feature-settings: "tnum"`

---

## 7. Component Rules

### 7.1 Stock Card

- Glass + soft shadow
- Padding `20px`
- 종목명 → 가격·등락 → 심볼 (이미 UI-1)
- Hover: border 밝기만 소폭 상승 (scale·네온 X)

### 7.2 Header

- `backdrop-blur` + 저불투명 (`--header-bg`)
- 고정 높이·내부 `space-4` 이상

### 7.3 Modal

- Overlay: `rgba(0,0,0,0.55)` (blur 선택 4px 이하)
- Panel: `.glass-panel` + `radius-xl`
- 상단 **sticky** 가격 블록

### 7.4 Button

| 타입 | 스타일 |
|------|--------|
| Primary | flat accent fill, radius-md, no glow |
| Secondary | glass border, transparent fill |
| Ghost | text only, hover surface |

### 7.5 Input / Search

- flat + 얇은 border
- focus: accent ring `2px` `rgba(79,124,255,0.35)` — 네온 X

### 7.6 Badge (장 상태)

- pill, `radius-full`, 작은 padding, muted glass

---

## 8. 반응형

| breakpoint | px | 변경 |
|------------|-----|------|
| mobile | &lt; 640 | 1열 카드, 툴바 wrap, 모달 full-bleed |
| tablet | 640~1024 | 2열 카드 |
| desktop | ≥ 1024 | 3~4열, max-width container `1280px` |

**모바일 모달:** 하단 sheet 스타일 검토 (DS-8)

---

## 9. Tailwind 매핑표 (참고 — 도입 시)

```html
<!-- Card 예시 (참고만) -->
<div class="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-md">
```

| 컴포넌트 | Tailwind 조합 |
|----------|----------------|
| Glass card | `rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg` |
| Primary btn | `rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500` |
| Muted text | `text-sm text-slate-400` |

**현재 프로젝트:** Tailwind 미사용 → §3~§7 CSS 변수로 `style.css` 일괄 교체.

---

## 10. 구현 작업 (DS-*)

| ID | 작업 | 상태 |
|----|------|------|
| DS-0 | 디자인 토큰 `:root` 정리 (컬러·glass·shadow·space) | ✅ 2026-05-20 |
| DS-1 | 배경 subtle gradient + grid/glow 축소 | ✅ 2026-05-20 |
| DS-2 | Glass 카드·모달·헤더 적용 (선택적 요소만) | ✅ 2026-05-20 |
| DS-3 | Typography hierarchy (카드·모달·툴바) | ✅ 2026-05-20 |
| DS-4 | Button·Input flat + soft glass | ✅ 2026-05-20 |
| DS-5 | IA: 툴바·헤더·모달 섹션 재배치 (`index.html`) | ✅ 2026-05-20 |
| DS-6 | 시각 우선순위 (가격·등락 강조, muted 심볼) | ✅ 2026-05-20 |
| DS-7 | Light 테마 glass 톤 맞춤 | ✅ 2026-05-20 |
| DS-8 | 모바일 반응형·모달 UX | ✅ 2026-05-20 |
| DS-9 | `prefers-reduced-motion` · blur 폴백 | ✅ 2026-05-20 |
| DS-10 | QA 체크리스트·스크린샷 (PWA manifest용) | ⬜ `npm run fix:pwa` 필요 |

---

## 11. 완료 기준

- [x] 다크 모드 기준 Linear/Stripe급 **정돈감**
- [x] Glass가 카드·모달에만 보임
- [x] 가독성 WCAG 대비 (본문 4.5:1 목표)
- [x] 라이트 모드 깨짐 없음
- [ ] 390px 모바일 QA (기기 확인 필요)
- [x] 기존 기능(차트·WS·PWA) 회귀 없음

---

## 12. Before → After diff

| 항목 | Before | After (구현 완료) |
|------|--------|-----------------|
| 카드 | solid `#111827` + blue-purple gradient | `rgba(255,255,255,0.04)` glass + `backdrop-filter: blur(14px)` |
| 배경 | 60px 그리드 + 애니메이션 orb ×2 | body `radial-gradient` 1개 (subtle) |
| blur | 헤더만 `blur(20px)` | 카드 14px · 모달 24px · 헤더 20px |
| 버튼 | `linear-gradient(135deg, #3b82f6, #6366f1)` + glow shadow | flat `#4f7cff` + hover brighten |
| 카드 hover | `translateY(-2px)` + 상단 네온 라인 | border brightness 변화만 |
| 색상 | green `#10d9a0` (teal), red `#f43f5e` | green `#22c55e`, red `#ef4444` |
| 폴백 | 없음 | `@supports not (backdrop-filter)` solid bg 폴백 |
| 접근성 | 없음 | `prefers-reduced-motion` 처리 |

---

*DS-10(PWA 스크린샷 갱신): `npm run fix:pwa` 실행 후 Vercel 배포 시 반영.*
