/**
 * StockPulse API·정적 자원 QA (수동 QA 보조)
 * 사용: npm run qa  (서버가 http://localhost:3000 에 떠 있어야 함)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE || 'http://localhost:3000';

const tests = [];
let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    tests.push({ name, status: 'PASS', detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    tests.push({ name, status: 'FAIL', detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body };
}

async function run() {
  console.log(`\nStockPulse QA → ${BASE}\n`);

  try {
    const health = await get('/api/health');
    ok('GET /api/health → 200', health.res.status === 200);
    ok('Finnhub 키 설정됨', health.body?.finnhubConfigured === true, String(health.body?.finnhubConfigured));

    const quoteUs = await get('/api/quote?symbol=AAPL');
    ok('GET /api/quote US → 200', quoteUs.res.status === 200);
    ok('US quote 가격 존재', quoteUs.body?.c > 0, `c=${quoteUs.body?.c}`);

    const quoteKr = await get('/api/quote?symbol=005930.KS');
    ok('GET /api/quote KR → 200', quoteKr.res.status === 200);
    ok('KR quote 가격 존재', quoteKr.body?.c > 0, `c=${quoteKr.body?.c}`);

    const profile = await get('/api/profile?symbol=AAPL');
    ok('GET /api/profile → 200', profile.res.status === 200);

    const chart = await get('/api/chart?symbol=AAPL&interval=5m&range=1d&ohlc=1');
    ok('GET /api/chart ohlc → 200', chart.res.status === 200);
    ok('차트 ohlc 배열', Array.isArray(chart.body?.ohlc) && chart.body.ohlc.length > 0, `len=${chart.body?.ohlc?.length}`);

    const search = await get('/api/search?q=apple&market=US');
    ok('GET /api/search US → 200', search.res.status === 200);
    ok('검색 결과 배열', Array.isArray(search.body) && search.body.length > 0);

    const searchKr = await get('/api/search?q=%EC%82%BC%EC%84%B1&market=KR');
    ok('GET /api/search KR 한글 → 200', searchKr.res.status === 200);
    ok('한글 검색 삼성', Array.isArray(searchKr.body) && searchKr.body.length > 0, searchKr.body?.[0]?.name);
    ok('삼성 검색 1위 삼성전자', searchKr.body?.[0]?.symbol === '005930.KS', searchKr.body?.[0]?.name);

    const searchKrExact = await get('/api/search?q=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&market=KR');
    ok('삼성전자 정확 검색', searchKrExact.body?.[0]?.symbol === '005930.KS', searchKrExact.body?.[0]?.name);

    const searchKrAlias = await get('/api/search?q=%EC%82%BC%EC%A0%84&market=KR');
    ok('별칭 삼전 → 삼성전자', searchKrAlias.body?.[0]?.symbol === '005930.KS', searchKrAlias.body?.[0]?.name);

    const krStocks = JSON.parse(
      readFileSync(path.join(__dirname, '..', 'backend', 'data', 'kr-stocks.json'), 'utf8')
    );
    ok('KR 검색 인덱스 200종+', krStocks.length >= 200, `count=${krStocks.length}`);

    const mkt = await get('/api/market-status');
    ok('GET /api/market-status → 200', mkt.res.status === 200);
    ok('KR/US 상태 객체', mkt.body?.kr && mkt.body?.us);

    const fx = await get('/api/fx?from=USD&to=KRW');
    ok('GET /api/fx → 200', fx.res.status === 200);
    ok('USD/KRW 환율', fx.body?.rate > 0, `rate=${fx.body?.rate}`);

    const news = await get('/api/news?symbol=AAPL');
    ok('GET /api/news US → 200', news.res.status === 200);
    ok('US 뉴스 배열', Array.isArray(news.body));

    const newsKr = await get('/api/news?symbol=005930.KS');
    ok('GET /api/news KR → 200', newsKr.res.status === 200);
    ok('KR 뉴스 빈 배열', Array.isArray(newsKr.body) && newsKr.body.length === 0);

    const metrics = await get('/api/metrics?symbol=AAPL');
    ok('GET /api/metrics US → 200', metrics.res.status === 200);
    ok('US metrics pe', metrics.body?.pe != null, `pe=${metrics.body?.pe}`);

    const metricsKr = await get('/api/metrics?symbol=005930.KS');
    ok('GET /api/metrics KR → 200', metricsKr.res.status === 200);
    ok('KR metrics null', metricsKr.body === null);

    for (const path of [
      '/manifest.json',
      '/sw.js',
      '/icon-192.png',
      '/icon-512.png',
      '/screenshots/desktop-wide.png',
      '/screenshots/mobile-narrow.png',
      '/index.html',
      '/style.css',
      '/app.js',
    ]) {
      const res = await fetch(`${BASE}${path}`);
      ok(`GET ${path} → 200`, res.status === 200, String(res.status));
    }

    const manifest = await get('/manifest.json');
    ok('manifest name', manifest.body?.name === 'StockPulse');
    ok('manifest icons', Array.isArray(manifest.body?.icons) && manifest.body.icons.length > 0);
    ok(
      'manifest 512 PNG',
      manifest.body?.icons?.some((i) => i.sizes === '512x512' && String(i.src).includes('512')),
    );
    ok(
      'manifest 192 PNG',
      manifest.body?.icons?.some((i) => i.sizes === '192x192' && String(i.src).includes('192.png')),
    );
    ok(
      'manifest screenshots wide+narrow',
      manifest.body?.screenshots?.some((s) => s.form_factor === 'wide') &&
        manifest.body?.screenshots?.some((s) => s.form_factor === 'narrow'),
    );
  } catch (e) {
    failed++;
    console.error('\n  ✗ QA 실행 실패:', e.message);
    console.error('    서버가 실행 중인지 확인: npm start\n');
    process.exit(1);
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
