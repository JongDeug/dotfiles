#!/usr/bin/env node
/*
 * render.js — HTML 슬라이드 → PNG 일괄 렌더링
 *
 * 사용법:
 *   NODE_PATH=/home/jongdeug/.claude/channels/telegram/jongdeug/scripts/node_modules \
 *     node render.js                # 모든 slide*.html 렌더링
 *
 *   NODE_PATH=... node render.js --only 5    # slide05.html 한 장만 렌더링
 *
 * 입력:  ./slide*.html
 * 출력:  ./screenshots/slide*.png
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const cwd = process.cwd();
  const screenshotsDir = path.join(cwd, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // --only N 플래그 파싱
  const args = process.argv.slice(2);
  let onlyIdx = null;
  const onlyArg = args.indexOf('--only');
  if (onlyArg !== -1 && args[onlyArg + 1]) {
    onlyIdx = parseInt(args[onlyArg + 1], 10);
  }

  // slide*.html 자동 검색 (slide01, slide02, ...)
  const allSlides = fs.readdirSync(cwd)
    .filter(f => /^slide\d{2}\.html$/.test(f))
    .sort();

  if (allSlides.length === 0) {
    console.error('No slide*.html files found in', cwd);
    console.error('파일명은 slide01.html, slide02.html ... 두 자리 패딩이어야 합니다.');
    process.exit(1);
  }

  const targets = onlyIdx
    ? allSlides.filter(f => f === `slide${String(onlyIdx).padStart(2, '0')}.html`)
    : allSlides;

  if (targets.length === 0) {
    console.error(`No slide matching --only ${onlyIdx}`);
    process.exit(1);
  }

  console.log(`Found ${allSlides.length} slide(s), rendering ${targets.length}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  for (const file of targets) {
    const htmlPath = path.join(cwd, file);
    const pngName = file.replace('.html', '.png');
    const outPath = path.join(screenshotsDir, pngName);

    const page = await context.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    // Google Fonts + Font Awesome CDN 로딩 대기
    await page.waitForTimeout(3500);
    await page.screenshot({
      path: outPath,
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
    });
    await page.close();
    console.log(`  rendered: ${pngName}`);
  }

  await browser.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
