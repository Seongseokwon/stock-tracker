/**
 * PostgreSQL 커넥션 풀
 * DATABASE_URL 환경변수가 없으면 null 반환 → 기존 환경변수 인증 방식 유지
 */
const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Vercel/Railway 같은 서버리스 환경에서 연결 수 제한
    max: process.env.VERCEL ? 1 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[DB] 예기치 않은 커넥션 오류:', err.message);
  });
}

/**
 * 쿼리 실행 헬퍼
 * DB가 없으면 null 반환 (하위 호환)
 */
async function query(text, params) {
  if (!pool) return null;
  return pool.query(text, params);
}

module.exports = { pool, query };
