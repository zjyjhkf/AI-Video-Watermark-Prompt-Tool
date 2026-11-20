import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE = 'file:///D:/jianheng/' + encodeURI('开发产物/内容中转平台重构/重构前置文档/内容中转平台前端/index.html');
const OUT = 'C:/Users/zjy/AppData/Local/Temp/chub-shots-1280';

await fs.mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(FILE, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 500));

// 登录页
await page.screenshot({ path: path.join(OUT, '00-login.png') });

// 登录（默认账号已填好）
await page.click('.auth__card button[type="submit"]');
await new Promise((r) => setTimeout(r, 900));

const routes = [
  ['workbench', '01-workbench'],
  ['video', '02-video'],
  ['article', '03-article'],
  ['prompt', '04-prompt'],
  ['tasks', '05-tasks'],
  ['assets', '06-assets'],
  ['members', '07-members'],
  ['settings', '08-settings'],
];

for (const [hash, name] of routes) {
  await page.evaluate((h) => {
    window.location.hash = `#/${h}`;
  }, hash);
  await new Promise((r) => setTimeout(r, 1100));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

// 交互：生成文章
await page.evaluate(() => {
  window.location.hash = '#/article';
});
await new Promise((r) => setTimeout(r, 400));
const genBtn = await page.$$('.head__actions .btn--primary');
if (genBtn[0]) {
  await genBtn[0].click();
  await new Promise((r) => setTimeout(r, 2200));
  await page.screenshot({ path: path.join(OUT, '09-article-done.png') });
}

// 交互：任务详情
await page.evaluate(() => {
  window.location.hash = '#/tasks';
});
await new Promise((r) => setTimeout(r, 400));
await page.click('.task-row');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(OUT, '10-task-detail.png') });
await page.keyboard.press('Escape');

// 交互：成员菜单
await page.evaluate(() => {
  window.location.hash = '#/members';
});
await new Promise((r) => setTimeout(r, 400));
const more = await page.$$('.more-btn');
if (more[1]) {
  await more[1].click();
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT, '11-members-menu.png') });
}

console.log('errors:', JSON.stringify(errors, null, 1));
await browser.close();
