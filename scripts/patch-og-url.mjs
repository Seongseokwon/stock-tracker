/**
 * Vercel 빌드 시 OG 메타의 절대 URL을 배포 도메인으로 치환
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');

const fallback = 'https://stock-tracker-opal-six.vercel.app';
const raw =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  fallback;
const base = `https://${String(raw).replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

let html = readFileSync(indexPath, 'utf8');
html = html.replace(/__OG_BASE_URL__/g, base);
writeFileSync(indexPath, html);
console.log(`OG base URL → ${base}`);
