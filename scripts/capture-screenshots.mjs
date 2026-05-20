/**
 * 앱 실행 중인 localhost:3000 에서 스크린샷 캡처
 * og-image.png (1200×630), desktop-wide.png (1280×720), mobile-narrow.png (390×844)
 * Usage: node scripts/capture-screenshots.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(__dirname, '..', 'frontend');

const CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:3000';

async function capture(page, width, height, outPath) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  // 카드 로딩 대기
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width, height } });
  console.log(`  saved: ${path.relative(process.cwd(), outPath)} (${width}×${height})`);
}

async function main() {
  console.log('Chrome 실행 중…');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // og-image: 1200×630
    const ogPath = path.join(frontend, 'og-image.png');
    await capture(page, 1200, 630, ogPath);

    // PWA wide screenshot: 1280×720
    const widePath = path.join(frontend, 'screenshots', 'desktop-wide.png');
    await capture(page, 1280, 720, widePath);

    // PWA narrow screenshot: 390×844
    const narrowPath = path.join(frontend, 'screenshots', 'mobile-narrow.png');
    await capture(page, 390, 844, narrowPath);

    console.log('\n완료.');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
