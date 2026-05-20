# 압축·백업 가이드

**최종 갱신:** 2026-05-19

압축 전 `npm run clean`으로 아래 항목을 제거하면 용량이 **약 200MB → 수 MB** 수준으로 줄어듭니다.

## 압축에서 제외할 항목 (삭제·무시)

| 경로 | 용량(대략) | 이유 |
|------|------------|------|
| `node_modules/` | ~196MB | `npm run install:all`로 복구 |
| `backend/node_modules/` | ~4MB | 위와 동일 |
| `.vercel/` | 수 KB | `npx vercel link` / 배포 시 재생성 |

### 압축 도구에서 제외 권장 (삭제하지 않음)

| 경로 | 이유 |
|------|------|
| `backend/.env` | API 키 — **공유용 zip에는 넣지 말 것** (`.env.example`만 포함) |
| `.cursor/` | 에디터 로컬 설정 (프로젝트 루트에 있을 때) |

## 압축 전 정리

```bash
npm run clean
```

## 압축 해제 후 복구

```bash
npm run install:all
cp backend/.env.example backend/.env
# backend/.env 에 FINNHUB_API_KEY 입력
npm start
```

Vercel 재배포: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)

## Windows 탐색기로 zip 할 때

1. `npm run clean` 실행 후
2. `stock-tracker` 폴더 우클릭 → **압축**
3. 다른 PC에 넘길 때는 `backend/.env`가 들어갔는지 확인 — **키 공유 금지**
