/**
 * 1회용 로그인 코드 생성기
 *
 * 사용법:
 *   node backend/gen-code.js                          # 랜덤 코드, 365일 유효
 *   node backend/gen-code.js --code SP-USER-0001      # 코드 직접 지정
 *   node backend/gen-code.js --days 7                 # 7일 유효
 *   node backend/gen-code.js --note "데모용"          # 메모 추가
 *   npm run db:gen-code -- --code SP-USER-0001        # npm 스크립트로 호출
 *
 * 출력 예:
 *   코드:     SP-A1B2-C3D4
 *   유효기간: 30일 (2026-06-20 까지)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const { Pool } = require('pg');

async function main() {
  const args = process.argv.slice(2);
  let days = 365;
  let note = null;
  let customCode = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) { days = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--note' && args[i + 1]) { note = args[i + 1]; i++; }
    else if (args[i] === '--code' && args[i + 1]) { customCode = args[i + 1].toUpperCase().trim(); i++; }
    else if (!args[i].startsWith('--')) { days = parseInt(args[i]) || 30; }
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL이 설정되지 않았습니다. backend/.env 를 확인하세요.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 코드 결정: --code 지정 시 사용, 아니면 랜덤 생성 (SP-XXXX-XXXX)
  const code = customCode || (() => {
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `SP-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
  })();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  try {
    await pool.query(
      `INSERT INTO login_codes (code_hash, note, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)`,
      [codeHash, note, String(days)]
    );

    const expDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const expStr = expDate.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

    console.log('\n✅ 로그인 코드 생성 완료\n');
    console.log(`  코드:     ${code}${customCode ? '' : ' (랜덤 생성)'}`);
    console.log(`  유효기간: ${days}일 (${expStr} 까지)`);
    if (note) console.log(`  메모:     ${note}`);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`❌ 이미 등록된 코드입니다: ${code}`);
    } else {
      console.error('❌ 코드 생성 실패:', err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
