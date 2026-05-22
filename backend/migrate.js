/**
 * DB 마이그레이션 실행
 * 사용: node backend/migrate.js
 * 또는: npm run db:migrate
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
    console.error('   backend/.env 에 DATABASE_URL 을 추가하세요.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // migrations/ 디렉터리의 *.sql 파일을 이름순(숫자 순서)으로 자동 로드
  const migrations = fs
    .readdirSync(path.join(__dirname, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  try {
    for (const file of migrations) {
      const filePath = path.join(__dirname, 'migrations', file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`▶ 실행 중: ${file}`);
      await pool.query(sql);
      console.log(`✅ 완료: ${file}`);
    }
    console.log('\n🎉 마이그레이션 완료');
  } catch (err) {
    console.error('\n❌ 마이그레이션 실패:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
