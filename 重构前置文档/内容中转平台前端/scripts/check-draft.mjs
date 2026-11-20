import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/jianheng/' + encodeURI('开发产物/内容中转平台重构/重构前置文档/内容中转平台前端/index.html');
const OUT = 'C:/Users/zjy/AppData/Local/Temp/chub-flows';
await fs.mkdir(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'load' });
await wait(400);
await page.click('.auth__card button[type="submit"]');
await wait(900);

const clickText = async (sel, text) =>
  page.evaluate(
    (s, t) => {
      const b = [...document.querySelectorAll(s)].find((x) => x.textContent.includes(t));
      if (b) b.click();
      return !!b;
    },
    sel,
    text
  );

const draftCount = async () => {
  await page.evaluate(() => (window.location.hash = '#/assets'));
  await wait(500);
  const chips = await page.$$('.srcfilter__item');
  await chips[3].click();
  await wait(400);
  const n = await page.$$eval('.asset', (e) => e.length);
  const names = await page.$$eval('.asset__name', (e) => e.map((x) => x.textContent.trim()));
  return { n, names };
};

// 文章：连存两次草稿
await page.evaluate(() => (window.location.hash = '#/article'));
await wait(500);
await clickText('.head__actions .btn--primary', '生成');
await wait(2300);
await clickText('.head__actions .btn', '保存草稿');
await wait(500);
await clickText('.head__actions .btn', '保存草稿');
await wait(500);
const afterArticle = await draftCount();

// 提示词：存一次
await page.evaluate(() => (window.location.hash = '#/prompt'));
await wait(400);
await clickText('.head__actions .btn--primary', '生成');
await wait(1600);
await clickText('.head__actions .btn', '保存草稿');
await wait(500);
const afterPrompt = await draftCount();
await page.screenshot({ path: path.join(OUT, 'h1-drafts.png') });

// 草稿内容是否可下载（点卡片选中 → 下载所选）
await page.evaluate(() => {
  const card = document.querySelector('.asset');
  if (card) card.click();
});
await wait(300);
const dlBtn = await page.$$eval('.tool-btn', (els) => els.map((e) => e.textContent.trim()));
await page.screenshot({ path: path.join(OUT, 'h2-draft-selected.png') });

console.log(JSON.stringify({ afterArticle, afterPrompt, dlBtn, errors }, null, 1));
await browser.close();
