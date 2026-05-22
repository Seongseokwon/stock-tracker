/**
 * 코드 요청 → 관리자 승인 → 이메일 발송 통합 테스트
 *
 * 사용법 (서버가 실행 중이어야 함):
 *   node backend/test-email-flow.js                        # email + instant 모두 테스트
 *   node backend/test-email-flow.js --delivery email       # 이메일 수신만
 *   node backend/test-email-flow.js --delivery instant     # 즉시 수신만
 *   node backend/test-email-flow.js --to other@example.com # 수신 이메일 변경
 *   node backend/test-email-flow.js --base http://localhost:3001
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i >= 0 ? process.argv[i + 1] : 'http://localhost:3000';
})();
const TO_EMAIL = (() => {
  const i = process.argv.indexOf('--to');
  return i >= 0 ? process.argv[i + 1] : 'pam9411@naver.com';
})();
const ONLY_DELIVERY = (() => {
  const i = process.argv.indexOf('--delivery');
  return i >= 0 ? process.argv[i + 1] : null; // null = 둘 다 테스트
})();
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'local-admin-secret';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function label(ok) { return ok ? '✅' : '❌'; }

async function testDelivery(delivery) {
  const tag = delivery === 'email' ? '📧 이메일 수신' : '⚡ 즉시 수신';
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${tag} 테스트`);
  console.log(`${'─'.repeat(50)}`);

  // 1. 코드 요청 접수
  console.log(`\n[1] POST /api/access-requests`);
  console.log(`    email: ${TO_EMAIL}, delivery: ${delivery}`);
  const req = await post('/api/access-requests', { email: TO_EMAIL, delivery });
  console.log(`    응답: ${JSON.stringify(req)}`);
  if (!req.ok) {
    console.error(`    ${label(false)} 요청 실패 (status ${req.status})`);
    return false;
  }
  console.log(`    ${label(true)} 요청 접수 완료`);
  if (delivery === 'instant' && req.token) {
    console.log(`    token: ${req.token}`);
  }

  const requestToken = req.token || null;

  // 2. 관리자 승인 (코드 생성 + 이메일 발송)
  console.log(`\n[2] POST /api/admin/approve-request`);
  const testCode = `SP-TEST-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const approveBody = { requestToken: null, adminSecret: ADMIN_SECRET, code: testCode };

  // requestToken이 없으면 DB에서 pending 항목 직접 조회가 필요하지만,
  // instant의 경우 token을 반환받으므로 그걸 사용
  if (delivery === 'instant' && requestToken) {
    approveBody.requestToken = requestToken;
  } else if (delivery === 'email') {
    // email delivery는 token을 응답에 포함하지 않으므로 DB에서 직접 조회
    // → 서버 측 helper endpoint 없이는 불가 → 대신 admin/codes 직접 사용해 이메일 발송 테스트
    console.log('    [참고] email delivery는 token을 응답하지 않습니다.');
    console.log('           Slack 알림의 curl 명령 또는 아래 방식으로 토큰을 획득해야 합니다.');
    console.log('           → 이 테스트는 즉시 수신(instant)으로 token을 받아 진행합니다.\n');
    // email delivery 테스트를 위해 instant로 token 받아 approve 후 email 여부 확인
    const reqInstant = await post('/api/access-requests', { email: TO_EMAIL, delivery: 'instant' });
    if (!reqInstant.ok || !reqInstant.token) {
      console.error(`    ${label(false)} instant fallback 실패`);
      return false;
    }
    approveBody.requestToken = reqInstant.token;
    // delivery를 email로 강제하기 위해 DB 직접 접근은 불가 → approve 결과의 emailSent로 판단
  }

  console.log(`    requestToken: ${approveBody.requestToken}`);
  console.log(`    testCode: ${testCode}`);
  const approve = await post('/api/admin/approve-request', approveBody);
  console.log(`    응답: ${JSON.stringify(approve)}`);

  if (!approve.ok) {
    console.error(`    ${label(false)} 승인 실패 (status ${approve.status})`);
    return false;
  }
  console.log(`    ${label(true)} 승인 완료, 코드: ${approve.code}`);

  const emailSent = approve.emailSent === true;
  const emailError = approve.emailError || null;

  console.log(`\n[3] 이메일 발송 결과`);
  console.log(`    emailSent: ${emailSent} ${label(emailSent)}`);
  if (emailError) {
    console.error(`    emailError: ${emailError}`);
  }
  if (emailSent) {
    console.log(`    수신함 확인: ${TO_EMAIL}`);
  }

  // 4. instant delivery면 폴링도 확인
  if (delivery === 'instant' && approveBody.requestToken) {
    console.log(`\n[4] GET /api/access-requests/:token/status (폴링 확인)`);
    const status = await get(`/api/access-requests/${approveBody.requestToken}/status`);
    console.log(`    응답: ${JSON.stringify(status)}`);
    const codeDelivered = status.status === 'approved' && status.code;
    console.log(`    코드 전달 ${label(codeDelivered)}: ${status.code || '(없음)'}`);
  }

  return emailSent;
}

async function main() {
  console.log('\n🧪 StockPulse 이메일 플로우 통합 테스트');
  console.log(`   서버: ${BASE}`);
  console.log(`   수신 이메일: ${TO_EMAIL}`);
  console.log(`   ADMIN_SECRET: ${ADMIN_SECRET}`);

  // 서버 헬스 체크
  try {
    const health = await get('/api/health');
    console.log(`\n서버 헬스: ${JSON.stringify(health)} ${label(health.ok)}`);
  } catch (e) {
    console.error(`\n❌ 서버에 연결할 수 없습니다: ${e.message}`);
    console.error(`   npm start 로 서버를 먼저 실행하세요.`);
    process.exit(1);
  }

  const results = {};

  if (!ONLY_DELIVERY || ONLY_DELIVERY === 'email') {
    results.email = await testDelivery('email');
  }
  if (!ONLY_DELIVERY || ONLY_DELIVERY === 'instant') {
    results.instant = await testDelivery('instant');
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log('테스트 결과 요약');
  console.log(`${'═'.repeat(50)}`);
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.padEnd(10)} 이메일 발송: ${label(v)} ${v ? '성공' : '실패'}`);
  }
  console.log(`\n수신함 확인: ${TO_EMAIL}\n`);

  const allOk = Object.values(results).every(Boolean);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('예외:', e.message);
  process.exit(1);
});
