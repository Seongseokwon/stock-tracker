const path = require('path');
const KR_STOCKS = require(path.join(__dirname, 'data', 'kr-stocks.json'));

const HANGUL_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;

function hasHangul(text) {
  return HANGUL_RE.test(text);
}

function matchAlias(aliases, q) {
  if (!aliases?.length) return 0;
  for (const alias of aliases) {
    if (alias === q) return 100;
    if (alias.startsWith(q)) return 88;
    if (alias.includes(q)) return 72;
  }
  return 0;
}

function searchKrLocal(query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return [];

  const qu = q.toUpperCase();
  const scored = [];

  for (const row of KR_STOCKS) {
    const symbol = `${row.code}.${row.market}`;
    const name = row.name;
    let score = matchAlias(row.aliases, q);

    if (name === q) score = Math.max(score, 100);
    else if (name.startsWith(q)) score = Math.max(score, 85);
    else if (name.includes(q)) score = Math.max(score, 70);
    else if (row.code === q || row.code.startsWith(q)) score = Math.max(score, 75);
    else if (symbol.toUpperCase().includes(qu)) score = Math.max(score, 50);
    else if (!score) continue;

    const priority = row.priority ?? 999;
    scored.push({ symbol, name, score, priority });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.priority - b.priority ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name, 'ko')
    )
    .slice(0, limit)
    .map(({ symbol, name }) => ({ symbol, name }));
}

function mergeSearchResults(primary, secondary, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const item of [...primary, ...secondary]) {
    if (!item?.symbol || seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { KR_STOCKS, hasHangul, searchKrLocal, mergeSearchResults };
