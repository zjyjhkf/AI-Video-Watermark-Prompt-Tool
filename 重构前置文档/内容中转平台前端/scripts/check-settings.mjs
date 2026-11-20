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
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'load' });
await wait(500);
await page.click('.auth__card button[type="submit"]');
await wait(1000);

await page.evaluate(() => (window.location.hash = '#/settings'));
await wait(600);
const navs = await page.$$('.settings-nav__item');
await navs[2].click();
await wait(500);
await page.screenshot({ path: path.join(OUT, 'g1-settings-wm-1280.png') });

// 页面级溢出检查
const overflow = await page.evaluate(() => {
  const main = document.querySelector('.main');
  const panel = document.querySelector('.settings-panel');
  return {
    mainScroll: main ? { client: main.clientHeight, scroll: main.scrollHeight } : null,
    panelW: panel ? Math.round(panel.getBoundingClientRect().width) : null,
    canvasW: document.querySelector('.wm-set__canvas')
      ? Math.round(document.querySelector('.wm-set__canvas').getBoundingClientRect().width)
      : null,
    canvasH: document.querySelector('.wm-set__canvas')
      ? Math.round(document.querySelector('.wm-set__canvas').getBoundingClientRect().height)
      : null,
  };
});

// 1440 下再确认默认水印编辑器
await page.setViewport({ width: 1440, height: 900 });
await wait(500);
await page.screenshot({ path: path.join(OUT, 'g2-settings-wm-1440.png') });

// 任务中心表头是否被压缩
await page.evaluate(() => (window.location.hash = '#/tasks'));
await wait(700);
await page.screenshot({ path: path.join(OUT, 'g3-tasks-1440.png') });

console.log(JSON.stringify({ overflow, errors }, null, 1));
await browser.close();
