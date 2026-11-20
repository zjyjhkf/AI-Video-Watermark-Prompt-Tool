/**
 * 界面级联调验证（puppeteer-core + 本机 Edge/Chrome）
 *
 * 覆盖：登录 → 9 个路由渲染与横向溢出 → 个人资料改姓名 → 成员页角色徽标
 *       → 新建游客 → 游客登录的入口隐藏与路由拦截 → 管理员只见游客
 *       → 文章编写真实异步任务 → 全程无 JS 报错
 *
 * 脚本自带数据准备与清理，可在「只有超级管理员」的空库上直接跑。
 * 用法：node scripts/ui-smoke.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8020';
const API = `${BASE}/api/v1`;
const OUT = path.resolve('.ui-shots');
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const SUPER = { username: 'linan', password: 'demo1234' };
const GUEST = { name: '界面游客', username: 'ui_guest', password: 'ui12345678' };
const ADMIN = { name: '界面管理员', username: 'ui_admin', password: 'ui12345678' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

async function pickBrowser() {
  for (const p of CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* 继续 */
    }
  }
  throw new Error('未找到 Edge / Chrome 可执行文件');
}

/* ---------- 直连 API：准备与清理测试账号 ---------- */
async function apiLogin(username, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`登录失败 ${username}: ${r.status}`);
  return (await r.json()).access_token;
}

async function apiCall(token, method, pathname, body) {
  const r = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  return r.json().catch(() => null);
}

async function prepareAccounts() {
  const token = await apiLogin(SUPER.username, SUPER.password);
  const page1 = await apiCall(token, 'GET', '/users?page_size=100');
  for (const u of page1.items) {
    if (u.username.startsWith('ui_')) {
      await apiCall(token, 'DELETE', `/users/${u.id}`);
    }
  }
  const created = [];
  for (const spec of [GUEST, { ...ADMIN, role: 'admin' }]) {
    const r = await apiCall(token, 'POST', '/users', {
      name: spec.name,
      username: spec.username,
      password: spec.password,
      role: spec.role || 'guest',
      scope_all: true,
    });
    if (r && r.id) created.push(r.id);
  }
  // 记录运行前的业务数据，结束时只清本次新增的
  const baseline = {
    tasks: new Set((await apiCall(token, 'GET', '/tasks?page_size=100')).items.map((t) => t.id)),
    assets: new Set((await apiCall(token, 'GET', '/assets?page_size=100')).items.map((a) => a.id)),
    drafts: new Set(
      ((await apiCall(token, 'GET', '/articles/drafts?page_size=100')).items || []).map((d) => d.id),
    ),
  };
  return { token, created, baseline };
}

async function cleanup(baseline) {
  // 测试过程中会多次登录/登出，旧 token 已随 token_version 递增失效，这里重新登录
  const token = await apiLogin(SUPER.username, SUPER.password);
  const users = await apiCall(token, 'GET', '/users?page_size=100');
  for (const u of users?.items || []) {
    if (u.username.startsWith('ui_')) await apiCall(token, 'DELETE', `/users/${u.id}`);
  }
  for (const t of (await apiCall(token, 'GET', '/tasks?page_size=100'))?.items || []) {
    if (!baseline.tasks.has(t.id)) await apiCall(token, 'DELETE', `/tasks/${t.id}`);
  }
  for (const a of (await apiCall(token, 'GET', '/assets?page_size=100'))?.items || []) {
    if (!baseline.assets.has(a.id)) await apiCall(token, 'DELETE', `/assets/${a.id}`);
  }
  for (const d of (await apiCall(token, 'GET', '/articles/drafts?page_size=100'))?.items || []) {
    if (!baseline.drafts.has(d.id)) await apiCall(token, 'DELETE', `/articles/drafts/${d.id}`);
  }
  return token;
}

await fs.mkdir(OUT, { recursive: true });
const { created, baseline } = await prepareAccounts();
check('测试账号准备完成（游客 + 管理员）', created.length === 2, created.length);

const browser = await puppeteer.launch({
  executablePath: await pickBrowser(),
  headless: 'new',
  args: ['--hide-scrollbars', '--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
const errors = [];
const forbidden = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() === 403) forbidden.push(`${r.request().method()} ${r.url().replace(BASE, '')}`);
});

const shot = async (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const goto = async (hash) => {
  await page.evaluate((h) => (window.location.hash = `#/${h}`), hash);
  await wait(700);
};

const clickText = async (selector, text) =>
  page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((x) => (x.textContent || '').includes(t));
      if (el) el.click();
      return !!el;
    },
    selector,
    text,
  );

const overflowX = async () =>
  page.evaluate(() => {
    const main = document.querySelector('.main');
    if (!main) return 0;
    return Math.max(0, main.scrollWidth - main.clientWidth);
  });

const toasts = async () =>
  page.$$eval('.toast', (els) => els.map((e) => e.textContent || '').join('|')).catch(() => '');

async function login(username, password) {
  const inputs = await page.$$('.auth__card input');
  if (inputs.length < 2) throw new Error('登录表单未渲染');
  await inputs[0].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await inputs[0].type(username);
  await inputs[1].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await inputs[1].type(password);
  await page.click('.auth__card button[type="submit"]');
  await wait(1500);
  return !!(await page.$('.sidebar'));
}

async function logout() {
  const exit = await page.$('.user-card__exit');
  if (exit) await exit.click();
  await wait(1200);
}

/* ---------- 1. 登录 ---------- */
await page.goto(BASE, { waitUntil: 'networkidle2' });
await wait(600);
check('登录页渲染', !!(await page.$('.auth__card')));
const quickItems = await page.$$eval('.auth__quick-item', (els) => els.length).catch(() => 0);
check('登录页只保留初始超级管理员账号', quickItems <= 1, `${quickItems} 个快捷入口`);
await shot('01-login');

check('超级管理员登录成功', await login(SUPER.username, SUPER.password));
await shot('02-workbench');

/* ---------- 2. 路由巡检 ---------- */
const routes = [
  ['video', '03-video'],
  ['article', '04-article'],
  ['prompt', '05-prompt'],
  ['tasks', '06-tasks'],
  ['assets', '07-assets'],
  ['members', '08-members'],
  ['settings', '09-settings'],
  ['profile', '10-profile'],
];
for (const [route, file] of routes) {
  await goto(route);
  await wait(route === 'tasks' || route === 'assets' ? 900 : 500);
  const ov = await overflowX();
  await shot(file);
  check(`路由 ${route} 渲染且无横向溢出`, ov <= 1, ov > 1 ? `溢出 ${ov}px` : '');
}

const navText = await page.$eval('.nav', (el) => el.textContent || '');
check('侧栏出现「个人资料」入口', navText.includes('个人资料'));

/* ---------- 3. 个人资料：改姓名 → 同步侧栏 → 改回 ---------- */
const nameInput = await page.$('#profile-name');
check('个人资料页有姓名输入框', !!nameInput);
if (nameInput) {
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('林岸（界面改）');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('保存资料'),
    );
    if (btn) btn.click();
  });
  await wait(1400);
  const sidebarName = await page.$eval('.user-card__name', (el) => el.textContent || '');
  check('改姓名后侧栏同步更新', sidebarName.includes('界面改'), sidebarName);
  await shot('11-profile-saved');

  const back = await page.$('#profile-name');
  await back.click({ clickCount: 3 });
  await back.type('林岸');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('保存资料'),
    );
    if (btn) btn.click();
  });
  await wait(1200);
}

/* ---------- 4. 成员页：角色更名 + 游客徽标 ---------- */
await goto('members');
await wait(900);
const rolePills = await page.$$eval('.role-pill', (els) => els.map((e) => (e.textContent || '').trim()));
check('成员页出现「超级管理员」', rolePills.includes('超级管理员'), rolePills.join('/'));
check('角色已更名：出现「游客」而非「查看者」', rolePills.includes('游客') && !rolePills.includes('查看者'), rolePills.join('/'));
check('成员页不再出现「查看者」字样', !(await page.$eval('body', (el) => el.textContent || '')).includes('查看者'));
await shot('12-members');

// 新建游客（右侧表单）
const nameField = await page.$('#member-name');
if (nameField) {
  const unique = `ui_tmp_${Date.now().toString().slice(-6)}`;
  await page.type('#member-name', '界面新增游客');
  await page.type('#member-username', unique);
  await page.type('#member-password', 'tmp12345678');
  await clickText('button', '创建成员');
  await wait(1600);
  const after = await page.$$eval('.role-pill', (els) => els.map((e) => (e.textContent || '').trim()));
  check('可创建游客并出现在列表', after.filter((r) => r === '游客').length >= 2, `${after.join('/')}`);
  await shot('13-members-guest-created');
}

/* ---------- 5. 游客登录：入口隐藏 + 路由拦截 ---------- */
await logout();
check('游客登录成功', await login(GUEST.username, GUEST.password));
const guestNav = await page.$eval('.nav', (el) => el.textContent || '');
check('游客侧栏无「成员与权限」', !guestNav.includes('成员与权限'), guestNav.replace(/\s+/g, ' ').slice(0, 60));
check('游客侧栏无内容生产入口', !guestNav.includes('视频水印') && !guestNav.includes('文章编写'));
check('游客侧栏有「个人资料」', guestNav.includes('个人资料'));
await page.evaluate(() => (window.location.hash = '#/members'));
await wait(1200);
const afterBlockHash = await page.evaluate(() => window.location.hash);
check('游客直访成员页被拦截回工作台', afterBlockHash.includes('workbench'), afterBlockHash);
check('拦截时给出提示', (await toasts()).includes('无权访问'), (await toasts()).slice(0, 30));
await shot('14-guest-blocked');

/* ---------- 6. 管理员登录：只见游客 ---------- */
await logout();
check('管理员登录成功', await login(ADMIN.username, ADMIN.password));
await goto('members');
await wait(1100);
const adminPills = await page.$$eval('.role-pill', (els) => els.map((e) => (e.textContent || '').trim()));
check('管理员成员页只显示游客', adminPills.length > 0 && adminPills.every((r) => r === '游客'), adminPills.join('/'));
const tbodyText = await page.$eval('.tbody', (el) => el.textContent || '');
check(
  '管理员看不到超级管理员 / 其他管理员账号',
  !tbodyText.includes('超级管理员') && !tbodyText.includes('管理员'),
  tbodyText.replace(/\s+/g, ' ').slice(0, 40),
);
await shot('15-admin-members');

/* ---------- 7. 文章编写真实异步任务（功能回归） ---------- */
await logout();
await login(SUPER.username, SUPER.password);
await goto('article');
await wait(700);
const topicInput = await page.$('.article-form input[placeholder="如：气压靴"]');
if (topicInput) {
  await topicInput.click();
  await topicInput.type('压力袜');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.head__actions .btn--primary')].find((b) =>
      (b.textContent || '').includes('生成文章'),
    );
    if (btn) btn.click();
  });
  let gotArticle = false;
  for (let i = 0; i < 50; i += 1) {
    await wait(500);
    if (await page.$('.art-title')) {
      gotArticle = true;
      break;
    }
  }
  check('文章生成任务跑通并回填编辑器', gotArticle);
  if (gotArticle) {
    const title = await page.$eval('.art-title', (el) => el.value);
    check('生成结果含标题', !!title, title.slice(0, 18));
    await shot('16-article-generated');
  }
}

/* ---------- 8. 报错汇总与清理 ---------- */
const realErrors = errors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
check(
  '全程无 JS 报错',
  realErrors.length === 0,
  [...realErrors.slice(0, 3), ...(forbidden.length ? [`403: ${forbidden.join(' , ')}`] : [])].join(' | '),
);
await shot('17-final');

await browser.close();
await cleanup(baseline);

const passed = results.filter((r) => r.ok).length;
console.log('\n================ 界面验证汇总 ================');
results.forEach((r) => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.note ? ' — ' + r.note : ''}`));
console.log(`\n通过 ${passed} / ${results.length}　截图目录：${OUT}`);
process.exit(passed === results.length ? 0 : 1);
