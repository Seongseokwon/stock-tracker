/**
 * 프로덕션(Vercel) API·정적 QA
 * 사용: npm run qa:prod
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD_URL = process.env.QA_PROD_URL || 'https://stock-tracker-opal-six.vercel.app';

const r = spawnSync(process.execPath, [path.join(__dirname, 'qa.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, QA_BASE: PROD_URL },
});

process.exit(r.status ?? 1);
