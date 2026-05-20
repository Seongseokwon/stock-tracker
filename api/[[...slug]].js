/**
 * Vercel serverless — /api 및 /api/* 전체를 Express로 처리
 * (api/index.js 는 /api 만 매칭되어 /api/health 등이 404 됨)
 */
module.exports = require('../backend/server');
