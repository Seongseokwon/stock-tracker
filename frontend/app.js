/* ============================================================
   StockPulse — App Logic
   API 키는 서버 프록시에서만 사용 (npm start 필수)
   ============================================================ */

const API_BASE = ''; // same-origin → 로컬: Express / Vercel: rewrite → Railway
// WebSocket: 로컬은 같은 서버, Vercel 배포는 Railway 직접 연결 (Vercel WS 미지원)
const _isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const WS_PATH = _isLocal
  ? `ws://${location.host}/ws`
  : 'wss://stock-tracker-production-7e54.up.railway.app/ws';
const POLL_INTERVAL_KR_OPEN = 3000;
const POLL_INTERVAL_KR_CLOSED = 60000;
const POLL_INTERVAL_US_FALLBACK = 20000;
const POLL_INTERVAL_US_RATE_LIMIT = 45000;
const POLL_STAGGER_MS = 300;
const API_QUEUE_GAP_MS = 250;
const API_QUEUE_GAP_RATE_LIMIT_MS = 900;
const RATE_LIMIT_DEFAULT_SEC = 60;
const HISTORY_MAX = 60;

const CHART_PRESETS = {
  intraday: { interval: '5m', range: '1d', defaultType: 'line' },
  day: { interval: '1d', range: '3mo', defaultType: 'candle' },
  week: { interval: '1wk', range: '1y', defaultType: 'candle' },
  month: { interval: '1mo', range: '5y', defaultType: 'candle' },
};

let searchDebounceTimer = null;

// Stock name mapping — US stocks
const STOCK_NAMES_US = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.', TSLA: 'Tesla Inc.', META: 'Meta Platforms',
  NVDA: 'NVIDIA Corp.', NFLX: 'Netflix Inc.', AMD: 'Advanced Micro Devices',
  INTC: 'Intel Corp.', ORCL: 'Oracle Corp.', CRM: 'Salesforce Inc.',
  SHOP: 'Shopify Inc.', UBER: 'Uber Technologies', PYPL: 'PayPal Holdings',
  COIN: 'Coinbase Global', PLTR: 'Palantir Technologies', RBLX: 'Roblox Corp.',
  BA: 'Boeing Co.', DIS: 'Walt Disney Co.', JPM: 'JPMorgan Chase',
  GS: 'Goldman Sachs', V: 'Visa Inc.', MA: 'Mastercard Inc.'
};

// Stock name mapping — KOSPI/KOSDAQ (.KS suffix for Finnhub)
const STOCK_NAMES_KR = {
  '005930.KS': '삼성전자',
  '000660.KS': 'SK하이닉스',
  '035420.KS': 'NAVER',
  '035720.KS': '카카오',
  '005380.KS': '현대차',
  '000270.KS': '기아',
  '051910.KS': 'LG화학',
  '006400.KS': '삼성SDI',
  '068270.KS': '셀트리온',
  '207940.KS': '삼성바이오로직스',
  '005490.KS': 'POSCO홀딩스',
  '066570.KS': 'LG전자',
  '003550.KS': 'LG',
  '017670.KS': 'SK텔레콤',
  '030200.KS': 'KT',
  '055550.KS': '신한지주',
  '105560.KS': 'KB금융',
  '086790.KS': '하나금융지주',
  '032830.KS': '삼성생명',
  '009830.KS': '한화솔루션',
  '096770.KS': 'SK이노베이션',
  '010950.KS': 'S-Oil',
  '000810.KS': '삼성화재',
  '018260.KS': '삼성에스디에스',
  '034730.KS': 'SK',
  '012330.KS': '현대모비스',
  '011200.KS': 'HMM',
  '316140.KS': '우리금융지주',
  '138040.KS': '메리츠금융지주',
  '032640.KS': 'LG유플러스',
  '035900.KQ': 'JYP Ent.',
  '293490.KQ': '카카오게임즈',
  '263750.KQ': '펄어비스',
  '041510.KQ': 'SM Ent.',
  '352820.KQ': '하이브',
  '247540.KQ': '에코프로비엠',
  '086520.KQ': '에코프로',
};

const STOCK_NAMES = { ...STOCK_NAMES_US, ...STOCK_NAMES_KR };

// Detect if a symbol is Korean (.KS / .KQ suffix)
function isKoreanSymbol(symbol) {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ');
}

// Currency symbol for display
function getCurrencySymbol(symbol) {
  return isKoreanSymbol(symbol) ? '₩' : '$';
}

// Format price with correct locale/currency
function formatPriceLocale(price, symbol) {
  if (!price && price !== 0) return '--';
  if (isKoreanSymbol(symbol)) {
    return price.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Suggestion data
const SUGGESTIONS_US = Object.entries(STOCK_NAMES_US).map(([s, n]) => ({ symbol: s, name: n, market: 'US' }));
const SUGGESTIONS_KR = Object.entries(STOCK_NAMES_KR).map(([s, n]) => ({ symbol: s, name: n, market: 'KR' }));
const SUGGESTIONS = [...SUGGESTIONS_US, ...SUGGESTIONS_KR];

// Active market tab
let activeMarket = 'US'; // 'US' or 'KR'
let activeKrSuffix = 'KS'; // 'KS' (KOSPI) or 'KQ' (KOSDAQ)

// State
const state = {
  watchlist: JSON.parse(localStorage.getItem('sp_watchlist') || '[]'),
  prices: {},       // { symbol: { price, prevPrice, change, pctChange, open, high, low, volume } }
  history: {},      // { symbol: [price, price, ...] } (last 60 data points)
  ws: null,
  wsConnected: false,
  miniCharts: {},   // { symbol: CanvasRenderingContext2D }
  modalSymbol: null,
  modalChart: null,
  modalHistory: [], // price history for modal chart
  updateTimer: null,
  apiReady: false,
  cardErrors: {},
  marketStatus: { kr: null, us: null },
  sortBy: localStorage.getItem('sp_sort') || 'added',
  filterMarket: localStorage.getItem('sp_filter') || 'all',
  modalChartPreset: 'intraday',
  modalChartType: 'line',
  modalOhlc: [],
  modalLineCloses: [],
  portfolio: JSON.parse(localStorage.getItem('sp_portfolio') || '{}'),
  alerts: JSON.parse(localStorage.getItem('sp_alerts') || '{}'),
  alertArmed: {},
  usdKrwRate: null,
  fxDate: null,
  wsSupported: true,
  rateLimitUntil: 0,
  rateLimitBannerDismissed: false,
  rateLimitTimer: null,
};

let globalPollTimer = null;

/* ============================================================
   API helpers
   ============================================================ */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const apiQueue = {
  busy: false,
  queue: [],
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.tick();
    });
  },
  gapMs() {
    return isRateLimitActive() ? API_QUEUE_GAP_RATE_LIMIT_MS : API_QUEUE_GAP_MS;
  },
  async tick() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const { fn, resolve, reject } = this.queue.shift();
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    }
    await sleep(this.gapMs());
    this.busy = false;
    this.tick();
  },
};

function isRateLimitActive() {
  return state.rateLimitUntil > Date.now();
}

function enterRateLimitMode(retryAfterSec = RATE_LIMIT_DEFAULT_SEC) {
  const wasActive = isRateLimitActive();
  const sec = Math.max(15, Number(retryAfterSec) || RATE_LIMIT_DEFAULT_SEC);
  state.rateLimitUntil = Date.now() + sec * 1000;
  state.rateLimitBannerDismissed = false;
  updateRateLimitBanner(true);
  updateConnectionStatus();
  syncGlobalPolling();
  if (!wasActive) {
    showToast(`Finnhub API 요청 한도에 도달했습니다. 약 ${sec}초간 갱신이 느려집니다.`, 'error');
  }
  if (state.rateLimitTimer) clearTimeout(state.rateLimitTimer);
  state.rateLimitTimer = setTimeout(() => {
    state.rateLimitUntil = 0;
    updateRateLimitBanner(false);
    updateConnectionStatus();
    syncGlobalPolling();
  }, sec * 1000);
}

function exitRateLimitMode() {
  if (!isRateLimitActive()) return;
  state.rateLimitUntil = 0;
  if (state.rateLimitTimer) clearTimeout(state.rateLimitTimer);
  state.rateLimitTimer = null;
  updateRateLimitBanner(false);
  updateConnectionStatus();
  syncGlobalPolling();
}

function updateRateLimitBanner(show) {
  const el = document.getElementById('rateLimitBanner');
  const msgEl = document.getElementById('rateLimitBannerMsg');
  if (!el) return;
  if (show && !state.rateLimitBannerDismissed) {
    el.classList.remove('hidden');
    if (msgEl) {
      const sec = Math.max(1, Math.ceil((state.rateLimitUntil - Date.now()) / 1000));
      msgEl.textContent =
        `무료 플랜 한도에 도달했습니다. 약 ${sec}초 후 정상화됩니다. ` +
        '종목·검색·뉴스 요청이 많으면 갱신이 지연될 수 있습니다.';
    }
  } else {
    el.classList.add('hidden');
  }
}

function dismissRateLimitBanner() {
  state.rateLimitBannerDismissed = true;
  updateRateLimitBanner(false);
}

async function apiFetchRaw(path, options = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      if (res.status === 429) {
        let body = {};
        try {
          body = await res.json();
        } catch { /* ignore */ }
        enterRateLimitMode(body.retryAfterSec);
        return res;
      }
      if (res.ok && isRateLimitActive()) exitRateLimitMode();
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < retries - 1) await sleep(600 * (i + 1));
  }
  throw lastErr;
}

function apiFetch(path, options = {}, retries = 3) {
  return apiQueue.enqueue(() => apiFetchRaw(path, options, retries));
}

function hasUSSymbols() {
  return state.watchlist.some((s) => !isKoreanSymbol(s));
}

function hasKoreanSymbols() {
  return state.watchlist.some((s) => isKoreanSymbol(s));
}

function isKrMarketOpen() {
  return state.marketStatus.kr?.open === true;
}

function getPollIntervalMs() {
  let interval = null;
  if (hasKoreanSymbols()) {
    interval = isKrMarketOpen() ? POLL_INTERVAL_KR_OPEN : POLL_INTERVAL_KR_CLOSED;
  } else if (hasUSSymbols() && !state.wsConnected) {
    interval = POLL_INTERVAL_US_FALLBACK;
  }
  if (isRateLimitActive() && (hasUSSymbols() || hasKoreanSymbols())) {
    const slow = hasUSSymbols() && !state.wsConnected
      ? POLL_INTERVAL_US_RATE_LIMIT
      : (interval || POLL_INTERVAL_KR_OPEN) * 2;
    interval = interval ? Math.max(interval, slow) : slow;
  }
  return interval;
}

function symbolsNeedingPoll() {
  return state.watchlist.filter((sym) => {
    if (isKoreanSymbol(sym)) return true;
    return !isKoreanSymbol(sym) && !state.wsConnected;
  });
}

function getKrSuffix() {
  return `.${activeKrSuffix}`;
}

/* ============================================================
   Init
   ============================================================ */
function ensureModalOnBody() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay && overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.loggedIn === true;
  } catch { return false; }
}

// bfcache(뒤로 가기 캐시)로 복원 시 세션 재검증
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    checkSession().then((ok) => { if (!ok) window.location.replace('/login.html'); });
  }
});

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
}

async function init() {
  const loggedIn = await checkSession();
  if (!loggedIn) { window.location.href = '/login.html'; return; }
  document.body.style.visibility = 'visible';

  ensureModalOnBody();
  applyTheme(localStorage.getItem('sp_theme') || 'dark');
  registerServiceWorker();
  updateClock();
  setInterval(updateClock, 1000);
  renderWatchlist();

  const ok = await checkApiServer();
  if (!ok) return;

  await refreshMarketStatus();
  setInterval(refreshMarketStatus, 60000);

  await refreshFxRate();
  setInterval(refreshFxRate, 30 * 60 * 1000);

  connectWebSocket();
  syncGlobalPolling();

  // Search input
  const input = document.getElementById('searchInput');
  input.addEventListener('input', onSearchInput);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) hideSuggestions();
    if (!e.target.closest('.share-toolbar-wrap')) hideSharePanel();
  });

  const sortEl = document.getElementById('sortBy');
  const filterEl = document.getElementById('filterMarket');
  if (sortEl) sortEl.value = state.sortBy;
  if (filterEl) filterEl.value = state.filterMarket;

  updateAlertBellUI();
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

async function checkApiServer() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error('health check failed');
    const data = await res.json();
    state.apiReady = true;
    state.wsSupported = data.wsSupported !== false;
    if (!data.finnhubConfigured) {
      showToast('Finnhub API 키가 설정되지 않았습니다 (Vercel 환경 변수 확인)', 'error');
    }
    return true;
  } catch {
    state.apiReady = false;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    showToast(
      local ? '서버에 연결할 수 없습니다. 터미널에서 npm start 로 실행하세요.' : 'API 서버에 연결할 수 없습니다.',
      'error'
    );
    setWsStatus('offline');
    return false;
  }
}

/* ============================================================
   Clock
   ============================================================ */
function updateClock() {
  const el = document.getElementById('marketTime');
  const now = new Date();
  el.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ============================================================
   WebSocket
   ============================================================ */
function connectWebSocket() {
  if (!state.apiReady) return;
  if (state.wsSupported === false) {
    syncGlobalPolling();
    updateConnectionStatus();
    return;
  }
  if (!hasUSSymbols()) {
    updateConnectionStatus();
    return;
  }

  setWsStatus('connecting');
  try {
    state.ws = new WebSocket(WS_PATH);

    state.ws.onopen = () => {
      state.wsConnected = true;
      updateConnectionStatus();
      syncGlobalPolling();
      state.watchlist.forEach(sym => wsSubscribe(sym));
    };

    state.ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'trade' && data.data) {
          data.data.forEach(trade => {
            const sym = trade.s;
            const price = trade.p;
            updatePrice(sym, price);
          });
        }
      } catch { }
    };

    state.ws.onclose = () => {
      state.wsConnected = false;
      syncGlobalPolling();
      if (hasUSSymbols()) setWsStatus('error');
      else updateConnectionStatus();
      setTimeout(connectWebSocket, 5000);
    };

    state.ws.onerror = () => {
      state.wsConnected = false;
      if (hasUSSymbols()) setWsStatus('error');
    };
  } catch {
    setWsStatus('error');
    setTimeout(connectWebSocket, 5000);
  }
}

function updateConnectionStatus() {
  if (!state.apiReady) {
    setWsStatus('offline');
    return;
  }
  if (isRateLimitActive()) {
    if (state.wsConnected && hasUSSymbols()) {
      setWsStatus('rate-limited-partial');
      return;
    }
    if (hasUSSymbols() || hasKoreanSymbols()) {
      setWsStatus('rate-limited', getPollIntervalMs());
      return;
    }
  }
  if (state.wsSupported === false && (hasUSSymbols() || hasKoreanSymbols())) {
    setWsStatus('polling', getPollIntervalMs() || POLL_INTERVAL_US_FALLBACK);
    return;
  }
  if (state.watchlist.length > 0 && !hasUSSymbols()) {
    setWsStatus('polling', getPollIntervalMs());
    return;
  }
  if (state.wsConnected && hasUSSymbols()) {
    setWsStatus('connected');
    return;
  }
  if (hasUSSymbols()) {
    setWsStatus(state.wsConnected ? 'connected' : 'connecting');
  }
}

function wsSubscribe(symbol) {
  // 한국 주식은 Finnhub WebSocket 미지원 — Yahoo 폴링으로 대체
  if (isKoreanSymbol(symbol)) return;
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
  }
}

function wsUnsubscribe(symbol) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
  }
}

function setWsStatus(status, pollMs) {
  const el = document.getElementById('wsStatus');
  const label = el.querySelector('.status-label');
  el.className = 'ws-status';
  if (status === 'connected') {
    el.classList.add('connected');
    label.textContent = '실시간 연결됨';
  } else if (status === 'polling') {
    el.classList.add('polling');
    const sec = pollMs ? Math.round(pollMs / 1000) : 15;
    label.textContent = `폴링 모드 (${sec}초)`;
  } else if (status === 'error') {
    el.classList.add('error');
    label.textContent = '재연결 중...';
  } else if (status === 'offline') {
    el.classList.add('error');
    label.textContent = '서버 미연결';
  } else if (status === 'rate-limited') {
    el.classList.add('rate-limited');
    const sec = pollMs ? Math.round(pollMs / 1000) : 45;
    label.textContent = `API 제한 (약 ${sec}초 간격)`;
  } else if (status === 'rate-limited-partial') {
    el.classList.add('rate-limited');
    label.textContent = '실시간 · API 제한';
  } else {
    label.textContent = '연결 중...';
  }
}

/* ============================================================
   REST API — Quote, Profile, Chart (서버 프록시)
   ============================================================ */
async function fetchQuote(symbol) {
  if (!state.apiReady) return null;
  try {
    const res = await apiFetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchProfile(symbol) {
  if (isKoreanSymbol(symbol)) return null;
  if (!state.apiReady) return null;
  try {
    const res = await apiFetch(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function fetchChartHistory(symbol, interval = '5m', range = '1d') {
  const data = await fetchChartData(symbol, interval, range, false);
  return data.closes || [];
}

async function fetchChartData(symbol, interval, range, withOhlc = true) {
  if (!state.apiReady) return { closes: [], ohlc: [] };
  try {
    const q = `symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}${withOhlc ? '&ohlc=1' : ''}`;
    const res = await apiFetch(`/api/chart?${q}`);
    if (!res.ok) return { closes: [], ohlc: [] };
    const data = await res.json();
    return {
      closes: Array.isArray(data.closes) ? data.closes : [],
      ohlc: Array.isArray(data.ohlc) ? data.ohlc : [],
    };
  } catch {
    return { closes: [], ohlc: [] };
  }
}

async function fetchSearch(query) {
  if (!state.apiReady || !query.trim()) return [];
  try {
    const market = activeMarket === 'KR' ? 'KR' : 'US';
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}&market=${market}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function loadInitialHistory(symbol) {
  const closes = await fetchChartHistory(symbol, '5m', '1d');
  if (closes.length >= 2) {
    state.history[symbol] = closes.slice(-HISTORY_MAX);
    return;
  }
  const data = state.prices[symbol];
  if (data?.price) {
    state.history[symbol] = [data.price];
  }
}

/* ============================================================
   Price update
   ============================================================ */
function updatePrice(symbol, newPrice) {
  if (!state.watchlist.includes(symbol)) return;

  const prev = state.prices[symbol];
  const prevPrice = prev ? prev.price : newPrice;

  if (!state.prices[symbol]) {
    state.prices[symbol] = { price: newPrice, prevPrice: newPrice, change: 0, pctChange: 0, open: newPrice, high: newPrice, low: newPrice };
  } else {
    const open = state.prices[symbol].open || newPrice;
    const change = newPrice - open;
    const pctChange = open > 0 ? (change / open) * 100 : 0;
    const high = Math.max(state.prices[symbol].high || newPrice, newPrice);
    const low = Math.min(state.prices[symbol].low || newPrice, newPrice);
    state.prices[symbol] = { ...state.prices[symbol], price: newPrice, prevPrice, change, pctChange, high, low };
  }

  // Update history
  if (!state.history[symbol]) state.history[symbol] = [];
  state.history[symbol].push(newPrice);
  if (state.history[symbol].length > HISTORY_MAX) state.history[symbol].shift();

  updateCardUI(symbol);
  renderPortfolioSummary();
  checkAlerts(symbol);

  if (state.modalSymbol === symbol) {
    updateModalPrice(symbol);
    updatePortfolioPreview();
  }
}

/* ============================================================
   Search
   ============================================================ */
const HANGUL_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;

function hasHangul(text) {
  return HANGUL_RE.test(text);
}

function itemMatchesQuery(item, q) {
  const qu = q.toUpperCase();
  if (item.symbol.toUpperCase().includes(qu)) return true;
  if (String(item.name).toUpperCase().includes(qu)) return true;
  if (String(item.name).includes(q)) return true;
  return false;
}

function onSearchInput(e) {
  const q = e.target.value.trim();
  if (!q) { hideSuggestions(); return; }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    const pool = activeMarket === 'KR' ? SUGGESTIONS_KR : SUGGESTIONS_US;
    const local = pool.filter((s) => itemMatchesQuery(s, q));

    const remote = await fetchSearch(q);
    const seen = new Set();
    const merged = [];
    for (const item of [...local, ...remote.map(r => ({ symbol: r.symbol, name: r.name }))]) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      merged.push(item);
      if (merged.length >= 8) break;
    }
    showSuggestions(merged);
  }, 320);
}

function showSuggestions(items) {
  const el = document.getElementById('searchSuggestions');
  if (!items.length) { hideSuggestions(); return; }
  el.innerHTML = items.map((item) => {
    const sym = item.symbol.replace(/'/g, '');
    return `
    <div class="suggestion-item" onclick="selectSuggestion('${sym}')">
      <span class="suggestion-symbol">${escapeHtml(item.symbol)}</span>
      <span class="suggestion-name">${escapeHtml(item.name || '')}</span>
    </div>`;
  }).join('');
  el.classList.add('visible');
}

function hideSuggestions() {
  document.getElementById('searchSuggestions').classList.remove('visible');
}

function selectSuggestion(symbol) {
  document.getElementById('searchInput').value = symbol;
  hideSuggestions();
  addStock(symbol);
}

async function handleSearch() {
  const input = document.getElementById('searchInput');
  const raw = input.value.trim();
  if (!raw) return;
  hideSuggestions();

  const looksLikeTicker = /^[A-Za-z0-9]{1,10}(\.[A-Za-z]{1,4})?$/.test(raw);

  // 한국 탭: 종목명·종목코드(숫자) → 검색 API로 심볼 해석
  if (activeMarket === 'KR' && (hasHangul(raw) || /^\d{1,6}$/.test(raw) || !looksLikeTicker)) {
    const results = await fetchSearch(raw);
    if (results.length === 1) {
      await addStock(results[0].symbol);
      input.value = '';
      return;
    }
    if (results.length > 1) {
      showSuggestions(results);
      showToast('검색 결과에서 종목을 선택하세요', 'info');
      return;
    }
    showToast(`「${raw}」 검색 결과가 없습니다`, 'error');
    return;
  }

  let symbol = raw.toUpperCase();
  if (activeMarket === 'KR' && !symbol.includes('.')) {
    symbol = symbol + getKrSuffix();
  }
  await addStock(symbol);
  input.value = '';
}

/* ============================================================
   Add / Remove Stock
   ============================================================ */
async function addStock(symbol) {
  symbol = symbol.toUpperCase();
  if (!state.apiReady) {
    showToast('서버에 연결되지 않았습니다. npm start 로 실행하세요.', 'error');
    return;
  }
  if (state.watchlist.includes(symbol)) {
    showToast(`${symbol}은(는) 이미 추가되어 있습니다`, 'info');
    return;
  }
  if (state.watchlist.length >= 20) {
    showToast('최대 20개 종목까지 추가할 수 있습니다', 'error');
    return;
  }

  // Add placeholder card first
  state.watchlist.push(symbol);
  state.history[symbol] = [];
  saveWatchlist();
  renderWatchlist();
  setCardLoading(symbol, true);
  showToast(`${symbol} 추가 중...`, 'info');

  const quote = await fetchQuote(symbol);
  if (!quote || quote.c === 0) {
    state.watchlist = state.watchlist.filter(s => s !== symbol);
    delete state.history[symbol];
    saveWatchlist();
    renderWatchlist();
    updateConnectionStatus();
    showToast(
      quote === null
        ? `${symbol}: 시세를 가져오지 못했습니다. 잠시 후 다시 시도하세요.`
        : `${symbol}: 유효하지 않은 종목 코드입니다`,
      'error'
    );
    return;
  }

  applyQuote(symbol, quote);
  delete state.cardErrors[symbol];

  await loadInitialHistory(symbol);

  setCardLoading(symbol, false);
  setCardError(symbol, false);
  renderWatchlist();
  wsSubscribe(symbol);
  if (hasUSSymbols() && !state.wsConnected) connectWebSocket();
  updateConnectionStatus();
  syncGlobalPolling();
  showToast(`${symbol} 추가 완료!`, 'success');
}

function applyQuote(symbol, quote) {
  const prev = state.prices[symbol];
  state.prices[symbol] = {
    price: quote.c,
    prevPrice: prev ? prev.price : quote.pc,
    change: quote.d ?? (quote.c - quote.pc),
    pctChange: quote.dp ?? ((quote.c - quote.pc) / quote.pc * 100),
    open: quote.o,
    high: quote.h,
    low: quote.l,
    volume: quote.v,
    marketCap: quote.marketCap ?? prev?.marketCap,
    trailingPE: quote.trailingPE ?? prev?.trailingPE,
    name: quote.name ?? prev?.name,
  };
  if (quote.name && !STOCK_NAMES[symbol]) {
    const nameEl = document.getElementById(`name-${symbol}`);
    if (nameEl) nameEl.textContent = quote.name;
  }
  renderPortfolioSummary();
  checkAlerts(symbol);
}

async function retryStock(symbol) {
  setCardError(symbol, false);
  setCardLoading(symbol, true);
  const quote = await fetchQuote(symbol);
  if (!quote || quote.c === 0) {
    setCardLoading(symbol, false);
    setCardError(symbol, true);
    showToast(`${symbol}: 시세를 가져오지 못했습니다`, 'error');
    return;
  }
  applyQuote(symbol, quote);
  setCardLoading(symbol, false);
  updateCardUI(symbol);
  renderPortfolioSummary();
  showToast(`${symbol} 갱신 완료`, 'success');
}

function setCardLoading(symbol, loading) {
  const card = document.getElementById(`card-${symbol}`);
  if (card) card.classList.toggle('loading', loading);
}

function setCardError(symbol, hasError) {
  state.cardErrors[symbol] = hasError;
  const card = document.getElementById(`card-${symbol}`);
  if (card) card.classList.toggle('error', hasError);
  const errEl = document.getElementById(`error-${symbol}`);
  if (errEl) errEl.hidden = !hasError;
}

function removeStock(symbol, options = {}) {
  const { silent = false } = options;
  state.watchlist = state.watchlist.filter(s => s !== symbol);
  delete state.prices[symbol];
  delete state.history[symbol];
  delete state.portfolio[symbol];
  delete state.alerts[symbol];
  delete state.alertArmed[symbol];
  savePortfolioStore();
  saveAlertsStore();
  wsUnsubscribe(symbol);
  delete state.cardErrors[symbol];
  saveWatchlist();
  renderWatchlist();
  if (!hasUSSymbols() && state.ws) {
    state.ws.close();
    state.ws = null;
    state.wsConnected = false;
  }
  updateConnectionStatus();
  syncGlobalPolling();
  if (!silent) showToast(`${symbol} 삭제됨`, 'info');
  if (state.modalSymbol === symbol) closeModal();
}

function saveWatchlist() {
  localStorage.setItem('sp_watchlist', JSON.stringify(state.watchlist));
}

/* ============================================================
   Polling — 통합 스케줄러 (rate limit 대응)
   ============================================================ */
async function refreshSymbolQuote(symbol) {
  const quote = await fetchQuote(symbol);
  if (!quote || quote.c === 0) {
    setCardError(symbol, true);
    return;
  }
  setCardError(symbol, false);
  applyQuote(symbol, quote);
  if (!state.history[symbol]) state.history[symbol] = [];
  state.history[symbol].push(quote.c);
  if (state.history[symbol].length > HISTORY_MAX) state.history[symbol].shift();
  updateCardUI(symbol);
  renderPortfolioSummary();
  if (state.modalSymbol === symbol) updateModalPrice(symbol);
}

async function runPollCycle() {
  const symbols = symbolsNeedingPoll();
  for (const sym of symbols) {
    await refreshSymbolQuote(sym);
    await sleep(POLL_STAGGER_MS);
  }
  scheduleGlobalPoll();
}

function scheduleGlobalPoll() {
  if (globalPollTimer) clearTimeout(globalPollTimer);
  const interval = getPollIntervalMs();
  const symbols = symbolsNeedingPoll();
  if (!interval || !symbols.length) {
    globalPollTimer = null;
    return;
  }
  globalPollTimer = setTimeout(runPollCycle, interval);
}

function syncGlobalPolling() {
  if (globalPollTimer) clearTimeout(globalPollTimer);
  const symbols = symbolsNeedingPoll();
  if (!symbols.length) {
    globalPollTimer = null;
    return;
  }
  runPollCycle();
}

/* ============================================================
   Market status
   ============================================================ */
async function refreshMarketStatus() {
  try {
    const res = await apiFetch('/api/market-status');
    if (!res.ok) return;
    state.marketStatus = await res.json();
    renderMarketBadges();
    updateConnectionStatus();
    syncGlobalPolling();
  } catch { /* ignore */ }
}

function renderMarketBadges() {
  const kr = state.marketStatus.kr;
  const us = state.marketStatus.us;
  const badgeKr = document.getElementById('badgeKr');
  const badgeUs = document.getElementById('badgeUs');
  if (badgeKr && kr) {
    badgeKr.textContent = `🇰🇷 ${kr.label}`;
    badgeKr.classList.toggle('open', kr.open);
  }
  if (badgeUs && us) {
    badgeUs.textContent = `🇺🇸 ${us.label}`;
    badgeUs.classList.toggle('open', us.open);
  }
}

/* ============================================================
   Watchlist sort & filter
   ============================================================ */
function passesMarketFilter(symbol) {
  if (state.filterMarket === 'US') return !isKoreanSymbol(symbol);
  if (state.filterMarket === 'KR') return isKoreanSymbol(symbol);
  return true;
}

function getDisplaySymbols() {
  let symbols = state.watchlist.filter(passesMarketFilter);

  if (state.sortBy === 'added') return symbols;

  return [...symbols].sort((a, b) => {
    const pa = state.prices[a];
    const pb = state.prices[b];
    switch (state.sortBy) {
      case 'change':
        return (pb?.pctChange ?? 0) - (pa?.pctChange ?? 0);
      case 'price':
        return (pb?.price ?? 0) - (pa?.price ?? 0);
      case 'symbol':
        return a.localeCompare(b);
      case 'pnl': {
        const pa = getPosition(a);
        const pb = getPosition(b);
        return (pb?.pnlPct ?? -Infinity) - (pa?.pnlPct ?? -Infinity);
      }
      default:
        return 0;
    }
  });
}

function setSortBy(value) {
  state.sortBy = value;
  localStorage.setItem('sp_sort', value);
  renderWatchlist();
}

function setFilterMarket(value) {
  state.filterMarket = value;
  localStorage.setItem('sp_filter', value);
  renderWatchlist();
}

/* ============================================================
   Render
   ============================================================ */
function renderWatchlist() {
  const grid = document.getElementById('watchlistGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('stockCount');
  const toolbar = document.getElementById('watchlistToolbar');

  const display = getDisplaySymbols();
  const total = state.watchlist.length;

  if (total === 0) {
    count.textContent = '0 종목';
    if (toolbar) toolbar.classList.add('hidden');
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  if (toolbar) toolbar.classList.remove('hidden');
  count.textContent = display.length === total
    ? `${total} 종목`
    : `${display.length} / ${total} 종목`;

  if (display.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('.empty-title').textContent = '필터 조건에 맞는 종목이 없습니다';
    empty.querySelector('.empty-desc').textContent = '시장 필터를 변경해 보세요';
    return;
  }

  empty.classList.add('hidden');
  if (empty.querySelector('.empty-title')) {
    empty.querySelector('.empty-title').textContent = '아직 추가된 종목이 없습니다';
    empty.querySelector('.empty-desc').textContent = '위의 검색창에서 종목을 추가해보세요';
  }

  display.forEach(symbol => {
    if (!document.getElementById(`card-${symbol}`)) {
      grid.appendChild(createCardElement(symbol));
    }
    updateCardUI(symbol);
  });

  display.forEach(symbol => {
    const card = document.getElementById(`card-${symbol}`);
    const node = card?.closest('.stock-card-wrap') || card;
    if (node) grid.appendChild(node);
  });

  grid.querySelectorAll('.stock-card-wrap').forEach((wrap) => {
    const sym = wrap.dataset.symbol;
    if (!display.includes(sym)) wrap.remove();
  });

  renderPortfolioSummary();
}

function createCardElement(symbol) {
  const wrap = document.createElement('div');
  wrap.className = 'stock-card-wrap';
  wrap.dataset.symbol = symbol;

  const div = document.createElement('div');
  div.className = 'stock-card loading';
  div.id = `card-${symbol}`;
  div.dataset.symbol = symbol;
  div.onclick = () => openModal(symbol);
  div.innerHTML = `
    <div class="card-header">
      <div class="card-symbol-group">
        <div class="stock-logo" id="logo-${symbol}">${symbol.slice(0, 2)}</div>
        <div>
          <div class="card-name" id="name-${symbol}">${STOCK_NAMES[symbol] || '로딩 중...'}</div>
          <div class="card-symbol">${symbol}</div>
        </div>
      </div>
      <div class="card-actions">
        <span class="card-alert-icon hidden" id="alert-icon-${symbol}" title="알림 설정됨">🔔</span>
        <button class="card-action-btn" title="삭제" onclick="event.stopPropagation(); removeStock('${symbol}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="mini-chart-container">
      <canvas id="mini-${symbol}"></canvas>
    </div>
    <div class="card-error" id="error-${symbol}" hidden>
      <span>시세를 불러오지 못했습니다</span>
      <button type="button" class="card-retry-btn" onclick="event.stopPropagation(); retryStock('${symbol}')">재시도</button>
    </div>
    <div class="card-portfolio" id="pf-card-${symbol}" hidden>
      <span class="card-pf-label">보유</span>
      <span class="card-pf-pnl" id="pf-pnl-${symbol}">--</span>
    </div>
    <div class="card-price-row">
      <div class="card-price" id="price-${symbol}">--</div>
      <div class="card-change-group">
        <div class="card-change neutral" id="change-${symbol}">--</div>
        <div class="card-volume" id="vol-${symbol}">Vol: --</div>
      </div>
    </div>
  `;

  const delHint = document.createElement('div');
  delHint.className = 'card-swipe-delete';
  delHint.textContent = '삭제';
  wrap.appendChild(delHint);
  wrap.appendChild(div);
  initCardSwipe(wrap);
  return wrap;
}

function updateCardUI(symbol) {
  const data = state.prices[symbol];
  if (!data) return;

  const priceEl = document.getElementById(`price-${symbol}`);
  const changeEl = document.getElementById(`change-${symbol}`);
  const volEl = document.getElementById(`vol-${symbol}`);

  if (!priceEl) return;

  const prevPrice = data.prevPrice || data.price;
  const isUp = data.price >= prevPrice;

  // Flash effect
  priceEl.classList.remove('flash-green', 'flash-red', 'price-updated');
  void priceEl.offsetWidth; // reflow
  priceEl.classList.add(isUp ? 'flash-green' : 'flash-red', 'price-updated');

  setTimeout(() => {
    priceEl.classList.remove('flash-green', 'flash-red');
  }, 600);

  priceEl.textContent = formatPriceLocale(data.price, symbol);

  const pct = data.pctChange || 0;
  const chg = data.change || 0;
  const sign = chg >= 0 ? '+' : '';
  const chgFmt = isKoreanSymbol(symbol)
    ? `${sign}${Math.round(chg).toLocaleString('ko-KR')} (${sign}${pct.toFixed(2)}%)`
    : `${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  changeEl.textContent = chgFmt;
  changeEl.className = `card-change ${chg >= 0 ? 'positive' : 'negative'}`;

  if (data.volume) {
    volEl.textContent = `Vol: ${formatVolume(data.volume)}`;
  }

  drawMiniChart(symbol);
  updateCardPortfolioRow(symbol);
  updateCardAlertIcon(symbol);
}

/* ============================================================
   Mini Chart
   ============================================================ */
function drawMiniChart(symbol) {
  const canvas = document.getElementById(`mini-${symbol}`);
  if (!canvas) return;
  const history = state.history[symbol];
  if (!history || history.length < 2) return;

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || 280;
  canvas.height = 56;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const prices = history;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 4;

  const isPositive = prices[prices.length - 1] >= prices[0];
  const color = isPositive ? '#10d9a0' : '#f43f5e';
  const gradColor = isPositive ? 'rgba(16,217,160,' : 'rgba(244,63,94,';

  // Build path
  const pts = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - pad * 2),
    y: h - pad - ((p - min) / range) * (h - pad * 2)
  }));

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, gradColor + '0.25)');
  grad.addColorStop(1, gradColor + '0)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, h);
  pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Dot at end
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ============================================================
   Portfolio
   ============================================================ */
function savePortfolioStore() {
  localStorage.setItem('sp_portfolio', JSON.stringify(state.portfolio));
}

function getHolding(symbol) {
  return state.portfolio[symbol] || null;
}

function setHolding(symbol, shares, avgCost) {
  if (shares > 0 && avgCost > 0) {
    state.portfolio[symbol] = { shares, avgCost };
  } else {
    delete state.portfolio[symbol];
  }
  savePortfolioStore();
}

function getPosition(symbol) {
  const h = getHolding(symbol);
  if (!h || h.shares <= 0 || h.avgCost <= 0) return null;
  const price = state.prices[symbol]?.price;
  if (price == null) {
    return { ...h, price: null, cost: h.shares * h.avgCost, value: null, pnl: null, pnlPct: null };
  }
  const cost = h.shares * h.avgCost;
  const value = h.shares * price;
  const pnl = value - cost;
  return { shares: h.shares, avgCost: h.avgCost, price, cost, value, pnl, pnlPct: cost > 0 ? (pnl / cost) * 100 : 0 };
}

function computePortfolioSummary() {
  const us = { cost: 0, value: 0, count: 0 };
  const kr = { cost: 0, value: 0, count: 0 };

  for (const symbol of state.watchlist) {
    const pos = getPosition(symbol);
    if (!pos || pos.value == null) continue;
    const bucket = isKoreanSymbol(symbol) ? kr : us;
    bucket.cost += pos.cost;
    bucket.value += pos.value;
    bucket.count += 1;
  }

  const enrich = (b) => ({
    ...b,
    pnl: b.value - b.cost,
    pnlPct: b.cost > 0 ? ((b.value - b.cost) / b.cost) * 100 : 0,
  });

  const summary = { us: enrich(us), kr: enrich(kr) };
  summary.hasAny = summary.us.count + summary.kr.count > 0;

  const rate = state.usdKrwRate;
  if (summary.hasAny && rate && summary.us.count > 0 && summary.kr.count > 0) {
    const costKrw = summary.kr.cost + summary.us.cost * rate;
    const valueKrw = summary.kr.value + summary.us.value * rate;
    summary.combined = {
      cost: costKrw,
      value: valueKrw,
      pnl: valueKrw - costKrw,
      pnlPct: costKrw > 0 ? ((valueKrw - costKrw) / costKrw) * 100 : 0,
      count: summary.us.count + summary.kr.count,
      rate,
      fxDate: state.fxDate,
    };
  } else {
    summary.combined = null;
  }

  return summary;
}

function formatMoney(amount, symbol, signed = false) {
  if (amount == null || Number.isNaN(amount)) return '--';
  const cur = getCurrencySymbol(symbol);
  const sign = signed && amount > 0 ? '+' : '';
  const abs = Math.abs(amount);
  const formatted = isKoreanSymbol(symbol)
    ? Math.round(abs).toLocaleString('ko-KR')
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${cur}${formatted}`;
}

function formatPnlText(pnl, pnlPct, symbol) {
  if (pnl == null) return '--';
  const sign = pnl >= 0 ? '+' : '';
  const pct = pnlPct != null ? ` (${sign}${pnlPct.toFixed(2)}%)` : '';
  return `${formatMoney(pnl, symbol, true)}${pct}`;
}

function renderPortfolioSummary() {
  const section = document.getElementById('portfolioSection');
  const grid = document.getElementById('portfolioSummary');
  const countEl = document.getElementById('portfolioHoldingCount');
  if (!section || !grid) return;

  const s = computePortfolioSummary();
  if (!s.hasAny) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const totalCount = s.us.count + s.kr.count;
  if (countEl) countEl.textContent = `${totalCount} 종목 보유`;

  const cards = [];
  if (s.combined) {
    const fxLabel = s.combined.fxDate
      ? ` · ${s.combined.fxDate} $1=${s.combined.rate.toLocaleString('ko-KR')}원`
      : '';
    cards.push(renderSummaryCard(`🌐 통합 (원화)${fxLabel}`, s.combined, true, true));
  }
  if (s.us.count > 0) cards.push(renderSummaryCard('🇺🇸 미국', s.us, false));
  if (s.kr.count > 0) cards.push(renderSummaryCard('🇰🇷 한국', s.kr, true));
  grid.innerHTML = cards.join('');
}

function renderSummaryCard(title, data, isKr, isCombined = false) {
  const pnlClass = data.pnl >= 0 ? 'positive' : 'negative';
  const fmt = (n) => isKr
    ? '₩' + Math.round(n).toLocaleString('ko-KR')
    : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = data.pnl >= 0 ? '+' : '';
  const extraClass = isCombined ? ' portfolio-summary-card--combined' : '';
  return `
    <div class="portfolio-summary-card${extraClass}">
      <div class="pf-summary-title">${title} <span class="pf-summary-count">${data.count}종목</span></div>
      <div class="pf-summary-row"><span>매입</span><span>${fmt(data.cost)}</span></div>
      <div class="pf-summary-row"><span>평가</span><span>${fmt(data.value)}</span></div>
      <div class="pf-summary-row pf-summary-pnl ${pnlClass}">
        <span>손익</span>
        <span>${sign}${fmt(Math.abs(data.pnl))} (${sign}${data.pnlPct.toFixed(2)}%)</span>
      </div>
    </div>
  `;
}

function updateCardPortfolioRow(symbol) {
  const row = document.getElementById(`pf-card-${symbol}`);
  const pnlEl = document.getElementById(`pf-pnl-${symbol}`);
  if (!row || !pnlEl) return;

  const pos = getPosition(symbol);
  if (!pos || pos.pnl == null) {
    row.hidden = true;
    return;
  }

  row.hidden = false;
  pnlEl.textContent = formatPnlText(pos.pnl, pos.pnlPct, symbol);
  pnlEl.className = `card-pf-pnl ${pos.pnl >= 0 ? 'positive' : 'negative'}`;
}

function loadPortfolioForm(symbol) {
  const h = getHolding(symbol);
  const sharesEl = document.getElementById('pfShares');
  const avgEl = document.getElementById('pfAvgCost');
  if (sharesEl) sharesEl.value = h?.shares ?? '';
  if (avgEl) avgEl.value = h?.avgCost ?? '';
  updatePortfolioPreview();
}

function updatePortfolioPreview() {
  const symbol = state.modalSymbol;
  if (!symbol) return;

  const shares = parseFloat(document.getElementById('pfShares')?.value);
  const avgCost = parseFloat(document.getElementById('pfAvgCost')?.value);
  const costEl = document.getElementById('pfPreviewCost');
  const valueEl = document.getElementById('pfPreviewValue');
  const pnlEl = document.getElementById('pfPreviewPnl');
  if (!costEl || !valueEl || !pnlEl) return;

  if (!shares || shares <= 0 || !avgCost || avgCost <= 0) {
    costEl.textContent = '--';
    valueEl.textContent = '--';
    pnlEl.textContent = '--';
    pnlEl.className = 'pf-preview-pnl-val';
    return;
  }

  const price = state.prices[symbol]?.price;
  const cost = shares * avgCost;
  costEl.textContent = formatMoney(cost, symbol);

  if (price == null) {
    valueEl.textContent = '--';
    pnlEl.textContent = '--';
    return;
  }

  const value = shares * price;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  valueEl.textContent = formatMoney(value, symbol);
  pnlEl.textContent = formatPnlText(pnl, pnlPct, symbol);
  pnlEl.className = `pf-preview-pnl-val ${pnl >= 0 ? 'positive' : 'negative'}`;
}

function savePortfolioFromModal() {
  const symbol = state.modalSymbol;
  if (!symbol) return;

  const shares = parseFloat(document.getElementById('pfShares')?.value);
  const avgCost = parseFloat(document.getElementById('pfAvgCost')?.value);

  if (!shares || shares <= 0) {
    delete state.portfolio[symbol];
    savePortfolioStore();
    showToast(`${symbol} 보유 정보가 삭제되었습니다`, 'info');
  } else if (!avgCost || avgCost <= 0) {
    showToast('평균 매수가를 입력해 주세요', 'error');
    return;
  } else {
    setHolding(symbol, shares, avgCost);
    showToast(`${symbol} 보유 정보 저장됨`, 'success');
  }

  updateCardPortfolioRow(symbol);
  renderPortfolioSummary();
  if (state.sortBy === 'pnl') renderWatchlist();
}

/* ============================================================
   Price alerts
   ============================================================ */
function saveAlertsStore() {
  localStorage.setItem('sp_alerts', JSON.stringify(state.alerts));
}

function getAlert(symbol) {
  return state.alerts[symbol] || null;
}

function getAlertArmed(symbol) {
  if (!state.alertArmed[symbol]) {
    state.alertArmed[symbol] = { price: true, pct: true };
  }
  return state.alertArmed[symbol];
}

function countActiveAlerts() {
  return Object.values(state.alerts).filter((a) => a?.enabled).length;
}

function updateAlertBellUI() {
  const badge = document.getElementById('alertBellBadge');
  const btn = document.getElementById('alertBellBtn');
  if (!badge || !btn) return;

  const count = countActiveAlerts();
  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  const hasNotif = 'Notification' in window;
  const perm = hasNotif ? Notification.permission : 'denied';
  btn.classList.toggle('granted', perm === 'granted');
  btn.classList.toggle('denied', perm === 'denied');

  const hint = document.getElementById('alertPermissionHint');
  if (hint) {
    if (!hasNotif) {
      hint.textContent = '이 브라우저는 알림을 지원하지 않습니다.';
    } else if (perm === 'granted') {
      hint.textContent = '브라우저 알림이 활성화되어 있습니다.';
    } else if (Notification.permission === 'denied') {
      hint.textContent = '알림이 차단되었습니다. 브라우저 설정에서 허용해 주세요.';
    } else {
      hint.textContent = '브라우저 알림을 켜려면 헤더의 🔔 버튼을 누르세요.';
    }
  }
}

async function requestAlertPermission() {
  if (!('Notification' in window)) {
    showToast('이 브라우저는 알림을 지원하지 않습니다', 'error');
    return false;
  }
  if (Notification.permission === 'granted') {
    showToast('알림이 이미 활성화되어 있습니다', 'info');
    updateAlertBellUI();
    return true;
  }
  const perm = await Notification.requestPermission();
  updateAlertBellUI();
  if (perm === 'granted') {
    showToast('가격 알림을 받을 수 있습니다', 'success');
    return true;
  }
  showToast('알림 권한이 거부되었습니다', 'error');
  return false;
}

function sendStockNotification(symbol, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(`StockPulse — ${symbol}`, {
      body,
      tag: `stockpulse-${symbol}`,
    });
  } catch { /* ignore */ }
}

function checkAlerts(symbol) {
  const alert = getAlert(symbol);
  if (!alert?.enabled) return;

  const data = state.prices[symbol];
  if (!data?.price) return;

  const armed = getAlertArmed(symbol);
  const cur = getCurrencySymbol(symbol);
  const priceStr = formatPriceLocale(data.price, symbol);

  if (alert.priceTarget != null && alert.priceTarget > 0) {
    const hit = alert.priceDir === 'below'
      ? data.price <= alert.priceTarget
      : data.price >= alert.priceTarget;

    if (hit && armed.price) {
      const cond = alert.priceDir === 'below' ? '이하' : '이상';
      sendStockNotification(
        symbol,
        `목표가 도달: ${cur}${priceStr} (${cond} ${formatPriceLocale(alert.priceTarget, symbol)})`
      );
      showToast(`${symbol} 목표가 알림`, 'info');
      armed.price = false;
    } else if (!hit) {
      armed.price = true;
    }
  }

  if (alert.pctThreshold != null && alert.pctThreshold > 0) {
    const pct = data.pctChange ?? 0;
    let hit = false;
    if (alert.pctDir === 'up') hit = pct >= alert.pctThreshold;
    else if (alert.pctDir === 'down') hit = pct <= -alert.pctThreshold;
    else hit = Math.abs(pct) >= alert.pctThreshold;

    if (hit && armed.pct) {
      const sign = pct >= 0 ? '+' : '';
      sendStockNotification(symbol, `등락률 알림: ${sign}${pct.toFixed(2)}% (현재 ${cur}${priceStr})`);
      showToast(`${symbol} 등락률 알림`, 'info');
      armed.pct = false;
    } else if (!hit) {
      armed.pct = true;
    }
  }

  updateCardAlertIcon(symbol);
}

function updateCardAlertIcon(symbol) {
  const el = document.getElementById(`alert-icon-${symbol}`);
  if (!el) return;
  const on = getAlert(symbol)?.enabled;
  el.classList.toggle('hidden', !on);
}

function loadAlertForm(symbol) {
  const alert = getAlert(symbol);
  const enabledEl = document.getElementById('alertEnabled');
  const formEl = document.getElementById('alertForm');

  if (enabledEl) enabledEl.checked = Boolean(alert?.enabled);
  if (formEl) formEl.classList.toggle('disabled', !alert?.enabled);

  document.getElementById('alertPriceTarget').value = alert?.priceTarget ?? '';
  document.getElementById('alertPriceDir').value = alert?.priceDir || 'above';
  document.getElementById('alertPctThreshold').value = alert?.pctThreshold ?? '';
  document.getElementById('alertPctDir').value = alert?.pctDir || 'abs';

  updateAlertBellUI();
}

function toggleAlertEnabled() {
  const enabled = document.getElementById('alertEnabled')?.checked;
  const formEl = document.getElementById('alertForm');
  if (formEl) formEl.classList.toggle('disabled', !enabled);
}

function saveAlertFromModal() {
  const symbol = state.modalSymbol;
  if (!symbol) return;

  const enabled = document.getElementById('alertEnabled')?.checked;
  const priceTarget = parseFloat(document.getElementById('alertPriceTarget')?.value);
  const pctThreshold = parseFloat(document.getElementById('alertPctThreshold')?.value);
  const priceDir = document.getElementById('alertPriceDir')?.value || 'above';
  const pctDir = document.getElementById('alertPctDir')?.value || 'abs';

  if (!enabled) {
    delete state.alerts[symbol];
    delete state.alertArmed[symbol];
    saveAlertsStore();
    showToast(`${symbol} 알림이 해제되었습니다`, 'info');
  } else if (
    (Number.isNaN(priceTarget) || priceTarget <= 0) &&
    (Number.isNaN(pctThreshold) || pctThreshold <= 0)
  ) {
    showToast('목표가 또는 등락률 중 하나 이상을 입력하세요', 'error');
    return;
  } else {
    state.alerts[symbol] = {
      enabled: true,
      priceTarget: !Number.isNaN(priceTarget) && priceTarget > 0 ? priceTarget : null,
      priceDir,
      pctThreshold: !Number.isNaN(pctThreshold) && pctThreshold > 0 ? pctThreshold : null,
      pctDir,
    };
    state.alertArmed[symbol] = { price: true, pct: true };
    saveAlertsStore();
    showToast(`${symbol} 알림이 저장되었습니다`, 'success');

    if (Notification.permission !== 'granted') {
      showToast('브라우저 알림 권한을 허용하면 푸시 알림을 받을 수 있습니다', 'info');
    }
  }

  updateCardAlertIcon(symbol);
  updateAlertBellUI();
}

/* ============================================================
   Modal
   ============================================================ */
async function openModal(symbol) {
  state.modalSymbol = symbol;
  const data = state.prices[symbol];

  document.getElementById('modalSymbol').textContent = symbol;
  document.getElementById('modalName').textContent = STOCK_NAMES[symbol] || '';
  updateModalPrice(symbol);

  // Stats
  if (data) {
    const cur = getCurrencySymbol(symbol);
    document.getElementById('statOpen').textContent = data.open ? `${cur}${formatPriceLocale(data.open, symbol)}` : '--';
    document.getElementById('statHigh').textContent = data.high ? `${cur}${formatPriceLocale(data.high, symbol)}` : '--';
    document.getElementById('statLow').textContent = data.low ? `${cur}${formatPriceLocale(data.low, symbol)}` : '--';
    document.getElementById('statVolume').textContent = data.volume ? formatVolume(data.volume) : '--';
  }

  document.getElementById('statMktCap').textContent = '--';
  document.getElementById('statPE').textContent = '--';

  state.modalChartPreset = 'intraday';
  state.modalChartType = 'line';
  updateChartControlButtons();
  loadPortfolioForm(symbol);
  loadAlertForm(symbol);
  resetModalExtras();
  ensureModalOnBody();
  const overlay = document.getElementById('modalOverlay');
  const scrollEl = document.getElementById('modalScroll');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (scrollEl) scrollEl.scrollTop = 0;
  overlay.scrollTop = 0;
  await loadModalChartData(symbol);
  loadModalNews(symbol);
  loadModalMetrics(symbol);

  const profile = await fetchProfile(symbol);
  const dataAfter = state.prices[symbol];
  if (profile?.name) {
    document.getElementById('modalName').textContent = profile.name;
  }
  const mktCapEl = document.getElementById('statMktCap');
  if (profile?.marketCapitalization) {
    mktCapEl.textContent = formatMarketCap(profile.marketCapitalization, symbol);
    mktCapEl.title = '';
  } else if (profile?.marketCap) {
    mktCapEl.textContent = formatAbsoluteMarketCap(profile.marketCap, symbol);
    mktCapEl.title = '';
  } else if (dataAfter?.marketCap) {
    mktCapEl.textContent = formatAbsoluteMarketCap(dataAfter.marketCap, symbol);
    mktCapEl.title = '';
  } else if (isKoreanSymbol(symbol)) {
    mktCapEl.textContent = '미제공';
    mktCapEl.title = 'Yahoo Finance에서 시가총액을 제공하지 않는 경우가 있습니다.';
  }
  const pe = profile?.trailingPE ?? dataAfter?.trailingPE;
  if (pe != null && !Number.isNaN(pe)) {
    document.getElementById('statPE').textContent = Number(pe).toFixed(2);
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  state.modalSymbol = null;
  state.modalOhlc = [];
  state.modalLineCloses = [];
}

function updateModalPrice(symbol) {
  const data = state.prices[symbol];
  if (!data) return;
  const cur = getCurrencySymbol(symbol);
  document.getElementById('modalPrice').textContent = `${cur}${formatPriceLocale(data.price, symbol)}`;
  const chg = data.change || 0;
  const pct = data.pctChange || 0;
  const sign = chg >= 0 ? '+' : '';
  const changeEl = document.getElementById('modalChange');
  const chgFmt = isKoreanSymbol(symbol)
    ? `${sign}${Math.round(chg).toLocaleString('ko-KR')} (${sign}${pct.toFixed(2)}%)`
    : `${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  changeEl.textContent = chgFmt;
  changeEl.className = `modal-change ${chg >= 0 ? 'positive' : 'negative'}`;

  if (state.modalSymbol === symbol) {
    drawModalChart(symbol);
    updatePortfolioPreview();
  }
}

async function loadModalChartData(symbol) {
  const preset = CHART_PRESETS[state.modalChartPreset] || CHART_PRESETS.intraday;
  const { closes, ohlc } = await fetchChartData(symbol, preset.interval, preset.range, true);
  state.modalLineCloses = closes;
  state.modalOhlc = ohlc;
  if (state.modalSymbol === symbol) {
    drawModalChart(symbol);
    updatePortfolioPreview();
  }
}

function setModalChartPreset(preset) {
  if (!CHART_PRESETS[preset] || !state.modalSymbol) return;
  state.modalChartPreset = preset;
  const def = CHART_PRESETS[preset].defaultType;
  if (preset !== 'intraday') state.modalChartType = def;
  updateChartControlButtons();
  loadModalChartData(state.modalSymbol);
}

function setModalChartType(type) {
  if (!state.modalSymbol) return;
  state.modalChartType = type;
  updateChartControlButtons();
  drawModalChart(state.modalSymbol);
}

function updateChartControlButtons() {
  document.querySelectorAll('.chart-range-btns .chart-ctrl-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === state.modalChartPreset);
  });
  document.getElementById('chartTypeLine')?.classList.toggle('active', state.modalChartType === 'line');
  document.getElementById('chartTypeCandle')?.classList.toggle('active', state.modalChartType === 'candle');
}

function drawModalChart(symbol) {
  const canvas = document.getElementById('modalChart');
  if (!canvas) return;
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width > 0 ? rect.width - 32 : 540;
  canvas.height = 168;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const useCandle = state.modalChartType === 'candle' && state.modalOhlc.length >= 2;
  if (useCandle) {
    drawCandlestickChart(ctx, canvas.width, canvas.height, state.modalOhlc);
    return;
  }

  const prices = state.modalLineCloses.length >= 2
    ? state.modalLineCloses
    : (state.history[symbol] || []);
  drawModalLineChart(ctx, canvas.width, canvas.height, prices);
}

function drawModalLineChart(ctx, w, h, prices) {
  if (!prices || prices.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4a5a78';
    ctx.font = '13px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('데이터 수집 중...', w / 2, h / 2);
    return;
  }

  const min = Math.min(...prices) * 0.999;
  const max = Math.max(...prices) * 1.001;
  const range = max - min || 1;
  const padX = 8;
  const padY = 12;
  const isPositive = prices[prices.length - 1] >= prices[0];
  const color = isPositive ? '#10d9a0' : '#f43f5e';
  const gradColor = isPositive ? 'rgba(16,217,160,' : 'rgba(244,63,94,';

  const pts = prices.map((p, i) => ({
    x: padX + (i / (prices.length - 1)) * (w - padX * 2),
    y: padY + (1 - (p - min) / range) * (h - padY * 2),
  }));

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = padY + (h - padY * 2) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, gradColor + '0.3)');
  grad.addColorStop(1, gradColor + '0)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, h);
  pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(pts[pts.length - 1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  const last = pts[pts.length - 1];
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = color + '66';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, last.y);
  ctx.lineTo(w - padX, last.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCandlestickChart(ctx, w, h, ohlc) {
  if (!ohlc || ohlc.length < 2) {
    drawModalLineChart(ctx, w, h, []);
    return;
  }

  const padX = 12;
  const padY = 14;
  const lows = ohlc.map(b => b.l);
  const highs = ohlc.map(b => b.h);
  const min = Math.min(...lows) * 0.998;
  const max = Math.max(...highs) * 1.002;
  const range = max - min || 1;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;
  const slot = chartW / ohlc.length;
  const bodyW = Math.max(2, Math.min(slot * 0.65, 12));

  const yOf = (price) => padY + (1 - (price - min) / range) * chartH;

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = padY + chartH * (i / 4);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
  }

  ohlc.forEach((bar, i) => {
    const x = padX + slot * i + slot / 2;
    const up = bar.c >= bar.o;
    const color = up ? '#10d9a0' : '#f43f5e';
    const yHigh = yOf(bar.h);
    const yLow = yOf(bar.l);
    const yOpen = yOf(bar.o);
    const yClose = yOf(bar.c);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const top = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = color;
    ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH);
  });
}

/* ============================================================
   Toast
   ============================================================ */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-dot"></span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   Helpers
   ============================================================ */
// Legacy wrapper kept for backward compatibility
function formatPrice(price) {
  if (!price && price !== 0) return '--';
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(vol) {
  if (!vol) return '--';
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toString();
}

function formatMarketCap(mc, symbol) {
  // Finnhub: millions
  return formatAbsoluteMarketCap(mc * 1e6, symbol);
}

function formatAbsoluteMarketCap(val, symbol, options = {}) {
  const { naLabel } = options;
  const cur = symbol ? getCurrencySymbol(symbol) : '$';
  if (!val) {
    if (naLabel) return naLabel;
    if (symbol && isKoreanSymbol(symbol)) return '미제공';
    return '--';
  }
  if (val >= 1e12) return cur + (val / 1e12).toFixed(2) + '조';
  if (val >= 1e9) return cur + (val / 1e9).toFixed(1) + '십억';
  if (val >= 1e6) return cur + (val / 1e6).toFixed(1) + '백만';
  return cur + val.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

/* ============================================================
   Market Tab Switching
   ============================================================ */
function switchMarket(market) {
  activeMarket = market;
  document.querySelectorAll('.market-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${market}`).classList.add('active');

  const krTabs = document.getElementById('krExchangeTabs');
  if (krTabs) krTabs.classList.toggle('hidden', market !== 'KR');

  const input = document.getElementById('searchInput');
  if (market === 'KR') {
    input.placeholder = `종목 코드 (예: 005930, 카카오) — ${getKrSuffix()} 자동 추가`;
  } else {
    input.placeholder = '종목 코드 입력 (예: AAPL, TSLA, NVDA...)';
  }

  renderPopularChips(market);
}

function switchKrExchange(suffix) {
  activeKrSuffix = suffix;
  document.querySelectorAll('.kr-exchange-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`kr-tab-${suffix}`).classList.add('active');
  if (activeMarket === 'KR') {
    const input = document.getElementById('searchInput');
    input.placeholder = `종목 코드 (예: 005930) — ${getKrSuffix()} 자동 추가`;
    renderPopularChips('KR');
  }
}

function renderPopularChips(market) {
  const container = document.getElementById('popularChips');
  const chipsKR_KS = [
    { sym: '005930.KS', label: '삼성전자' },
    { sym: '000660.KS', label: 'SK하이닉스' },
    { sym: '035420.KS', label: 'NAVER' },
    { sym: '035720.KS', label: '카카오' },
    { sym: '005380.KS', label: '현대차' },
    { sym: '000270.KS', label: '기아' },
    { sym: '068270.KS', label: '셀트리온' },
  ];
  const chipsKR_KQ = [
    { sym: '035900.KQ', label: 'JYP' },
    { sym: '293490.KQ', label: '카카오게임즈' },
    { sym: '263750.KQ', label: '펄어비스' },
    { sym: '352820.KQ', label: '하이브' },
    { sym: '041510.KQ', label: 'SM' },
    { sym: '247540.KQ', label: '에코프로비엠' },
    { sym: '086520.KQ', label: '에코프로' },
  ];
  const chips = market === 'KR'
    ? (activeKrSuffix === 'KQ' ? chipsKR_KQ : chipsKR_KS)
    : [
        { sym: 'AAPL', label: 'AAPL' },
        { sym: 'TSLA', label: 'TSLA' },
        { sym: 'NVDA', label: 'NVDA' },
        { sym: 'MSFT', label: 'MSFT' },
        { sym: 'GOOGL', label: 'GOOGL' },
        { sym: 'AMZN', label: 'AMZN' },
        { sym: 'META', label: 'META' },
      ];
  container.innerHTML = chips
    .map(c => `<button class="chip" onclick="addStock('${c.sym}')">${c.label}</button>`)
    .join('');
}

/* ============================================================
   P3 — Theme, share, backup, news, metrics, PWA, swipe
   ============================================================ */
const THEME_KEY = 'sp_theme';

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#f1f5f9' : '#080c14';
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.title = t === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환';
    btn.setAttribute('aria-label', btn.title);
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function parseWatchlistFromUrl() {
  const raw = new URLSearchParams(location.search).get('watchlist');
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
}

function encodeSharePayload(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSharePayload(encoded) {
  let b64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function filterStoreByWatchlist(store) {
  const out = {};
  for (const sym of state.watchlist) {
    if (store[sym]) out[sym] = store[sym];
  }
  return out;
}

function parseShareFromUrl() {
  const params = new URLSearchParams(location.search);
  const watchlist = parseWatchlistFromUrl();
  let portfolio = null;
  let alerts = null;
  if (params.get('pf')) {
    try {
      portfolio = decodeSharePayload(params.get('pf'));
    } catch {
      /* ignore */
    }
  }
  if (params.get('al')) {
    try {
      alerts = decodeSharePayload(params.get('al'));
    } catch {
      /* ignore */
    }
  }
  return { watchlist, portfolio, alerts };
}

function buildShareUrl(includePf, includeAl) {
  const params = new URLSearchParams();
  params.set('watchlist', state.watchlist.join(','));
  if (includePf) {
    const pf = filterStoreByWatchlist(state.portfolio);
    if (Object.keys(pf).length) params.set('pf', encodeSharePayload(pf));
  }
  if (includeAl) {
    const al = filterStoreByWatchlist(state.alerts);
    if (Object.keys(al).length) params.set('al', encodeSharePayload(al));
  }
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

function toggleSharePanel(e) {
  e.stopPropagation();
  if (!state.watchlist.length) {
    showToast('공유할 종목이 없습니다', 'info');
    return;
  }
  const panel = document.getElementById('sharePanel');
  const hasPf = state.watchlist.some((s) => (state.portfolio[s]?.shares || 0) > 0);
  const hasAl = state.watchlist.some((s) => state.alerts[s]);
  const pfCb = document.getElementById('shareIncludePf');
  const alCb = document.getElementById('shareIncludeAl');
  if (pfCb) {
    pfCb.disabled = !hasPf;
    pfCb.checked = hasPf;
  }
  if (alCb) {
    alCb.disabled = !hasAl;
    alCb.checked = hasAl;
  }
  panel?.classList.toggle('hidden');
}

function hideSharePanel() {
  document.getElementById('sharePanel')?.classList.add('hidden');
}

function confirmShareUrl() {
  if (!state.watchlist.length) {
    showToast('공유할 종목이 없습니다', 'info');
    return;
  }
  const includePf = document.getElementById('shareIncludePf')?.checked ?? false;
  const includeAl = document.getElementById('shareIncludeAl')?.checked ?? false;
  const url = buildShareUrl(includePf, includeAl);
  hideSharePanel();
  const parts = ['관심목록'];
  if (includePf) parts.push('포트폴리오');
  if (includeAl) parts.push('알림');
  const msg = `${parts.join('·')} 링크가 복사되었습니다`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast(msg, 'success'),
      () => showToast(url, 'info')
    );
  } else {
    showToast(url, 'info');
  }
}

async function refreshFxRate() {
  try {
    const res = await apiFetch(`${API_BASE}/api/fx?from=USD&to=KRW`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.rate) {
      state.usdKrwRate = data.rate;
      state.fxDate = data.date;
      renderPortfolioSummary();
    }
  } catch {
    /* FX optional */
  }
}

function exportWatchlistData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    watchlist: state.watchlist,
    portfolio: state.portfolio,
    alerts: state.alerts,
    sortBy: state.sortBy,
    filterMarket: state.filterMarket,
    theme: localStorage.getItem(THEME_KEY) || 'dark',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `stockpulse-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('백업 파일을 저장했습니다', 'success');
}

async function importWatchlistData(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const list = Array.isArray(data.watchlist)
      ? data.watchlist.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];
    if (!list.length) {
      showToast('watchlist가 비어 있습니다', 'error');
      return;
    }
    const nextSet = new Set(list);
    for (const sym of [...state.watchlist]) {
      if (!nextSet.has(sym)) removeStock(sym, { silent: true });
    }
    if (data.portfolio && typeof data.portfolio === 'object') {
      state.portfolio = data.portfolio;
      localStorage.setItem('sp_portfolio', JSON.stringify(state.portfolio));
    }
    if (data.alerts && typeof data.alerts === 'object') {
      state.alerts = data.alerts;
      localStorage.setItem('sp_alerts', JSON.stringify(state.alerts));
    }
    if (data.sortBy) {
      state.sortBy = data.sortBy;
      localStorage.setItem('sp_sort', state.sortBy);
      const sortEl = document.getElementById('sortBy');
      if (sortEl) sortEl.value = state.sortBy;
    }
    if (data.filterMarket) {
      state.filterMarket = data.filterMarket;
      localStorage.setItem('sp_filter', state.filterMarket);
      const filterEl = document.getElementById('filterMarket');
      if (filterEl) filterEl.value = state.filterMarket;
    }
    if (data.theme === 'light' || data.theme === 'dark') {
      applyTheme(data.theme);
    }
    state.watchlist = [];
    localStorage.setItem('sp_watchlist', '[]');
    renderWatchlist();
    if (state.apiReady) {
      for (const sym of list) {
        if (!state.watchlist.includes(sym)) {
          await addStock(sym);
          await sleep(400);
        }
      }
    }
    renderPortfolioSummary();
    updateAlertBellUI();
    state.watchlist.forEach((sym) => updateCardAlertIcon(sym));
    showToast(`${list.length}개 종목을 복원했습니다`, 'success');
  } catch {
    showToast('JSON 파일을 읽을 수 없습니다', 'error');
  }
}

function resetModalExtras() {
  ['statEpsWrap', 'statRoeWrap', 'statBetaWrap', 'statDivWrap'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  const list = document.getElementById('modalNewsList');
  if (list) list.innerHTML = '<p class="modal-news-placeholder">불러오는 중...</p>';
}

async function loadModalNews(symbol) {
  const list = document.getElementById('modalNewsList');
  if (!list) return;
  if (isKoreanSymbol(symbol)) {
    list.innerHTML = '<p class="modal-news-placeholder">한국 종목은 뉴스 API를 지원하지 않습니다.</p>';
    return;
  }
  try {
    const res = await apiFetch(`/api/news?symbol=${encodeURIComponent(symbol)}`);
    if (res.status === 429) {
      list.innerHTML = '<p class="modal-news-placeholder">API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.</p>';
      return;
    }
    if (!res.ok) throw new Error('news failed');
    const items = await res.json();
    if (!items.length) {
      list.innerHTML = '<p class="modal-news-placeholder">최근 7일 뉴스가 없습니다.</p>';
      return;
    }
    list.innerHTML = items
      .map((n) => {
        const date = n.datetime
          ? new Date(n.datetime * 1000).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '';
        const safeUrl = n.url ? encodeURI(n.url) : '#';
        return `<a class="modal-news-item" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
          <div class="modal-news-headline">${escapeHtml(n.headline || '제목 없음')}</div>
          <span class="modal-news-meta">${escapeHtml(n.source || '')} ${date}</span>
        </a>`;
      })
      .join('');
  } catch {
    list.innerHTML = '<p class="modal-news-placeholder">뉴스를 불러오지 못했습니다.</p>';
  }
}

async function loadModalMetrics(symbol) {
  const hideExtras = () => {
    ['statEpsWrap', 'statRoeWrap', 'statBetaWrap', 'statDivWrap'].forEach((id) => {
      document.getElementById(id)?.classList.add('hidden');
    });
  };
  if (isKoreanSymbol(symbol)) {
    hideExtras();
    return;
  }
  try {
    const res = await apiFetch(`/api/metrics?symbol=${encodeURIComponent(symbol)}`);
    if (res.status === 429) return;
    if (!res.ok) throw new Error('metrics failed');
    const m = await res.json();
    if (!m) {
      hideExtras();
      return;
    }
    if (m.pe != null) document.getElementById('statPE').textContent = Number(m.pe).toFixed(2);
    if (m.eps != null) {
      document.getElementById('statEPS').textContent = Number(m.eps).toFixed(2);
      document.getElementById('statEpsWrap')?.classList.remove('hidden');
    }
    if (m.roe != null) {
      document.getElementById('statROE').textContent = formatFinnhubPercent(m.roe, 1);
      document.getElementById('statRoeWrap')?.classList.remove('hidden');
    }
    if (m.beta != null) {
      document.getElementById('statBeta').textContent = Number(m.beta).toFixed(2);
      document.getElementById('statBetaWrap')?.classList.remove('hidden');
    }
    if (m.dividendYield != null) {
      document.getElementById('statDivYield').textContent = formatFinnhubPercent(m.dividendYield, 2);
      document.getElementById('statDivWrap')?.classList.remove('hidden');
    }
  } catch {
    hideExtras();
  }
}

function formatFinnhubPercent(value, decimals = 2) {
  const n = Number(value);
  if (Number.isNaN(n)) return '--';
  return `${n.toFixed(decimals)}%`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initCardSwipe(wrap) {
  const card = wrap.querySelector('.stock-card');
  if (!card || wrap._swipeInit) return;
  wrap._swipeInit = true;
  let startX = 0;
  let deltaX = 0;

  wrap.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      deltaX = 0;
      wrap.classList.add('swiping');
    },
    { passive: true }
  );

  wrap.addEventListener(
    'touchmove',
    (e) => {
      deltaX = e.touches[0].clientX - startX;
      if (deltaX < 0) {
        card.style.transform = `translateX(${Math.max(deltaX, -96)}px)`;
        wrap.classList.toggle('swipe-reveal', deltaX < -40);
      }
    },
    { passive: true }
  );

  const endSwipe = () => {
    wrap.classList.remove('swiping', 'swipe-reveal');
    if (deltaX < -80) {
      const sym = wrap.dataset.symbol;
      if (sym) removeStock(sym);
    }
    card.style.transform = '';
    deltaX = 0;
    startX = 0;
  };

  wrap.addEventListener('touchend', endSwipe);
  wrap.addEventListener('touchcancel', endSwipe);
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const share = parseShareFromUrl();
  const saved = share.watchlist.length ? share.watchlist : [...state.watchlist];
  if (share.watchlist.length) {
    localStorage.setItem('sp_watchlist', JSON.stringify(share.watchlist));
    const parts = ['관심목록'];
    if (share.portfolio && typeof share.portfolio === 'object') {
      Object.assign(state.portfolio, share.portfolio);
      localStorage.setItem('sp_portfolio', JSON.stringify(state.portfolio));
      parts.push('포트폴리오');
    }
    if (share.alerts && typeof share.alerts === 'object') {
      Object.assign(state.alerts, share.alerts);
      localStorage.setItem('sp_alerts', JSON.stringify(state.alerts));
      parts.push('알림');
    }
    showToast(`URL에서 ${parts.join('·')}을(를) 불러왔습니다`, 'info');
  }
  state.watchlist = [];
  await init();
  renderPortfolioSummary();
  updateAlertBellUI();
  state.watchlist.forEach((sym) => updateCardAlertIcon(sym));
  if (saved.length > 0 && state.apiReady) {
    for (const sym of saved) {
      await addStock(sym);
      await sleep(400);
    }
  }
});
