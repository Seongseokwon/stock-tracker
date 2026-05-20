/**
 * StockPulse — API 프록시 서버
 * Finnhub API 키 보호, Yahoo Finance CORS 우회, WebSocket 프록시
 */
const http = require('http');
const path = require('path');

if (!process.env.VERCEL) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_REST = 'https://finnhub.io/api/v1';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';
const FX_API = 'https://api.frankfurter.app/latest';

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const { hasHangul, searchKrLocal, mergeSearchResults } = require('./kr-search');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

if (!isVercel) {
  app.use(express.static(FRONTEND_DIR));
}

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
