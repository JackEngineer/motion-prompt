#!/usr/bin/env node
// 校验 Motion Prompt：在浏览器中按多个时刻绘制每个元素，报告绘制问题。
//
//   node tools/check.mjs                  检查所有素材包
//   node tools/check.mjs --pack camera    仅检查 camera 素材包
//   node tools/check.mjs --strict         出现警告也以状态码 1 退出
//   node tools/check.mjs --root <dir>     检查其他目录（目录结构须与本仓库一致）
//
// 失败（状态码 1）  绘制异常、未绘制任何内容、所有采样帧都是纯色、绘制函数数量与 meta.json 不符，
//                   或素材包、字体、图片加载失败。
// 警告              部分采样时刻未绘制内容、循环首尾帧差异远大于相邻帧、同一时刻重复绘制的结果不同，
//                   或标为可缩放的素材包在缩放画布后绘制结果发生变化。
//
// 提示              部分采样帧只有纯色背景。入场前出现这类画面属于正常情况。
//
// 本仓库不附带 Playwright。可通过 MP_PLAYWRIGHT 指定模块路径，默认按模块名 playwright 加载。
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const ONLY = opt('--pack');
const STRICT = flag('--strict');
const PW = process.env.MP_PLAYWRIGHT || 'playwright';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)(PW)); } catch (e) {
  console.error(`无法从 ${PW} 加载 Playwright。\n请将 MP_PLAYWRIGHT 设为 Playwright 模块的路径（如 /path/to/node_modules/playwright），然后重试。`);
  process.exit(2);
}

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`服务器未响应 ${url}`);
}

// Runs inside the page. Returns one record per element.
async function probe({ pack, expect, scalable }) {
  const p = window.MotionPrompt.packs[pack];
  if (!p) return { fatal: `未注册 MotionPrompt.packs['${pack}']` };
  const out = { width: p.width, height: p.height, cycle: p.cycle, cells: p.cells.length, fontError: null, readyError: null, rows: [] };
  try { await window.MotionPrompt.loadFonts(p, new URL(`packs/${pack}/`, location.origin + '/')); await document.fonts.ready; }
  catch (e) { out.fontError = String(e && e.message || e); }
  // A pack that ships its own images returns `ready`, a promise that settles when they have loaded.
  if (p.ready) { try { await p.ready; } catch (e) { out.readyError = String(e && e.message || e); } }
  const W = p.width, H = p.height, CYC = p.cycle, EPS = 1 / 60;
  const mk = s => { const c = document.createElement('canvas'); c.width = W * s; c.height = H * s; return c; };
  const c1 = mk(1), k1 = c1.getContext('2d', { willReadFrequently: true });
  const c2 = mk(2), k2 = c2.getContext('2d');
  const down = mk(1), kd = down.getContext('2d', { willReadFrequently: true });
  const draw = (k, cell, u, s) => {
    k.setTransform(1, 0, 0, 1, 0, 0); k.globalAlpha = 1; k.filter = 'none'; k.globalCompositeOperation = 'source-over';
    k.clearRect(0, 0, W * s, H * s); k.save(); if (s !== 1) k.scale(s, s);
    try { cell(k, W, H, u); } finally { k.restore(); }
  };
  const grab = (cell, u) => { draw(k1, cell, u, 1); return k1.getImageData(0, 0, W, H).data; };
  const stats = d => { // over white; returns coverage, mean luminance, spread
    let n = 0, sum = 0, sq = 0, covered = 0;
    for (let i = 0; i < d.length; i += 16) {
      const a = d[i + 3] / 255; if (a > 0.02) covered++;
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * a + 255 * (1 - a);
      n++; sum += l; sq += l * l;
    }
    const mean = sum / n;
    return { cover: covered / n, mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  };
  const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]); n += 4; } return s / n; };
  const times = [0, 0.13, 0.25, 0.37, 0.5, 0.63, 0.75, 0.87].map(f => f * CYC);
  for (let i = 0; i < Math.max(p.cells.length, expect); i++) {
    const row = { i, fail: [], warn: [], info: [], seam: 0, step: 0 };
    out.rows.push(row);
    const cell = p.cells[i];
    if (typeof cell !== 'function') { row.fail.push('缺少绘制函数'); continue; }
    try {
      let flat = 0, empty = 0, step = 0; const flats = [];
      for (const u of times) {
        const a = grab(cell, u).slice();
        const s = stats(a);
        if (s.cover < 0.002) empty++;
        else if (s.sd < 1.2) { flat++; flats.push(`${u.toFixed(2)}秒 ${s.mean > 250 ? '纯白' : s.mean < 5 ? '纯黑' : '纯色'}`); }
        step = Math.max(step, diff(a, grab(cell, Math.min(u + EPS, CYC - EPS / 2))));
      }
      if (empty === times.length) row.fail.push('所有采样帧均未绘制内容');
      else if (flat + empty === times.length) row.fail.push(`采样帧中只有纯色或空白（${flats[0] || '空白'}）`);
      else {
        if (empty) row.warn.push(`${times.length} 个采样时刻中有 ${empty} 个未绘制内容`);
        if (flat) row.info.push(`仅有背景的时刻为 ${flats.map(f => f.split(' ')[0]).join('、')}`);
      }
      const first = grab(cell, 0).slice(), last = grab(cell, CYC - EPS).slice();
      const seam = diff(first, last);
      row.seam = +seam.toFixed(2); row.step = +step.toFixed(2);
      if (seam > 6 && seam > step * 3) row.warn.push(`循环首尾帧差值为 ${seam.toFixed(1)}，正常相邻帧的最大差值为 ${step.toFixed(1)}`);
      const u0 = CYC * 0.31, x = grab(cell, u0).slice(); grab(cell, CYC * 0.72); grab(cell, CYC * 0.05);
      const again = diff(x, grab(cell, u0));
      if (again > 0.02) row.warn.push(`同一时刻重复绘制的差值为 ${again.toFixed(2)}，画面必须只取决于 u`);
      if (scalable) {
        draw(k2, cell, u0, 2);
        kd.clearRect(0, 0, W, H); kd.imageSmoothingQuality = 'high'; kd.drawImage(c2, 0, 0, W, H);
        const sc = diff(x, kd.getImageData(0, 0, W, H).data);
        if (sc > 5) row.warn.push(`画布缩放前后的绘制差值为 ${sc.toFixed(1)}，网站详情中的画面会有偏差`);
      }
    } catch (e) {
      row.fail.push(`绘制异常（${e && e.message || e}）`);
    }
  }
  return out;
}

const catalogFile = path.join(ROOT, 'api/v1/catalog.json');
if (!fs.existsSync(catalogFile)) { console.error('找不到 api/v1/catalog.json。请先运行 node tools/build.mjs。'); process.exit(2); }
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const packs = catalog.packs.filter(p => !ONLY || p.pack === ONLY);
if (!packs.length) { console.error(`目录中没有素材包 "${ONLY}"。`); process.exit(2); }

const port = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
let browser, fails = 0, warns = 0, total = 0;
try {
  const base = `http://127.0.0.1:${port}`;
  await waitFor(`${base}/assets/runtime.js`, 8000);
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  for (const p of packs) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) pageErrors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${base}/assets/runtime.js`); // any same-origin document will do
    await page.addScriptTag({ url: `${base}/assets/runtime.js` });
    await page.addScriptTag({ url: `${base}/packs/${p.pack}/pack.js` }).catch(e => pageErrors.push(`pack.js 加载失败（${e.message}）`));
    const r = await page.evaluate(probe, { pack: p.pack, expect: p.count, scalable: !!p.scalable });
    await page.close();
    console.log(`\n${p.pack}  #${p.first}-${p.last}  ${r.fatal ? '' : `${r.width}x${r.height}，循环时长 ${r.cycle} 秒，${r.cells} 个绘制函数`}`);
    if (r.fatal) { console.log(`  失败  ${r.fatal}${pageErrors.length ? ` (${pageErrors.join(' | ')})` : ''}`); fails++; continue; }
    if (r.cells !== p.count) { console.log(`  失败  有 ${r.cells} 个绘制函数，与目录中的 ${p.count} 个元素不一致`); fails++; }
    if (r.fontError) { console.log(`  失败  字体加载失败（${r.fontError}）`); fails++; }
    if (r.readyError) { console.log(`  失败  图片加载失败（${r.readyError}）`); fails++; }
    for (const e of pageErrors) { console.log(`  失败  页面错误（${e}）`); fails++; }
    const els = catalog.elements.filter(e => e.pack === p.pack);
    for (const row of r.rows) {
      total++;
      const el = els[row.i];
      const label = el ? `#${el.id} ${el.no} ${el.slug}` : `（元数据中缺少第 ${row.i + 1} 个元素）`;
      const status = row.fail.length ? '失败' : row.warn.length ? '警告' : '通过';
      if (row.fail.length) fails++; else if (row.warn.length) warns++;
      const notes = [...row.fail, ...row.warn, ...row.info.map(x => `(${x})`)].join(' · ');
      console.log(`  ${status}  ${label.padEnd(40)} 首尾帧差值 ${String(row.seam).padStart(6)}  相邻帧最大差值 ${String(row.step).padStart(6)}${notes ? '  ' + notes : ''}`);
    }
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(`\n已检查 ${total} 个元素，共 ${fails} 项失败、${warns} 项警告。`);
process.exit(fails || (STRICT && warns) ? 1 : 0);
