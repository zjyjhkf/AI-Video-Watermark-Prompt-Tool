// 把 React 源码打包成单文件 index.html —— 双击即可打开，无需服务器
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';

const result = await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  charset: 'utf8',
  loader: { '.jsx': 'jsx', '.webp': 'dataurl', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: 'out',
  write: false,
  logLevel: 'warning',
});

let js = '';
let css = '';
for (const file of result.outputFiles) {
  if (file.path.endsWith('.js')) js = file.text;
  else if (file.path.endsWith('.css')) css = file.text;
}

const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%2314B8A4'/%3E%3Cpath d='M9 12h14M9 16.5h14M9 21h8' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E";

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>内容中转平台 · 前端 Demo</title>
    <link rel="icon" href="${favicon}" />
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <noscript>请开启 JavaScript 以查看演示页面。</noscript>
    <script>${js}</script>
  </body>
</html>
`;

await fs.writeFile('index.html', html, 'utf8');
console.log(
  `index.html 已生成 · ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB`
);
