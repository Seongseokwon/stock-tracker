/**
 * PWA 아이콘·스크린샷을 manifest 명시 크기로 리사이즈
 * 사용: node scripts/fix-pwa-assets.mjs
 */
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(__dirname, '..', 'frontend');
const screenshotsDir = path.join(frontend, 'screenshots');

mkdirSync(screenshotsDir, { recursive: true });

async function resize(inPath, outPath, w, h) {
  if (!inPath) throw new Error(`Missing source for ${outPath}`);
  const buf = await sharp(inPath).resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
  await sharp(buf).toFile(outPath);
  const m = await sharp(outPath).metadata();
  console.log(`  ${path.relative(frontend, outPath)} → ${m.width}x${m.height}`);
}

async function main() {
  const src512 = path.join(frontend, 'icon-512.png');
  const srcOg = path.join(frontend, 'og-image.png');

  console.log('PWA assets resize…\n');
  await resize(src512, path.join(frontend, 'icon-512.png'), 512, 512);
  await resize(src512, path.join(frontend, 'icon-192.png'), 192, 192);
  await resize(srcOg, path.join(screenshotsDir, 'desktop-wide.png'), 1280, 720);
  await resize(srcOg, path.join(screenshotsDir, 'mobile-narrow.png'), 390, 844);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
