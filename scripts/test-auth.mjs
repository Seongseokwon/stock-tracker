/**
 * 인증 시스템 통합 테스트
 *
 * Case 1: SP-USER-0001 사전 등록 → 로그인 → 세션 확인 → 재사용 차단
 * Case 2: 관리자 API로 SP-USER-0002 생성 → 반환된 코드로 로그인 → 세션 확인
 *
 * 사용법:
 *   npm run test:auth
 *   node scripts/test-auth.mjs
 *   BASE_URL=http://localhost:3000 ADMIN_SECRET=xxx node scripts/test-auth.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env에서 환경변수 로드 (실행 환경에 없을 경우)
try {
  const envPath = join(__dirname, '..', 'backend', '.env');
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#') && val.length && !process.env[key.trim()]) {
      process.env[key.trim()] = val.join('=').trim();
    }
  }
} catch { /* .env 없으면 기존 환경변수 사용 */ }

const BASE_URL    = process.env.BASE_URL    || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'local-admin-secret';

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

async function post(path, body, cookie = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') || '' };
}

async function get(path, cookie = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function extractCookie(setCookieHeader) {
  // "sp_sess=xxx; HttpOnly; ..." → "sp_sess=xxx"
  return setCookieHeader.split(';')[0].trim();
}

// ─── Case 1 ─────────────────────────────────────────────────────────────────
console.log('\n━━━ Case 1: SP-USER-0001 사전 등록 후 로그인 ━━━\n');

async function case1() {
  // 1-1. 관리자 API로 SP-USER-0001 등록
  const reg = await post('/api/admin/codes', {
    adminSecret: ADMIN_SECRET,
    code: 'SP-USER-0001',
    days: 1,
    note: 'test-case-1',
  });

  if (reg.status === 200 && reg.data.ok && reg.data.code === 'SP-USER-0001') {
    ok(`SP-USER-0001 등록 완료 (expiresAt: ${reg.data.expiresAt})`);
  } else if (reg.status === 409) {
    ok('SP-USER-0001 이미 등록됨 (재사용 테스트 계속)');
  } else {
    fail('SP-USER-0001 등록 실패', `HTTP ${reg.status} ${JSON.stringify(reg.data)}`);
    return;
  }

  // 1-2. SP-USER-0001로 로그인
  const login = await post('/api/auth/login', { code: 'SP-USER-0001' });
  if (login.status === 200 && login.data.ok && login.setCookie.includes('sp_sess')) {
    ok('SP-USER-0001 로그인 성공 (sp_sess 쿠키 발급)');
  } else {
    fail('SP-USER-0001 로그인 실패', `HTTP ${login.status} ${JSON.stringify(login.data)}`);
    return;
  }

  const cookie = extractCookie(login.setCookie);

  // 1-3. /api/auth/me → loggedIn: true
  const me = await get('/api/auth/me', cookie);
  if (me.status === 200 && me.data.loggedIn === true && me.data.uid) {
    ok(`세션 확인 (loggedIn: true, uid: ${me.data.uid})`);
  } else {
    fail('세션 확인 실패', `HTTP ${me.status} ${JSON.stringify(me.data)}`);
  }

  // 1-4. SP-USER-0001 재사용 → 401 (1회용)
  const reuse = await post('/api/auth/login', { code: 'SP-USER-0001' });
  if (reuse.status === 401 && reuse.data.error === 'invalid_code') {
    ok('SP-USER-0001 재사용 차단 (1회용 확인)');
  } else {
    fail('재사용 차단 실패 — 1회용 코드가 재사용됨', `HTTP ${reuse.status} ${JSON.stringify(reuse.data)}`);
  }

  // 1-5. 로그아웃 후 세션 무효화 확인
  const logout = await post('/api/auth/logout', {}, cookie);
  const meAfter = await get('/api/auth/me', cookie);
  if (logout.status === 200 && meAfter.status === 401) {
    ok('로그아웃 후 세션 무효화 확인');
  } else {
    fail('로그아웃 후 세션 무효화 실패', `logout: ${logout.status}, me: ${meAfter.status}`);
  }
}

// ─── Case 2 ─────────────────────────────────────────────────────────────────
console.log('');
async function case2() {
  console.log('━━━ Case 2: 관리자 API로 SP-USER-0002 생성 + 로그인 ━━━\n');

  // 2-1. 관리자 API 호출 → SP-USER-0002 생성, code 반환
  const gen = await post('/api/admin/codes', {
    adminSecret: ADMIN_SECRET,
    code: 'SP-USER-0002',
    days: 7,
    note: 'test-case-2',
  });

  if (gen.status === 200 && gen.data.ok) {
    ok(`코드 생성 성공: ${gen.data.code} (expiresAt: ${gen.data.expiresAt})`);
  } else if (gen.status === 409) {
    ok('SP-USER-0002 이미 등록됨 (앞선 테스트 잔여 — 계속 진행)');
  } else {
    fail('코드 생성 실패', `HTTP ${gen.status} ${JSON.stringify(gen.data)}`);
    return;
  }

  // 2-2. 잘못된 admin secret → 401
  const badAuth = await post('/api/admin/codes', {
    adminSecret: 'wrong-secret',
    code: 'SP-SHOULD-NOT-EXIST',
  });
  if (badAuth.status === 401) {
    ok('잘못된 관리자 시크릿 차단 (401)');
  } else {
    fail('관리자 인증 실패 시 401 미반환', `HTTP ${badAuth.status}`);
  }

  // 2-3. 반환된 코드(SP-USER-0002)로 로그인
  const login = await post('/api/auth/login', { code: 'SP-USER-0002' });
  if (login.status === 200 && login.data.ok && login.setCookie.includes('sp_sess')) {
    ok('SP-USER-0002 로그인 성공 (sp_sess 쿠키 발급)');
  } else {
    fail('SP-USER-0002 로그인 실패', `HTTP ${login.status} ${JSON.stringify(login.data)}`);
    return;
  }

  const cookie = extractCookie(login.setCookie);

  // 2-4. /api/auth/me → loggedIn: true, src: 'db'
  const me = await get('/api/auth/me', cookie);
  if (me.status === 200 && me.data.loggedIn === true && me.data.uid) {
    ok(`세션 확인 (loggedIn: true, uid: ${me.data.uid})`);
  } else {
    fail('세션 확인 실패', `HTTP ${me.status} ${JSON.stringify(me.data)}`);
  }

  // 2-5. SP-USER-0002 재사용 → 401
  const reuse = await post('/api/auth/login', { code: 'SP-USER-0002' });
  if (reuse.status === 401) {
    ok('SP-USER-0002 재사용 차단 (1회용 확인)');
  } else {
    fail('재사용 차단 실패', `HTTP ${reuse.status}`);
  }
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔗 서버: ${BASE_URL}\n`);

  // 서버 헬스체크
  try {
    const health = await get('/api/health');
    if (health.status !== 200) throw new Error(`HTTP ${health.status}`);
    console.log(`서버 연결 OK (finnhubConfigured: ${health.data.finnhubConfigured})\n`);
  } catch (e) {
    console.error(`❌ 서버에 연결할 수 없습니다: ${e.message}`);
    console.error(`   npm start 로 서버를 먼저 실행하세요.\n`);
    process.exit(1);
  }

  await case1();
  await case2();

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`결과: ${passed + failed}개 중 ✅ ${passed} 통과 / ❌ ${failed} 실패`);
  console.log(`${'─'.repeat(44)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
