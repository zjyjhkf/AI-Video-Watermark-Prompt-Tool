import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE = 'file:///D:/jianheng/' + encodeURI('开发产物/内容中转平台重构/重构前置文档/内容前置文档') .replace('内容前置文档','');
const URL = 'file:///D:/jianheng/' + encodeURI('开发产物/内容中转平台重构/重构前置文档/内容中转平台前端/index.html');

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await page.click('.auth__card button[type="submit"]');
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => (window.location.hash = '#/members'));
await new Promise((r) => setTimeout(r, 500));

const data = await page.evaluate(() => {
  const q = (s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), top: Math.round(r.top), h: Math.round(r.height) };
  };
  return {
    theadRole: q('.thead__role'),
    theadStatus: q('.thead__status'),
    theadOp: q('.thead__op'),
    rowRole: q('.mrow__role'),
    rowStatus: q('.mrow__status'),
    rowOp: q('.mrow__op'),
    card: q('.table-card'),
    form: q('.form'),
    rolePanel: q('.role-panel'),
    rightScroll: (() => {
      const el = document.querySelector('.members-right');
      return el ? { client: el.clientHeight, scroll: el.scrollHeight } : null;
    })(),
    layout: q('.members-layout'),
    right: q('.members-right'),
    tbody: q('.tbody'),
  };
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
