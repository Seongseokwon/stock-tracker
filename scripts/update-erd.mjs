/**
 * ERD 문서 자동 재생성 스크립트
 *
 * migration SQL 파일들을 파싱해서 docs/ERD.md 를 갱신합니다.
 * Claude Code 훅 또는 수동으로 실행 가능합니다.
 *
 * 사용법:
 *   node scripts/update-erd.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'backend', 'migrations');
const ERD_PATH = path.join(ROOT, 'docs', 'ERD.md');

// ─── SQL 파싱 유틸 ───────────────────────────────────────────────

function parseMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const tables = {};
  const indexes = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    parseSql(sql, file, tables, indexes);
  }

  return { tables, indexes, files };
}

function parseSql(sql, filename, tables, indexes) {
  // CREATE TABLE IF NOT EXISTS ... (...)
  const tableRegex = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/gi;
  let m;
  while ((m = tableRegex.exec(sql)) !== null) {
    const tableName = m[1];
    const body = m[2];
    tables[tableName] = {
      filename,
      columns: parseColumns(body),
      constraints: parseConstraints(body),
    };
  }

  // CREATE INDEX IF NOT EXISTS ...
  const indexRegex = /CREATE INDEX IF NOT EXISTS (\w+)\s+ON (\w+)\(([^)]+)\)(\s+WHERE\s+[^;]+)?;/gi;
  while ((m = indexRegex.exec(sql)) !== null) {
    indexes.push({
      name: m[1],
      table: m[2],
      columns: m[3].trim(),
      condition: m[4] ? m[4].replace(/\s+/g, ' ').trim() : null,
    });
  }
}

function parseColumns(body) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const columns = [];
  for (const line of lines) {
    if (/^(UNIQUE|CHECK|PRIMARY KEY|CONSTRAINT|FOREIGN KEY)/i.test(line)) continue;
    if (/^\-\-/.test(line)) continue;
    const colMatch = line.match(/^(\w+)\s+([\w\[\]]+(?:\([^)]*\))?)/);
    if (colMatch) {
      const name = colMatch[1];
      const type = colMatch[2];
      const upper = line.toUpperCase();
      const constraints = [];
      if (upper.includes('PRIMARY KEY')) constraints.push('PK');
      if (upper.includes(' UNIQUE')) constraints.push('UK');
      if (upper.includes('REFERENCES')) {
        const ref = line.match(/REFERENCES\s+(\w+)\((\w+)\)/i);
        if (ref) constraints.push(`FK → ${ref[1]}.${ref[2]}`);
      }
      if (upper.includes('NOT NULL')) constraints.push('NOT NULL');
      if (upper.includes('DEFAULT')) {
        const def = line.match(/DEFAULT\s+([^,\n]+)/i);
        if (def) constraints.push(`DEFAULT ${def[1].trim()}`);
      }
      columns.push({ name, type, constraints });
    }
  }
  return columns;
}

function parseConstraints(body) {
  const constraints = [];
  const uniqueMatch = body.match(/UNIQUE\(([^)]+)\)/gi);
  if (uniqueMatch) {
    uniqueMatch.forEach(u => {
      const cols = u.match(/\(([^)]+)\)/)[1];
      constraints.push(`UNIQUE(${cols})`);
    });
  }
  const checkMatches = body.match(/CHECK\([^)]+\)/gi);
  if (checkMatches) {
    checkMatches.forEach(c => constraints.push(c.replace(/\s+/g, ' ')));
  }
  return constraints;
}

// ─── Mermaid ERD 생성 ─────────────────────────────────────────────

const RELATIONS = [
  { from: 'users', to: 'login_codes',     label: '1회용 코드 (재사용 가능)',   type: '||--o{' },
  { from: 'users', to: 'sessions',        label: '로그인 세션',                type: '||--o{' },
  { from: 'users', to: 'watchlist_items', label: '관심종목',                  type: '||--o{' },
  { from: 'login_codes', to: 'access_requests', label: '승인된 코드',         type: '||--o{' },
];

function buildMermaid(tables) {
  const lines = ['```mermaid', 'erDiagram'];

  for (const [tname, tdef] of Object.entries(tables)) {
    lines.push(`    ${tname} {`);
    for (const col of tdef.columns) {
      const tag = col.constraints
        .filter(c => ['PK', 'UK', 'FK'].some(k => c.startsWith(k)))
        .join(', ');
      lines.push(`        ${col.type} ${col.name}${tag ? ' ' + tag : ''}`);
    }
    lines.push('    }');
    lines.push('');
  }

  for (const rel of RELATIONS) {
    if (tables[rel.from] && tables[rel.to]) {
      lines.push(`    ${rel.from} ${rel.type} ${rel.to} : "${rel.label}"`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

// ─── 마이그레이션 이력 표 생성 ────────────────────────────────────

const MIGRATION_NOTES = {
  '001_auth.sql':             { date: '2026-05-21', desc: '`users`, `login_codes`, `sessions` — 인증 스키마' },
  '002_watchlist.sql':        { date: '2026-05-21', desc: '`watchlist_items` — 관심종목 서버 저장' },
  '003_access_requests.sql':  { date: '2026-05-22', desc: '`access_requests` — 로그인 코드 요청 시스템' },
  '004_briefings.sql':        { date: '2026-05-22', desc: '`briefings` — AI 브리핑 캐시' },
};

function buildMigrationTable(files) {
  const rows = files.map(f => {
    const note = MIGRATION_NOTES[f] || { date: '—', desc: '—' };
    return `| \`${f}\` | ${note.date} | ${note.desc} |`;
  });
  return [
    '| 파일 | 날짜 | 내용 |',
    '|------|------|------|',
    ...rows,
  ].join('\n');
}

function buildIndexTable(indexes) {
  const rows = indexes.map(i =>
    `| \`${i.name}\` | \`${i.table}\` | \`${i.columns}\` | ${i.condition || ''} |`
  );
  return [
    '| 인덱스 | 테이블 | 컬럼 | 조건 |',
    '|--------|--------|------|------|',
    ...rows,
  ].join('\n');
}

// ─── ERD.md 생성 ─────────────────────────────────────────────────

function buildErd(tables, indexes, files) {
  const today = new Date().toISOString().slice(0, 10);
  const mermaid = buildMermaid(tables);
  const migTable = buildMigrationTable(files);
  const idxTable = buildIndexTable(indexes);

  const tableDetails = Object.entries(tables).map(([tname, tdef]) => {
    const colRows = tdef.columns.map(c => {
      const note = c.constraints.join(', ');
      return `| \`${c.name}\` | ${c.type} | ${note} | |`;
    }).join('\n');

    return `### \`${tname}\`
> Migration: \`${tdef.filename}\`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
${colRows}
`;
  }).join('\n---\n\n');

  return `# StockPulse — 데이터베이스 ERD

> **자동 갱신 규칙:** \`backend/migrations/*.sql\` 파일이 수정·추가될 때마다
> Claude Code 훅이 \`node scripts/update-erd.mjs\`를 실행하여 이 문서를 재생성합니다.

**최종 갱신:** ${today}
**DB:** PostgreSQL 16 (로컬 Docker 5433 / Railway Postgres)
**마이그레이션 수:** ${files.length}개 (\`${files[0].replace(/_.*/, '')}\` ~ \`${files[files.length - 1].replace(/_.*/, '')}\`)

---

## ER 다이어그램

${mermaid}

---

## 테이블 상세

${tableDetails}

---

## 마이그레이션 이력

${migTable}

---

## 인덱스 전체 목록

${idxTable}

---

## 실행 명령

\`\`\`bash
# 로컬 Docker PostgreSQL 시작
npm run db:up

# 전체 마이그레이션 실행 (migrations/ 자동 스캔)
npm run db:migrate

# ERD 문서 재생성 (이 파일 갱신)
node scripts/update-erd.mjs

# 현재 테이블 확인
docker exec stockpulse-db psql -U stockpulse -d stockpulse -c "\\dt"
\`\`\`
`;
}

// ─── 실행 ────────────────────────────────────────────────────────

const { tables, indexes, files } = parseMigrations();
const content = buildErd(tables, indexes, files);
fs.writeFileSync(ERD_PATH, content, 'utf8');
console.log(`✅ ERD 문서 재생성 완료 → docs/ERD.md (테이블 ${Object.keys(tables).length}개, 인덱스 ${indexes.length}개)`);
