/**
 * StockPulse — API 프록시 서버
 * Finnhub API 키 보호, Yahoo Finance CORS 우회, WebSocket 프록시
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');

if (!process.env.VERCEL) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const ADMIN_SECRET   = process.env.ADMIN_SECRET || '';
const SLACK_WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL  || '';
const GMAIL_USER         = process.env.GMAIL_USER         || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const BACKEND_URL = process.env.BACKEND_URL || 'https://stock-tracker-production-7e54.up.railway.app';
// 쉼표로 구분된 여러 코드 지원: "SP-DEMO-0000,SP-USER-0001"
const AUTH_CODES = (process.env.AUTH_CODE || '')
  .split(',')
  .map((c) => c.toUpperCase().trim())
  .filter(Boolean);
const FINNHUB_REST = 'https://finnhub.io/api/v1';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const FX_API = 'https://api.frankfurter.app/latest';

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const { hasHangul, searchKrLocal, mergeSearchResults } = require('./kr-search');
const db = require('./db');

const app = express();
const isVercel = Boolean(process.env.VERCEL);

// CORS — Railway 배포 시 Vercel 프론트 cross-origin 허용
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'https://stock-tracker-opal-six.vercel.app,http://localhost:3000'
).split(',').filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

if (!isVercel) {
  // 대시보드(/) 서버 사이드 인증 가드 — 쿠키 없으면 login.html 리다이렉트
  app.get('/', (req, res, next) => {
    const cookies = parseCookies(req);
    const payload = verifySessionToken(cookies.sp_sess);
    if (!payload) return res.redirect('/login.html');
    next(); // 인증 OK → express.static 이 index.html 서빙
  });
  app.use(express.static(FRONTEND_DIR));
}
app.use(express.json());

function isKoreanSymbol(symbol) {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ');
}

async function fetchJson(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 && i < retries) {
        await sleep(1500 * (i + 1));
        continue;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sendProxyError(res, e, fallbackMessage) {
  const status = e?.status || 502;
  if (status === 429) {
    return res.status(429).json({
      error: 'rate_limit',
      message: 'Finnhub API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
      retryAfterSec: 60,
    });
  }
  return res.status(status).json({ error: fallbackMessage || 'Request failed' });
}

function parseYahooMeta(json) {
  return json?.chart?.result?.[0]?.meta ?? null;
}

function parseYahooQuote(json) {
  const meta = parseYahooMeta(json);
  if (!meta?.regularMarketPrice) return null;
  const c = meta.regularMarketPrice;
  const pc = meta.chartPreviousClose ?? meta.previousClose ?? c;
  const o = meta.regularMarketOpen ?? c;
  const h = meta.regularMarketDayHigh ?? c;
  const l = meta.regularMarketDayLow ?? c;
  const v = meta.regularMarketVolume ?? 0;
  const d = c - pc;
  const dp = pc > 0 ? (d / pc) * 100 : 0;
  const marketCap = meta.marketCap ?? null;
  const name = meta.shortName || meta.longName || null;
  const trailingPE = meta.trailingPE ?? null;
  return { c, pc, d, dp, o, h, l, v, marketCap, name, trailingPE };
}

function parseYahooProfile(meta) {
  if (!meta) return null;
  return {
    name: meta.shortName || meta.longName || null,
    marketCap: meta.marketCap ?? null,
    trailingPE: meta.trailingPE ?? null,
    currency: meta.currency || null,
  };
}

async function fetchYahooSummaryMarketCap(symbol) {
  try {
    const url = `${YAHOO_SUMMARY}/${encodeURIComponent(symbol)}?modules=summaryDetail,price`;
    const json = await fetchJson(url);
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;
    return result.summaryDetail?.marketCap?.raw ?? result.price?.marketCap?.raw ?? null;
  } catch {
    return null;
  }
}

function parseYahooCloses(json) {
  return parseYahooOhlc(json).closes;
}

function parseYahooOhlc(json) {
  const result = json?.chart?.result?.[0];
  if (!result) return { closes: [], ohlc: [] };
  const q = result.indicators?.quote?.[0];
  if (!q) return { closes: [], ohlc: [] };

  const ohlc = [];
  const len = (q.close || []).length;
  for (let i = 0; i < len; i++) {
    const c = q.close[i];
    if (c == null || Number.isNaN(c)) continue;
    ohlc.push({
      o: q.open[i] ?? c,
      h: q.high[i] ?? c,
      l: q.low[i] ?? c,
      c,
    });
  }
  return { closes: ohlc.map((b) => b.c), ohlc };
}

/* --- Auth utilities --- */
// src: 'db' = DB 1회용 코드로 로그인, 'env' = 환경변수 코드로 로그인 (하위호환)
function createSessionToken(uid, src = 'env') {
  const payload = Buffer.from(JSON.stringify({
    uid: uid || crypto.randomUUID(),
    src,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k.trim(), v.join('=').trim()])
  );
}

/* --- 알림 유틸 --- */
// Slack Incoming Webhook 알림
async function sendSlackNotification(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('[slack]', e.message);
  }
}

// Gmail SMTP 메일러 (lazy init — 환경변수 없으면 null)
function getMailer() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

/* --- Auth routes --- */
// HTTPS(Vercel/프로덕션)에서 Secure 플래그 필수
const COOKIE_SECURE = isVercel ? '; Secure' : '';
const COOKIE_BASE = `HttpOnly; SameSite=Lax; Path=/${COOKIE_SECURE}`;

app.post('/api/auth/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const code = (req.body?.code || '').toUpperCase().trim();
  if (!code) return res.status(401).json({ error: 'invalid_code' });

  let userId = null;
  let src = 'env';

  if (db.pool) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    try {
      // DB에 코드가 존재하는지 먼저 확인 (used_at·expires_at 무관)
      const found = await db.query(
        `SELECT id, user_id, used_at, expires_at FROM login_codes
         WHERE code_hash = $1 LIMIT 1`,
        [codeHash]
      );

      if (found && found.rows.length > 0) {
        // DB에 등록된 코드 → env var fallback 없이 DB 결과만 사용
        const row = found.rows[0];
        if (new Date(row.expires_at) <= new Date()) {
          // 만료된 코드
          return res.status(401).json({ error: 'invalid_code' });
        }
        // 유효한 코드 → 사용자 생성 또는 재사용
        userId = row.user_id;
        if (!userId) {
          // 첫 사용: 사용자 생성 후 코드에 연결
          const uRes = await db.query(
            `INSERT INTO users (last_login_at) VALUES (NOW()) RETURNING id`
          );
          userId = uRes.rows[0].id;
          await db.query(
            'UPDATE login_codes SET used_at = NOW(), user_id = $1 WHERE id = $2',
            [userId, row.id]
          );
        } else {
          // 재사용: 마지막 로그인 시간만 갱신
          await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
        }
        src = 'db';
      } else {
        // DB에 없는 코드 → 환경변수 fallback
        if (AUTH_CODES.length === 0 || !AUTH_CODES.includes(code)) {
          return res.status(401).json({ error: 'invalid_code' });
        }
      }
    } catch (err) {
      console.error('[auth/login] DB error:', err.message);
      // DB 오류 시 환경변수 fallback
      if (AUTH_CODES.length === 0 || !AUTH_CODES.includes(code)) {
        return res.status(401).json({ error: 'invalid_code' });
      }
    }
  } else {
    // DB 없음 → 환경변수 인증
    if (AUTH_CODES.length === 0 || !AUTH_CODES.includes(code)) {
      return res.status(401).json({ error: 'invalid_code' });
    }
  }

  const token = createSessionToken(userId, src);

  // DB 세션 저장 (DB 코드 로그인 시)
  if (src === 'db' && userId) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      await db.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [userId, tokenHash]
      );
    } catch (err) {
      console.error('[auth/login] session insert error:', err.message);
    }
  }

  res.setHeader('Set-Cookie', `sp_sess=${token}; ${COOKIE_BASE}; Max-Age=${7 * 24 * 3600}`);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cookies = parseCookies(req);
  const payload = verifySessionToken(cookies.sp_sess);
  if (!payload) return res.status(401).json({ loggedIn: false });

  // DB 세션 검증 (DB 코드로 로그인한 세션만)
  if (payload.src === 'db' && db.pool && cookies.sp_sess) {
    try {
      const tokenHash = crypto.createHash('sha256').update(cookies.sp_sess).digest('hex');
      const result = await db.query(
        'SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
        [tokenHash]
      );
      if (!result || result.rows.length === 0) {
        return res.status(401).json({ loggedIn: false });
      }
    } catch (err) {
      console.error('[auth/me] DB error:', err.message);
      // DB 오류 시 HMAC 검증만으로 통과
    }
  }

  res.json({ loggedIn: true, uid: payload.uid });
});

app.post('/api/auth/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // DB 세션 삭제 (DB 코드로 로그인한 세션만)
  if (db.pool) {
    const cookies = parseCookies(req);
    if (cookies.sp_sess) {
      const payload = verifySessionToken(cookies.sp_sess);
      if (payload?.src === 'db') {
        const tokenHash = crypto.createHash('sha256').update(cookies.sp_sess).digest('hex');
        try {
          await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
        } catch (err) {
          console.error('[auth/logout] DB error:', err.message);
        }
      }
    }
  }

  res.setHeader('Set-Cookie', `sp_sess=; ${COOKIE_BASE}; Max-Age=0`);
  res.json({ ok: true });
});

/* --- Auth 미들웨어 --- */
async function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const payload = verifySessionToken(cookies.sp_sess);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  if (payload.src === 'db' && db.pool && cookies.sp_sess) {
    try {
      const tokenHash = crypto.createHash('sha256').update(cookies.sp_sess).digest('hex');
      const result = await db.query(
        'SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
        [tokenHash]
      );
      if (!result || result.rows.length === 0) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    } catch (err) {
      console.error('[requireAuth] DB error:', err.message);
    }
  }

  req.userId = payload.uid || null;
  next();
}

/* --- Watchlist CRUD --- */
app.get('/api/watchlist', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!db.pool || !req.userId) return res.json({ symbols: [] });
  try {
    const result = await db.query(
      'SELECT symbol FROM watchlist_items WHERE user_id = $1 ORDER BY sort_order, added_at',
      [req.userId]
    );
    res.json({ symbols: result.rows.map(r => r.symbol) });
  } catch (err) {
    console.error('[watchlist GET]', err.message);
    res.json({ symbols: [] });
  }
});

app.post('/api/watchlist', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const symbol = (req.body?.symbol || '').toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: 'symbol_required' });
  if (!db.pool || !req.userId) return res.json({ ok: true });
  try {
    const cnt = await db.query(
      'SELECT COUNT(*) FROM watchlist_items WHERE user_id = $1', [req.userId]
    );
    if (parseInt(cnt.rows[0].count) >= 20) {
      return res.status(400).json({ error: 'max_20' });
    }
    const market = (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) ? 'KR' : 'US';
    await db.query(
      `INSERT INTO watchlist_items (user_id, symbol, market, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM watchlist_items WHERE user_id = $1))
       ON CONFLICT (user_id, symbol) DO NOTHING`,
      [req.userId, symbol, market]
    );
    res.json({ ok: true });
  } catch (err) {
    // FK 위반: user가 DB에 없는 세션 → 조용히 성공 반환 (localStorage fallback)
    if (err.code === '23503') return res.json({ ok: true });
    console.error('[watchlist POST]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/watchlist/:symbol', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const symbol = req.params.symbol.toUpperCase();
  if (!db.pool || !req.userId) return res.json({ ok: true });
  try {
    await db.query(
      'DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2',
      [req.userId, symbol]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[watchlist DELETE]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.put('/api/watchlist', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const symbols = req.body?.symbols;
  if (!Array.isArray(symbols)) return res.status(400).json({ error: 'symbols_required' });
  if (!db.pool || !req.userId) return res.json({ ok: true });
  try {
    await db.query('DELETE FROM watchlist_items WHERE user_id = $1', [req.userId]);
    for (let i = 0; i < Math.min(symbols.length, 20); i++) {
      const sym = symbols[i].toUpperCase().trim();
      if (!sym) continue;
      const market = (sym.endsWith('.KS') || sym.endsWith('.KQ')) ? 'KR' : 'US';
      await db.query(
        `INSERT INTO watchlist_items (user_id, symbol, market, sort_order) VALUES ($1, $2, $3, $4)`,
        [req.userId, sym, market, i]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') return res.json({ ok: true });
    console.error('[watchlist PUT]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

/* --- Admin: 로그인 코드 생성 --- */
app.post('/api/admin/codes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // 인증: x-admin-secret 헤더 또는 body.adminSecret
  const provided = req.headers['x-admin-secret'] || req.body?.adminSecret;
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!db.pool) {
    return res.status(503).json({ error: 'database_not_available' });
  }

  const { code: customCode, days = 365, note = null } = req.body || {};

  // 코드 결정: body.code 지정 시 사용, 아니면 랜덤 생성
  const isGenerated = !customCode;
  const code = customCode
    ? customCode.toUpperCase().trim()
    : `SP-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}`;

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  try {
    await db.query(
      `INSERT INTO login_codes (code_hash, note, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)`,
      [codeHash, note, String(days)]
    );
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    res.json({ ok: true, code, expiresAt, generated: isGenerated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'code_already_exists', code });
    }
    console.error('[admin/codes]', err.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* --- 코드 요청 시스템 --- */

// POST /api/access-requests — 사용자가 코드 요청 접수
app.post('/api/access-requests', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { email, delivery } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!['email', 'instant'].includes(delivery)) {
    return res.status(400).json({ error: 'invalid_delivery' });
  }
  if (!db.pool) {
    return res.status(503).json({ error: 'database_not_available' });
  }

  const requestToken = crypto.randomBytes(16).toString('hex');

  try {
    await db.query(
      `INSERT INTO access_requests (email, delivery, request_token)
       VALUES ($1, $2, $3)`,
      [email.trim().toLowerCase(), delivery, requestToken]
    );
  } catch (err) {
    console.error('[access-requests POST]', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }

  // Slack 알림 (비동기 — 실패해도 응답 영향 없음)
  const approveCmd =
    `curl -s -X POST ${BACKEND_URL}/api/admin/approve-request ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"requestToken":"${requestToken}","adminSecret":"${ADMIN_SECRET}"}'`;
  sendSlackNotification(
    `🔔 *새 로그인 코드 요청*\n` +
    `이메일: ${email}\n수신 방식: ${delivery === 'email' ? '📧 이메일' : '⚡ 즉시'}\n\n` +
    `승인 명령:\n\`\`\`\n${approveCmd}\n\`\`\``
  );

  res.json({ ok: true, token: delivery === 'instant' ? requestToken : null });
});

// GET /api/access-requests/:token/status — 즉시 수신 폴링
app.get('/api/access-requests/:token/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!db.pool) return res.status(503).json({ error: 'database_not_available' });

  try {
    const { rows } = await db.query(
      `SELECT status, plain_code, expires_at
       FROM access_requests WHERE request_token = $1 LIMIT 1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    const r = rows[0];

    // 만료 체크
    if (new Date(r.expires_at) < new Date()) {
      await db.query(
        `UPDATE access_requests SET status='expired' WHERE request_token=$1`,
        [req.params.token]
      ).catch(() => {});
      return res.json({ status: 'expired' });
    }

    // 승인됨 + 코드 대기 중 → 1회 전달 후 삭제
    if (r.status === 'approved' && r.plain_code) {
      await db.query(
        `UPDATE access_requests SET status='sent', plain_code=NULL WHERE request_token=$1`,
        [req.params.token]
      ).catch(() => {});
      return res.json({ status: 'approved', code: r.plain_code });
    }

    res.json({ status: r.status });
  } catch (err) {
    console.error('[access-requests status]', err.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/approve-request — 관리자가 요청 승인 (코드 생성 + 이메일 발송 또는 즉시 전달)
app.post('/api/admin/approve-request', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { requestToken, adminSecret, code: customCode } = req.body || {};

  const provided = req.headers['x-admin-secret'] || adminSecret;
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!db.pool) return res.status(503).json({ error: 'database_not_available' });

  try {
    const { rows } = await db.query(
      `SELECT id, email, delivery FROM access_requests
       WHERE request_token=$1 AND status='pending' AND expires_at > NOW() LIMIT 1`,
      [requestToken]
    );
    if (!rows.length) return res.status(404).json({ error: 'request_not_found' });

    const { id: reqId, email, delivery } = rows[0];

    // 코드 생성
    const plainCode = customCode
      ? customCode.toUpperCase().trim()
      : `SP-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}-` +
        `${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}`;
    const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

    const { rows: codeRows } = await db.query(
      `INSERT INTO login_codes (code_hash, note, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days') RETURNING id`,
      [codeHash, `access_request:${reqId}`]
    );

    if (delivery === 'email') {
      // Gmail SMTP 발송
      const mailer = getMailer();
      if (mailer) {
        await mailer.sendMail({
          from: `"StockPulse" <${GMAIL_USER}>`,
          to: email,
          subject: '[StockPulse] 로그인 코드가 발급됐습니다',
          text:
            `안녕하세요!\n\n` +
            `StockPulse 로그인 코드가 발급됐습니다.\n\n` +
            `코드: ${plainCode}\n\n` +
            `유효기간: 7일\n` +
            `로그인 페이지: https://stock-tracker-opal-six.vercel.app/login.html\n\n` +
            `본 이메일은 발신 전용입니다.`,
          html:
            `<p>안녕하세요!</p>` +
            `<p>StockPulse 로그인 코드가 발급됐습니다.</p>` +
            `<p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${plainCode}</p>` +
            `<p>유효기간: 7일 | ` +
            `<a href="https://stock-tracker-opal-six.vercel.app/login.html">로그인 페이지</a></p>`,
        });
      } else {
        console.warn('[approve-request] GMAIL_USER/GMAIL_APP_PASSWORD 미설정 — 이메일 발송 생략');
      }
      await db.query(
        `UPDATE access_requests SET status='sent', code_id=$1 WHERE id=$2`,
        [codeRows[0].id, reqId]
      );
      res.json({ ok: true, code: plainCode, delivery: 'email', emailSent: Boolean(mailer) });
    } else {
      // instant: plain_code 임시 저장 → 폴링이 가져간 후 NULL 처리
      await db.query(
        `UPDATE access_requests SET status='approved', code_id=$1, plain_code=$2 WHERE id=$3`,
        [codeRows[0].id, plainCode, reqId]
      );

      // 즉시 수신이라도 이메일로 코드 동시 발송 → 재로그인 대비
      const mailer = getMailer();
      if (mailer) {
        mailer.sendMail({
          from: `"StockPulse" <${GMAIL_USER}>`,
          to: email,
          subject: '[StockPulse] 로그인 코드가 발급됐습니다',
          text:
            `안녕하세요!\n\n` +
            `방금 로그인이 완료됐습니다.\n` +
            `다음번 로그인 또는 다른 기기에서 사용할 수 있도록 코드를 보내드립니다.\n\n` +
            `코드: ${plainCode}\n\n` +
            `유효기간: 7일\n` +
            `로그인 페이지: https://stock-tracker-opal-six.vercel.app/login.html\n\n` +
            `본 이메일은 발신 전용입니다.`,
          html:
            `<p>안녕하세요!</p>` +
            `<p>방금 로그인이 완료됐습니다.<br/>` +
            `다음번 로그인 또는 다른 기기에서 사용할 수 있도록 코드를 보내드립니다.</p>` +
            `<p style="font-size:22px;font-weight:bold;letter-spacing:2px;padding:12px 0;">${plainCode}</p>` +
            `<p>유효기간: 7일 | ` +
            `<a href="https://stock-tracker-opal-six.vercel.app/login.html">로그인 페이지</a></p>`,
        }).catch(e => console.warn('[approve-request] 이메일 발송 실패:', e.message));
      }

      res.json({ ok: true, code: plainCode, delivery: 'instant', emailSent: Boolean(mailer) });
    }
  } catch (err) {
    console.error('[approve-request]', err.message);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* --- Health --- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    finnhubConfigured: Boolean(FINNHUB_KEY),
    wsSupported: !process.env.VERCEL,
  });
});

/* --- Quote --- */
app.get('/api/quote', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }

  try {
    if (isKoreanSymbol(symbol)) {
      const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const json = await fetchJson(url);
      const quote = parseYahooQuote(json);
      if (!quote) return res.status(404).json({ error: 'quote not found' });
      return res.json(quote);
    }

    if (!FINNHUB_KEY) {
      return res.status(503).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    const url = `${FINNHUB_REST}/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
    const quote = await fetchJson(url);
    return res.json(quote);
  } catch (e) {
    console.error('[quote]', symbol, e.message);
    sendProxyError(res, e, 'Failed to fetch quote');
  }
});

/* --- Profile (US: Finnhub, KR: Yahoo meta) --- */
app.get('/api/profile', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (isKoreanSymbol(symbol)) {
      const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const json = await fetchJson(url);
      const profile = parseYahooProfile(parseYahooMeta(json)) || {};
      if (!profile.marketCap) {
        const cap = await fetchYahooSummaryMarketCap(symbol);
        if (cap) profile.marketCap = cap;
      }
      return res.json(profile);
    }

    if (!FINNHUB_KEY) {
      return res.status(503).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    const url = `${FINNHUB_REST}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
    const profile = await fetchJson(url);
    res.json(profile);
  } catch (e) {
    console.error('[profile]', symbol, e.message);
    sendProxyError(res, e, 'Failed to fetch profile');
  }
});

/* --- FX (USD/KRW 등) — Frankfurter, 키 불필요 --- */
app.get('/api/fx', async (req, res) => {
  const from = String(req.query.from || 'USD').toUpperCase();
  const to = String(req.query.to || 'KRW').toUpperCase();
  try {
    const url = `${FX_API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const data = await fetchJson(url);
    const rate = data?.rates?.[to];
    if (rate == null) return res.status(502).json({ error: 'rate not found' });
    res.json({ from, to, rate, date: data.date || null });
  } catch (e) {
    console.error('[fx]', from, to, e.message);
    res.status(e.status || 502).json({ error: 'Failed to fetch FX rate' });
  }
});

/* --- Market session status --- */
app.get('/api/market-status', (_req, res) => {
  res.json({
    kr: getKrMarketStatus(),
    us: getUsMarketStatus(),
  });
});

function getKrMarketStatus() {
  const kst = getKstNow();
  const day = kst.getDay();
  if (day === 0 || day === 6) return { open: false, session: 'closed', label: '휴장 (주말)' };
  const mins = kst.getHours() * 60 + kst.getMinutes();
  if (mins >= 9 * 60 && mins < 15 * 60 + 30) {
    return { open: true, session: 'regular', label: '정규장' };
  }
  if (mins >= 8 * 60 && mins < 9 * 60) {
    return { open: false, session: 'pre', label: '장전' };
  }
  return { open: false, session: 'closed', label: '휴장' };
}

function getUsMarketStatus() {
  const et = getEtNow();
  const day = et.getDay();
  if (day === 0 || day === 6) return { open: false, session: 'closed', label: 'Closed (weekend)' };
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) {
    return { open: true, session: 'regular', label: 'Regular' };
  }
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) {
    return { open: false, session: 'pre', label: 'Pre-market' };
  }
  if (mins >= 16 * 60 && mins < 20 * 60) {
    return { open: false, session: 'after', label: 'After-hours' };
  }
  return { open: false, session: 'closed', label: 'Closed' };
}

function getKstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function getEtNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/* --- Chart history (Yahoo — US/KR 공통) --- */
app.get('/api/chart', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = req.query.interval || '5m';
  const range = req.query.range || '1d';
  const withOhlc = req.query.ohlc === '1';

  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const json = await fetchJson(url);
    const { closes, ohlc } = parseYahooOhlc(json);
    res.json(withOhlc ? { symbol, closes, ohlc } : { symbol, closes });
  } catch (e) {
    console.error('[chart]', symbol, e.message);
    res.status(e.status || 502).json({ error: 'Failed to fetch chart' });
  }
});

async function searchKrYahoo(q) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  const json = await fetchJson(url);
  return (json.quotes || [])
    .filter((x) => x.symbol && (x.symbol.endsWith('.KS') || x.symbol.endsWith('.KQ')))
    .map((x) => ({
      symbol: x.symbol.toUpperCase(),
      name: x.shortname || x.longname || x.symbol,
    }));
}

/* --- Symbol search --- */
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const market = String(req.query.market || 'US').toUpperCase();
  if (!q) return res.json([]);

  try {
    if (market === 'KR') {
      const local = searchKrLocal(q);
      // Yahoo Finance 검색은 한글 쿼리를 거부함 → 한글은 로컬 인덱스만 사용
      if (hasHangul(q)) return res.json(local);

      try {
        const remote = await searchKrYahoo(q);
        return res.json(mergeSearchResults(local, remote));
      } catch (e) {
        console.warn('[search] KR yahoo fallback:', q, e.message);
        return res.json(local);
      }
    }

    if (!FINNHUB_KEY) return res.json([]);
    const url = `${FINNHUB_REST}/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
    const data = await fetchJson(url);
    const items = (data.result || [])
      .filter((x) => x.symbol && (!x.type || x.type === 'Common Stock' || x.type === 'EQS'))
      .slice(0, 8)
      .map((x) => ({
        symbol: x.symbol.toUpperCase(),
        name: x.description || x.symbol,
      }));
    return res.json(items);
  } catch (e) {
    if (market === 'KR') {
      const local = searchKrLocal(q);
      if (local.length) return res.json(local);
    }
    console.error('[search]', q, e.message);
    sendProxyError(res, e, 'Search failed');
  }
});

/* --- Company news (US — Finnhub) --- */
app.get('/api/news', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (isKoreanSymbol(symbol)) return res.json([]);

  if (!FINNHUB_KEY) return res.status(503).json({ error: 'FINNHUB_API_KEY not configured' });

  try {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const url = `${FINNHUB_REST}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${FINNHUB_KEY}`;
    const items = await fetchJson(url);
    const news = (Array.isArray(items) ? items : []).slice(0, 10).map((n) => ({
      headline: n.headline,
      summary: n.summary,
      url: n.url,
      source: n.source,
      datetime: n.datetime,
    }));
    res.json(news);
  } catch (e) {
    console.error('[news]', symbol, e.message);
    sendProxyError(res, e, 'Failed to fetch news');
  }
});

/* --- Stock metrics (US — Finnhub) --- */
app.get('/api/metrics', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (isKoreanSymbol(symbol)) return res.json(null);

  if (!FINNHUB_KEY) return res.status(503).json({ error: 'FINNHUB_API_KEY not configured' });

  try {
    const url = `${FINNHUB_REST}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_KEY}`;
    const data = await fetchJson(url);
    const m = data?.metric || {};
    res.json({
      pe: m.peBasic ?? m.peTTM ?? null,
      eps: m.epsBasic ?? m.epsTTM ?? null,
      roe: m.roeTTM ?? m.roeAnnual ?? null,
      roa: m.roaTTM ?? null,
      debtEquity: m.totalDebtToEquityAnnual ?? m['totalDebt/totalEquityAnnual'] ?? null,
      dividendYield: m.dividendYieldIndicatedAnnual ?? null,
      beta: m.beta ?? null,
      revenueGrowth: m.revenueGrowthTTMYoy ?? null,
    });
  } catch (e) {
    console.error('[metrics]', symbol, e.message);
    sendProxyError(res, e, 'Failed to fetch metrics');
  }
});

/* --- SPA fallback (로컬 전용 — Vercel은 frontend 정적 호스팅) --- */
if (!isVercel) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
}

/* --- Vercel: Express 앱 export / 로컬: HTTP + WebSocket --- */
module.exports = app;

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (clientWs) => {
    if (!FINNHUB_KEY) {
      clientWs.close(1011, 'FINNHUB_API_KEY not configured');
      return;
    }

    const upstream = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

    upstream.on('open', () => {
      clientWs.on('message', (data) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
      });
      upstream.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
      });
    });

    upstream.on('error', () => clientWs.close(1011, 'upstream error'));
    upstream.on('close', () => clientWs.close());
    clientWs.on('close', () => upstream.close());
    clientWs.on('error', () => upstream.close());
  });
}

if (!process.env.VERCEL) {
  const server = http.createServer(app);
  attachWebSocket(server);
  server.listen(PORT, () => {
    console.log(`StockPulse server → http://localhost:${PORT}`);
    if (!FINNHUB_KEY) {
      console.warn('⚠  FINNHUB_API_KEY 없음 — .env 파일을 확인하세요.');
    }
  });
}
