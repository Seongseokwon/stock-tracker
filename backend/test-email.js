/**
 * 이메일 발송 테스트 스크립트
 *
 * 사용법:
 *   node backend/test-email.js                          # .env 의 GMAIL_USER 로 발송
 *   node backend/test-email.js --to other@example.com  # 수신 주소 지정
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

const args = process.argv.slice(2);
let toEmail = GMAIL_USER;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to' && args[i + 1]) { toEmail = args[i + 1]; i++; }
}

async function main() {
  console.log('\n📧 StockPulse 이메일 테스트\n');

  if (!GMAIL_USER) {
    console.error('❌ GMAIL_USER 환경변수가 설정되지 않았습니다.');
    console.error('   backend/.env 에 GMAIL_USER=your@gmail.com 을 추가하세요.');
    process.exit(1);
  }
  if (!GMAIL_APP_PASSWORD) {
    console.error('❌ GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    console.error('   Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호에서 16자리 발급.');
    console.error('   backend/.env 에 GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx 를 추가하세요.');
    process.exit(1);
  }
  if (!toEmail) {
    console.error('❌ 수신 이메일 주소가 없습니다. --to 옵션으로 지정하세요.');
    process.exit(1);
  }

  console.log(`  발신: ${GMAIL_USER}`);
  console.log(`  수신: ${toEmail}`);
  console.log('  연결 테스트 중...');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log('  ✅ SMTP 연결 성공\n');
  } catch (e) {
    console.error(`  ❌ SMTP 연결 실패: ${e.message}`);
    if (e.message.includes('Username and Password not accepted')) {
      console.error('\n  힌트: Gmail 앱 비밀번호가 틀렸습니다.');
      console.error('  Google 계정 → 보안 → 2단계 인증 활성화 → 앱 비밀번호 재발급');
    }
    process.exit(1);
  }

  const testCode = 'SP-TEST-1234';
  console.log('  테스트 이메일 발송 중...');

  try {
    const info = await transporter.sendMail({
      from: `"StockPulse" <${GMAIL_USER}>`,
      to: toEmail,
      subject: '[StockPulse] 이메일 테스트',
      text:
        `이메일 발송 테스트입니다.\n\n` +
        `테스트 코드: ${testCode}\n\n` +
        `이 메일은 로컬 테스트용입니다.`,
      html:
        `<p>이메일 발송 테스트입니다.</p>` +
        `<p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${testCode}</p>` +
        `<p>이 메일은 로컬 테스트용입니다.</p>`,
    });

    console.log(`  ✅ 발송 성공!`);
    console.log(`  Message-ID: ${info.messageId}`);
    console.log(`\n  ${toEmail} 받은편지함을 확인하세요.\n`);
  } catch (e) {
    console.error(`  ❌ 발송 실패: ${e.message}`);
    process.exit(1);
  }
}

main();
