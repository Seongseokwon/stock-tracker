/**
 * 1회용 로그인 코드 생성기
 *
 * 사용법:
 *   node backend/gen-code.js                   # 30일 유효, 메모 없음
 *   node backend/gen-code.js --days 7          # 7일 유효
 *   node backend/gen-code.js --note "데모용"   # 메모 추가
 *   npm run db:gen-code                        # 위와 동일
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
  let days = 30;
  let note = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) { days = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--note' && args[i + 1]) { note = args[i + 1]; i++; }
    else if (!args[i].startsWith('--')) { days = parseInt(args[i]) || 30; }
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL이 설정되지 않았습니다. backend/.env 를 확인하세요.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 랜덤 코드 생성 — SP-XXXX-XXXX 형식 (대문자 HEX 8자리)
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const code = `SP-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
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
    console.log(`  코드:     ${code}`);
    console.log(`  유효기간: ${days}일 (${expStr} 까지)`);
    if (note) console.log(`  메모:     ${note}`);
    console.log('\n⚠  이 코드는 1회만 사용 가능합니다.\n');
  } catch (err) {
    console.error('❌ 코드 생성 실패:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
