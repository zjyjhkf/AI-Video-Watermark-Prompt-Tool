import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/jianheng/' + encodeURI('开发产物/内容中转平台重构/重构前置文档/内容中转平台前端/index.html');
const OUT = 'C:/Users/zjy/AppData/Local/Temp/chub-flows';
await fs.mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
const log = {};
const go = async (hash, ms = 600) => {
  await page.evaluate((h) => (window.location.hash = `#/${h}`), hash);
  await wait(ms);
};
const toastText = () =>
  page.$$eval('.toast', (els) => els.map((e) => e.textContent.trim())).catch(() => []);

await page.goto(URL, { waitUntil: 'load' });
await wait(500);

/* ---------- 1. 登录失败 / 成功 ---------- */
await page.click('#login-password', { clickCount: 3 });
await page.type('#login-password', 'wrongpass');
await page.click('.auth__card button[type="submit"]');
await wait(800);
log.loginError = await page.$eval('.auth__error', (el) => el.textContent).catch(() => 'NO_ERROR');
await shot('f1-login-error');

await page.click('#login-password', { clickCount: 3 });
await page.type('#login-password', 'demo1234');
await page.click('.auth__card button[type="submit"]');
await wait(1000);

/* ---------- 2. 视频页：空状态 ---------- */
await go('video');
log.videoEmpty = await page.$$eval('.wm-empty', (e) => e.length);
await shot('f2-video-empty');

/* ---------- 3. 本地导入：页内录制一段真实 webm 再走 input 派发 ---------- */
const clip = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let tick = 0;
  const draw = () => {
    tick += 1;
    const g = ctx.createLinearGradient(0, 0, 640, 360);
    g.addColorStop(0, '#0f766e');
    g.addColorStop(1, '#a7f3d0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('LOCAL CLIP ' + tick, 130, 205);
  };
  draw();
  const stream = canvas.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const timer = setInterval(draw, 66);
  rec.start();
  await new Promise((r) => setTimeout(r, 2200));
  rec.stop();
  clearInterval(timer);
  await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(chunks, { type: 'video/webm' });
  const file = new File([blob], '本地导入测试片段.webm', { type: 'video/webm' });
  const input = document.querySelector('.head__actions input[type="file"]');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { bytes: blob.size };
});
await wait(2600);
log.clip = clip;
log.afterImport = await page.evaluate(() => ({
  editor: !!document.querySelector('.editor'),
  empty: !!document.querySelector('.wm-empty'),
  videoTag: !!document.querySelector('.player__video'),
  playerBox: (() => {
    const v = document.querySelector('.player__video');
    if (!v) return null;
    return { w: Math.round(v.getBoundingClientRect().width), h: Math.round(v.getBoundingClientRect().height), ready: v.readyState, dur: Math.round(v.duration || 0) };
  })(),
  srcRow: document.querySelector('.wm-meta__val, .meta-rows') ? document.body.innerText.includes('本地导入') : false,
  saveDisabled: (() => {
    const b = [...document.querySelectorAll('.head__actions .btn')].find((x) => x.textContent.includes('保存到素材库'));
    return b ? b.disabled : 'no-btn';
  })(),
}));
log.toastAfterImport = await toastText();
await shot('f3-video-imported');

/* ---------- 4. 改水印文字 ---------- */
const textInput = await page.$('.wm-panel input.input__native, .wm-panel .input input');
if (textInput) {
  await textInput.click({ clickCount: 3 });
  await textInput.type('内容中转平台 · v1.1');
  await wait(300);
}
await shot('f4-video-editing');

/* ---------- 5. 保存到素材库 → 跳任务中心 ---------- */
const saveBtn = await page.$$eval('.head__actions .btn', (els) => els.map((e) => e.textContent.trim()));
log.headerButtons = saveBtn;
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.head__actions .btn')].find((x) => x.textContent.includes('保存到素材库'));
  if (b) b.click();
});
await wait(3400);
log.afterSubmit = {
  hash: await page.evaluate(() => window.location.hash),
  progressRows: await page.$$eval('.task-progress', (els) => els.length),
  firstRow: await page.$eval('.task-row', (r) => r.innerText.replace(/\n+/g, ' | ')).catch(() => 'none'),
};
await shot('f5-task-processing');

await wait(9000);
log.afterDone = await page.evaluate(() => ({
  stored: [...document.querySelectorAll('.task-stored')].map((e) => e.textContent.trim()),
  firstRow: document.querySelector('.task-row') ? document.querySelector('.task-row').innerText.replace(/\n+/g, ' | ') : 'none',
}));
await shot('f6-task-done');

/* ---------- 6. 任务详情：产物入库 + 在素材库查看 ---------- */
await page.click('.task-row');
await wait(500);
log.taskDetail = await page.evaluate(() => {
  const t = document.querySelector('.modal') ? document.querySelector('.modal').innerText : '';
  return {
    hasStoredRow: t.includes('产物入库'),
    hasAssetLink: t.includes('在素材库查看'),
    excerpt: t.split('\n').filter((l) => l.trim()).slice(0, 16).join(' | '),
  };
});
await shot('f7-task-detail');
await page.keyboard.press('Escape');
await wait(300);

/* ---------- 7. 素材库：来源筛选 + 徽标 ---------- */
await go('assets');
log.assetsAll = await page.$$eval('.asset', (e) => e.length);
const filters = await page.$$('.srcfilter__item');
if (filters[3]) await filters[3].click(); // 草稿
await wait(450);
log.assetsDraft = {
  count: await page.$$eval('.asset', (e) => e.length),
  badges: await page.$$eval('.asset__src', (e) => e.map((x) => x.textContent.trim())),
};
await shot('f8-assets-draft');
if (filters[2]) await filters[2].click(); // 任务产出
await wait(450);
log.assetsTask = {
  count: await page.$$eval('.asset', (e) => e.length),
  badges: await page.$$eval('.asset__src', (e) => e.map((x) => x.textContent.trim())),
  titles: await page.$$eval('.asset__name, .asset__name', (e) => e.map((x) => x.textContent.trim())),
};
await shot('f9-assets-task');

/* ---------- 8. 文章：生成 → 保存草稿 ---------- */
await go('article');
await wait(300);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.head__actions .btn--primary')][0];
  if (b) b.click();
});
await wait(2400);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.head__actions .btn')].find((x) => x.textContent.includes('保存草稿'));
  if (b) b.click();
});
await wait(600);
log.articleDraft = {
  toast: await toastText(),
  metaLink: await page.$eval('.meta-link', (e) => e.textContent.trim()).catch(() => 'none'),
};
await shot('f10-article-draft');

/* ---------- 9. 提示词：保存草稿 ---------- */
await go('prompt');
await wait(300);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.head__actions .btn--primary')][0];
  if (b) b.click();
});
await wait(1800);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.head__actions .btn')].find((x) => x.textContent.includes('保存草稿'));
  if (b) b.click();
});
await wait(600);
log.promptDraft = { toast: await toastText() };
await shot('f11-prompt-draft');

/* ---------- 10. 设置：默认水印自定义 ---------- */
await go('settings');
const navs = await page.$$('.settings-nav__item');
if (navs[2]) await navs[2].click();
await wait(500);
log.wmSet = await page.evaluate(() => ({
  canvas: !!document.querySelector('.wm-set__canvas'),
  previewText: document.querySelector('.wm-set__text') ? document.querySelector('.wm-set__text').textContent.trim() : 'none',
  actions: [...document.querySelectorAll('.wm-set__actions .btn')].map((b) => b.textContent.trim()),
  presets: [...document.querySelectorAll('.preset-title, .preset-row')].map((b) => b.textContent.trim()).slice(0, 6),
}));
await shot('f12-settings-watermark');

const wmInput = await page.$('.wm-set__form input:not([type="checkbox"]):not([type="range"]):not([type="color"])');
if (wmInput) {
  await wmInput.click({ clickCount: 3 });
  await wmInput.type('健衡学院 · 2025');
  await wait(350);
}
log.wmPreviewAfterType = await page.$eval('.wm-set__text', (e) => e.textContent.trim()).catch(() => 'none');
await shot('f13-settings-watermark-live');

await page.evaluate(() => {
  const b = [...document.querySelectorAll('.wm-set__actions .btn')].find((x) => x.textContent.includes('另存为方案'));
  if (b) b.click();
});
await wait(500);
log.wmPresetToast = await toastText();
await shot('f14-settings-preset-saved');

/* ---------- 11. 成员：新建一行 ---------- */
await go('members');
await page.type('#member-name', '周昱');
await page.type('#member-username', 'zhouyu');
await page.click('.form .field .link');
await wait(200);
await page.click('.form button[type="submit"]');
await wait(600);
log.members = { rows: await page.$$eval('.mrow', (e) => e.length) };
await shot('f15-members-created');

/* ---------- 12. RBAC：编辑者看不到管理入口 ---------- */
await page.evaluate(() => {
  const b = document.querySelector('.user-card__exit');
  if (b) b.click();
});
await wait(700);
const quick = await page.$$('.auth__quick-item');
if (quick[2]) await quick[2].click(); // 陈默 · 编辑者
await wait(250);
await page.click('.auth__card button[type="submit"]');
await wait(1000);
log.editorSidebar = await page.evaluate(() => ({
  navItems: [...document.querySelectorAll('.nav__item')].map((e) => e.textContent.trim()),
  note: document.querySelector('.nav__note') ? document.querySelector('.nav__note').textContent.trim() : 'none',
}));
await shot('f16-editor-sidebar');

await go('settings', 900);
log.editorBlocked = {
  hash: await page.evaluate(() => window.location.hash),
  toast: await toastText(),
};
await shot('f17-editor-blocked');

/* ---------- 13. 窄屏 ---------- */
await page.setViewport({ width: 1280, height: 800 });
await go('video', 700);
await shot('f18-video-1280');

console.log(JSON.stringify({ ...log, errors }, null, 1));
await browser.close();
