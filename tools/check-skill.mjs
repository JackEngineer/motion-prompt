#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareRuntime } from './build-skill.mjs';
import { createManifest, isPublicPath, validateRuntime } from '../skills/motion-prompt/scripts/runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-prompt-offline-'));
const installed = path.join(scratch, '随机目录', 'motion-prompt');
const runtime = path.join(installed, 'runtime');
const children = new Set();
const browserMode = process.argv.includes('--browser');
let browser;
const checks = [];
fs.mkdirSync(path.join(root, '.audit'), { recursive: true });

function passed(message) { checks.push(message); console.log(`通过：${message}`); }
const guard = path.join(scratch, 'deny-network.cjs');
const networkLog = path.join(scratch, 'unexpected-network.log');
fs.writeFileSync(guard, `
const fs = require('node:fs');
const net = require('node:net');
const blocked = (host) => { fs.appendFileSync(${JSON.stringify(networkLog)}, String(host) + '\\n'); throw new Error('验收禁止外网：' + host); };
const allowed = (host) => !host || ['127.0.0.1', 'localhost', '::1'].includes(host);
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = typeof args[0] === 'object' ? args[0] : null;
  const host = opts ? opts.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (!allowed(host)) blocked(host);
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) { const url = new URL(typeof input === 'string' ? input : input.url || input); if (!allowed(url.hostname)) blocked(url.hostname); return originalFetch(input, init); };
`);
const environment = { ...process.env, MOTION_PROMPT_BASE: '', MOTION_PROMPT_CACHE: path.join(scratch, 'empty-cache'), NODE_OPTIONS: '' };

function command(args, { base = installed, env = {}, status = 0 } = {}) {
  const result = spawnSync(process.execPath, ['--require', guard, path.join(base, 'scripts/motion-prompt.mjs'), ...args], { cwd: scratch, env: { ...environment, ...env }, encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, status, `${args.join(' ')}\n${result.stderr}`);
  return result.stdout + result.stderr;
}

async function startPick(base = installed, env = {}, args = []) {
  const child = spawn(process.execPath, ['--require', guard, path.join(base, 'scripts/motion-prompt.mjs'), 'pick', '--no-open', '--timeout', '120', ...args], { cwd: scratch, env: { ...environment, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let output = '';
  const exited = new Promise((resolve) => child.once('close', (code) => { children.delete(child); resolve(code); }));
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('本地选择器未启动')); }, 15000);
    const receive = (buffer) => {
      output += buffer;
      const match = /示例库：(http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); if (!output.includes('示例库：http:')) reject(new Error(`选择器退出 ${code}：${output}`)); });
  });
  return { child, url, exited, output: () => output };
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, options, (res) => { let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, text })); }).on('error', reject);
  });
}

async function finishPick(pick, ids = ['025', '024'], lang = 'zh-Hans') {
  const callback = new URL(new URL(pick.url).searchParams.get('cb'));
  callback.searchParams.set('ids', ids.join(',')); callback.searchParams.set('note', '中文备注：用于标题');
  callback.searchParams.set('lang', lang);
  assert.equal((await request(callback)).status, 200);
  assert.equal(await pick.exited, 0);
  assert.match(pick.output(), /中文备注：用于标题/);
  assert.ok(pick.output().indexOf(`#${ids[0]}`) < pick.output().indexOf(`#${ids[1]}`));
  const references = [...pick.output().matchAll(/持久参考：(file:\/\/[^\s]+)/g)].map((m) => fileURLToPath(m[1]));
  assert.equal(references.length, ids.length);
  for (const file of references) assert.ok(fs.readFileSync(file, 'utf8').length);
  const commands = pick.output().split('\n').filter((line) => /^(get|kit) /.test(line));
  assert.equal(commands.filter((line) => line.startsWith('get ')).length, Math.ceil(ids.length / 8));
  const gotIds = [];
  for (const line of commands) {
    const args = line.split(' ');
    if (args[0] === 'get') {
      assert.deepEqual(args.slice(-2), ['--lang', lang]);
      assert.ok(args.length - 3 <= 8);
      gotIds.push(...args.slice(1, -2));
    } else assert.equal(args.length, 2);
    command(args);
  }
  assert.deepEqual(gotIds, ids);
  await assert.rejects(request(new URL(pick.url).origin));
}

function remoteCommand(args, env, executable = process.execPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--require', guard, path.join(installed, 'scripts/motion-prompt.mjs'), ...args], { env: { ...environment, ...env } });
    children.add(child);
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; }); child.stderr.on('data', (chunk) => { text += chunk; });
    child.once('error', reject);
    child.once('close', (code) => { children.delete(child); code === 0 ? resolve(text) : reject(new Error(text || `命令退出 ${code}`)); });
  });
}

async function withHttpServer(server, run) {
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections?.();
    await closed;
  }
}

async function browserPick(base) {
  const pick = await startPick(base);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const external = []; const errors = []; const badResponses = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname)) { external.push(u.href); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__copiedValues = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copiedValues.push(text); } } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  await page.goto(pick.url);
  await page.locator('.tile:visible').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-Hans');
  const catalog = await page.evaluate(() => window.MP_CATALOG);
  for (const pack of catalog.packs) {
    const url = new URL(pick.url); url.searchParams.set('pack', pack.pack);
    await page.goto(url.href); await page.locator('.tile:visible').first().waitFor();
    await page.waitForFunction((key) => !!window.MotionPrompt?.packs?.[key], pack.pack);
    await page.locator('.tile:visible canvas').first().scrollIntoViewIfNeeded();
    await page.evaluate(async (key) => { await window.MotionPrompt.packs[key].ready; }, pack.pack);
    await page.waitForFunction(() => {
      const canvas = [...document.querySelectorAll('.tile canvas')].find((item) => item.getBoundingClientRect().width && !item.hidden);
      if (!canvas) return false;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 64) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return colors.size > 3;
    });
  }
  const art = new URL(pick.url); art.searchParams.set('pack', 'artstyle');
  await page.goto(art.href); await page.locator('.tile:visible canvas').first().waitFor();
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter((entry) => /packs\/artstyle\/img\/.+\.webp/.test(entry.name)).length >= 27);
  await page.goto(pick.url); await page.locator('.tile:visible').first().waitFor();
  for (const query of ['pop', catalog.elements[0].tagLabels['zh-Hans'][0]]) {
    await page.locator('#q').fill(query);
    await page.waitForTimeout(250);
    assert.ok(await page.locator('.tile:visible').count());
  }
  await page.locator('#q').fill('');
  const selectedIds = [...catalog.elements.slice(0, 59).map((item) => item.id), catalog.elements.find((item) => item.pack === 'artstyle').id];
  for (const lang of ['en', 'ja']) {
    const selected = new URL(pick.url); selected.searchParams.set('pick', selectedIds.join(',')); selected.searchParams.set('lang', lang);
    await page.goto(selected.href); await page.locator('#tray-copy').waitFor({ state: 'visible' });
    await page.locator('#tray-note').fill('复制链接不得携带此备注');
    await page.locator('#tray-copy').click();
    const copied = await page.evaluate(() => window.__copiedValues.at(-1));
    const getCommands = [...copied.matchAll(/\bget ((?:\d{3} ?)+) --lang ([\w-]+)/g)];
    assert.equal(getCommands.length, Math.ceil(selectedIds.length / 8));
    assert.deepEqual(getCommands.flatMap((match) => match[1].split(' ')), selectedIds);
    for (const match of getCommands) { assert.ok(match[1].split(' ').length <= 8); assert.equal(match[2], lang); }
    assert.deepEqual([...copied.matchAll(/\bkit ([\w-]+)/g)].map((match) => match[1]), [...new Set(selectedIds.map((id) => catalog.elements.find((item) => item.id === id).pack))]);
    await page.locator('#tray-share').click();
    const link = new URL(await page.evaluate(() => window.__copiedValues.at(-1)));
    assert.equal(link.searchParams.get('lang'), lang);
    assert.equal(link.searchParams.get('pick'), selectedIds.join(','));
    for (const key of ['cb', 't', 'note']) assert.equal(link.searchParams.has(key), false);
    assert.ok(!link.href.includes('复制链接不得携带此备注'));
  }
  const extraId = catalog.elements.find((item) => !selectedIds.includes(item.id)).id;
  await page.evaluate((id) => { location.hash = id; }, extraId);
  await page.locator('#d-pick').waitFor({ state: 'visible' });
  await page.locator('#d-pick').click();
  assert.equal(await page.locator('#d-pick').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#tray-list > li').count(), 60);
  assert.match(await page.locator('#d-live').textContent(), /60/);
  await page.locator('#d-close').click();

  const excessiveIds = [...selectedIds, extraId];
  const excessiveUrl = new URL(pick.url); excessiveUrl.searchParams.set('pick', excessiveIds.join(','));
  await page.goto(excessiveUrl.href); await page.locator('#tray-limit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#tray-list > li').count(), 61);
  for (const id of ['tray-main', 'tray-copy', 'tray-share']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
  const copiedBefore = await page.evaluate(() => window.__copiedValues.length);
  await page.evaluate(() => { for (const id of ['tray-main', 'tray-copy', 'tray-share']) document.getElementById(id).click(); });
  assert.equal(await page.evaluate(() => window.__copiedValues.length), copiedBefore);
  assert.equal(pick.child.exitCode, null);
  await page.locator('.tray-x').last().click();
  assert.equal(await page.locator('#tray-list > li').count(), 60);
  for (const id of ['tray-main', 'tray-copy', 'tray-share']) assert.equal(await page.locator(`#${id}`).isDisabled(), false);

  await page.evaluate(({ ids, cb }) => { localStorage.setItem('mp-pick-cb', JSON.stringify({ ids, cb, note: '旧选择缓存' })); }, { ids: excessiveIds, cb: new URL(pick.url).searchParams.get('cb') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(pick.url); await page.locator('#tray-limit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#tray-list > li').count(), 61);
  assert.equal(await page.locator('#tray-toggle').getAttribute('aria-expanded'), 'false');
  assert.match(await page.locator('#tray-limit').textContent(), /60.*移除/);
  const notice = await page.locator('#tray-limit').boundingBox();
  assert.ok(notice && notice.x >= 0 && notice.x + notice.width <= 375 && notice.y >= 0 && notice.y + notice.height <= 812);
  for (const id of ['tray-main', 'tray-copy', 'tray-share']) assert.equal(await page.locator(`#${id}`).isDisabled(), true);
  await page.screenshot({ path: path.join(root, '.audit', `offline-${base === installed ? 'bundle' : 'repository'}-limit-mobile.png`) });
  await page.locator('#tray-toggle').click();
  await page.locator('#tray-clear').click();
  assert.equal(await page.locator('#tray-list > li').count(), 0);
  assert.equal(await page.locator('#tray-limit').isVisible(), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const resetSelection = new URL(pick.url); resetSelection.searchParams.set('pick', '');
  await page.goto(resetSelection.href); await page.locator('.tile:visible').first().waitFor();
  for (const id of ['025', '024']) {
    await page.evaluate((selected) => { location.hash = selected; }, id);
    await page.locator('#d-pick').waitFor({ state: 'visible' });
    await page.locator('#d-pick').click(); await page.locator('#d-close').click();
  }
  await page.locator('#tray-note').fill('中文浏览器备注');
  await page.locator('#tray-share').click();
  const share = await page.evaluate(() => window.__copiedValues.at(-1));
  assert.ok(share);
  const sharedUrl = new URL(share);
  for (const key of ['cb', 't', 'note']) assert.equal(sharedUrl.searchParams.has(key), false);
  assert.ok(!share.includes('中文浏览器备注'));
  await page.screenshot({ path: path.join(root, '.audit', `offline-${base === installed ? 'bundle' : 'repository'}-picker.png`) });
  await page.locator('#tray-main').click();
  await page.getByRole('heading', { name: '已发送给 AI' }).waitFor();
  assert.equal(await pick.exited, 0);
  assert.match(pick.output(), /中文浏览器备注/);
  assert.ok(pick.output().indexOf('#025') < pick.output().indexOf('#024'));
  for (const match of pick.output().matchAll(/持久参考：(file:\/\/[^\s]+)/g)) assert.ok(fs.existsSync(fileURLToPath(match[1])));
  await assert.rejects(request(new URL(pick.url).origin));
  assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(badResponses, []);
  await context.close();
  passed(`${base === installed ? '复制技能' : '完整仓库'}浏览器：十包预览、27张图、双语搜索、60项日英复制分批和无令牌分享、第61项限制与375px超量恢复、跨包乱序中文备注真实回传`);
}

try {
  compareRuntime(path.join(root, 'skills/motion-prompt/runtime'), createManifest(root));
  fs.cpSync(path.join(root, 'skills/motion-prompt'), installed, { recursive: true });
  const { catalog, manifest } = validateRuntime(runtime);
  assert.match(command(['info']), /随包离线运行时/);
  assert.match(command(['list']), new RegExp(`共 ${catalog.elements.length} 条`));
  assert.match(command(['search', catalog.elements[0].tagLabels['zh-Hans'][0]]), /#001/);
  assert.match(command(['search', catalog.elements[0].tags[0]]), /#001/);
  for (let offset = 0; offset < catalog.elements.length; offset += 8) {
    const ids = catalog.elements.slice(offset, offset + 8).map((e) => e.id);
    command(['get', ...ids, '--out', path.join(scratch, 'get')]);
    const prompts = command(['prompt', ...ids]);
    for (const match of prompts.matchAll(/file:\/\/[^\s]+/g)) assert.ok(fs.existsSync(fileURLToPath(match[0])));
  }
  for (const lang of ['en', 'ja']) { command(['get', '001', '--lang', lang]); command(['prompt', '001', '--lang', lang]); }
  for (const pack of catalog.packs) command(['kit', pack.pack, '--out', path.join(scratch, 'kit')]);
  assert.equal(fs.readdirSync(path.join(scratch, 'get')).length, catalog.elements.length);
  assert.equal(fs.existsSync(environment.MOTION_PROMPT_CACHE), false);
  passed(`随机目录、任意cwd、空缓存且阻断外网：${catalog.elements.length}条get/prompt与${catalog.packs.length}个kit`);

  const pick = await startPick();
  const origin = new URL(pick.url).origin;
  for (const pathname of ['/scripts/motion-prompt.mjs', '/.git/config', '/.audit/private.txt', '/assets/private.txt', '/%2e%2e/package.json', '/assets%5cfavicon.svg', '/assets//favicon.svg']) assert.equal((await request(origin + pathname)).status, 404);
  assert.equal((await request(origin, { headers: { Host: 'attacker.test' } })).status, 403);
  assert.equal((await request(origin + '/?t=wrong&ids=001')).status, 403);
  const invalid = new URL(new URL(pick.url).searchParams.get('cb')); invalid.searchParams.set('ids', '999');
  assert.equal((await request(invalid)).status, 400);
  assert.equal((await request(origin + '/assets/site.js')).status, 200);
  const asset = path.join(runtime, 'assets/favicon.svg'); const original = fs.readFileSync(asset);
  fs.writeFileSync(path.join(runtime, 'private.txt'), 'not public'); fs.unlinkSync(asset); fs.symlinkSync('../private.txt', asset);
  assert.equal((await request(origin + '/assets/favicon.svg')).status, 404);
  fs.unlinkSync(asset); fs.writeFileSync(asset, original); fs.unlinkSync(path.join(runtime, 'private.txt'));
  await finishPick(pick);
  const manyIds = [...catalog.elements.slice(0, 59).map((item) => item.id), catalog.elements.find((item) => item.pack === 'artstyle').id];
  for (const lang of ['en', 'ja']) {
    const many = await startPick(installed, {}, ['--lang', lang]);
    await finishPick(many, manyIds, lang);
    const kitCommands = many.output().split('\n').filter((line) => line.startsWith('kit '));
    assert.deepEqual(kitCommands, [...new Set(manyIds.map((id) => catalog.elements.find((item) => item.id === id).pack))].map((pack) => `kit ${pack}`));
  }
  passed('本地选择器：Host、token、未知编号、私有文件、路径穿越、符号链接边界、回传后关闭与持久引用');
  passed('60项跨包选择按8项分批，日英语言保留，所有get与逐包kit指示可执行');

  for (const rel of ['packs/artstyle/img/a\\b.webp', 'assets/../assets/site.js', 'assets//site.js', '/assets/site.js', 'assets/site.js/', 'assets/./site.js', 'assets/\0site.js']) assert.equal(isPublicPath(rel), false, rel);
  const savedRuntime = `${runtime}-saved`;
  fs.renameSync(runtime, savedRuntime);
  try {
    fs.symlinkSync(savedRuntime, runtime, 'dir');
    assert.throws(() => validateRuntime(runtime + path.sep), /manifest.json 缺失或无效/);
    assert.match(command(['info'], { status: 3 }), /manifest.json 缺失或无效/);
  } finally { fs.rmSync(runtime, { force: true }); fs.renameSync(savedRuntime, runtime); }
  for (const rel of ['manifest.json', 'assets/site.js', 'assets']) {
    const file = path.join(runtime, rel); const saved = `${file}-saved`;
    fs.renameSync(file, saved);
    try {
      fs.symlinkSync(saved, file, rel === 'assets' ? 'dir' : 'file');
      assert.throws(() => validateRuntime(runtime), /缺失或无效|校验失败/);
      assert.match(command(['info'], { status: 3 }), /缺失或无效|校验失败/);
    } finally { fs.rmSync(file, { force: true }); fs.renameSync(saved, file); }
  }
  for (const rel of ['manifest.json', 'assets/site.js']) {
    const file = path.join(runtime, rel); const saved = `${file}-saved`;
    fs.renameSync(file, saved);
    try {
      fs.mkdirSync(file);
      assert.match(command(['info'], { status: 3 }), /缺失或无效|校验失败/);
      fs.rmdirSync(file);
      if (process.platform !== 'win32') {
        assert.equal(spawnSync('mkfifo', [file]).status, 0);
        assert.match(command(['info'], { status: 3 }), /缺失或无效|校验失败/);
        fs.unlinkSync(file);
      }
    } finally { fs.rmSync(file, { force: true, recursive: true }); fs.renameSync(saved, file); }
  }
  passed('运行时拒绝非规范路径、根与清单软链接、中间目录软链接、目录和非常规文件');

  for (const rel of ['manifest.json', 'api/v1/catalog.json', 'assets/site.js', 'packs/artstyle/img/style-01.webp']) {
    const file = path.join(runtime, rel); const bytes = fs.readFileSync(file);
    fs.unlinkSync(file); assert.match(command(['info'], { status: 3 }), /缺失|无效|校验失败/); fs.writeFileSync(file, bytes);
  }
  const changed = path.join(runtime, 'assets/site.css'); const previous = fs.readFileSync(changed);
  fs.appendFileSync(changed, '\n/* drift */'); assert.throws(() => compareRuntime(runtime, manifest)); fs.writeFileSync(changed, previous);
  fs.writeFileSync(path.join(runtime, 'extra.txt'), 'extra'); assert.throws(() => compareRuntime(runtime, manifest)); fs.unlinkSync(path.join(runtime, 'extra.txt'));
  const buildSource = path.join(scratch, 'build-source');
  fs.cpSync(runtime, buildSource, { recursive: true });
  fs.unlinkSync(path.join(buildSource, 'packs/artstyle/img/style-01.webp'));
  assert.throws(() => createManifest(buildSource), /未随包交付/);
  passed('缺清单、缺目录、缺脚本、缺图片、内容漂移和多余文件均失败；源树缺图阻止生成');

  const apiOnly = path.join(scratch, 'api-only'); fs.cpSync(path.join(runtime, 'api/v1'), apiOnly, { recursive: true });
  assert.match(command(['pick', '--no-open'], { env: { MOTION_PROMPT_BASE: apiOnly }, status: 2 }), /同源/);
  for (const lang of ['zh-Hans', 'en', 'ja']) {
    const text = command(['get', '001', '--lang', lang], { env: { MOTION_PROMPT_BASE: apiOnly } });
    assert.ok(text.includes(`${pathToFileURL(apiOnly + path.sep).href}${lang}/e/001.txt`));
    assert.match(text, /未验证本地图库/);
    assert.ok(!text.includes('index.html'));
  }
  const sourceKit = fs.readFileSync(path.join(runtime, 'api/v1/kit/artstyle.js'), 'utf8');
  const executable = sourceKit.slice(sourceKit.indexOf('// @kit')).trimEnd();
  for (const base of [apiOnly, path.join(runtime, 'api/v1')]) {
    const kit = command(['kit', 'artstyle'], { env: { MOTION_PROMPT_BASE: base } });
    assert.equal(kit.slice(kit.indexOf('// @kit'), kit.indexOf('\n// 本文件仅包含辅助代码')).trimEnd(), executable);
    assert.ok(kit.includes(`${pathToFileURL(base + path.sep).href}kit/artstyle.js`));
    assert.match(kit, /未复制图片或字体/);
    if (base === apiOnly) {
      const header = kit.slice(kit.indexOf('\n'), kit.indexOf('// @kit'));
      assert.match(header, /未验证图库或素材来源/);
      assert.ok(!header.includes('packs/artstyle'));
    }
  }
  const oldCatalogFile = path.join(apiOnly, 'catalog.json');
  const oldCatalogBytes = fs.readFileSync(oldCatalogFile);
  const oldCatalog = JSON.parse(oldCatalogBytes); delete oldCatalog.elements[0].spec['zh-Hans'];
  fs.writeFileSync(oldCatalogFile, JSON.stringify(oldCatalog));
  assert.match(command(['prompt', '001'], { env: { MOTION_PROMPT_BASE: apiOnly }, status: 1 }), /缺少 zh-Hans 提示词数据/);
  for (const lang of ['en', 'ja']) command(['prompt', '001', '--lang', lang], { env: { MOTION_PROMPT_BASE: apiOnly } });
  fs.writeFileSync(oldCatalogFile, oldCatalogBytes);
  const override = await startPick(installed, { MOTION_PROMPT_BASE: path.join(runtime, 'api/v1') }); await finishPick(override);
  const second = path.join(scratch, 'second'); fs.cpSync(apiOnly, second, { recursive: true });
  const unreadable = path.join(scratch, 'unreadable');
  fs.mkdirSync(path.join(unreadable, 'catalog.json'), { recursive: true });
  assert.ok(command(['get', '001'], { env: { MOTION_PROMPT_BASE: `${unreadable},${second}` } }).includes(pathToFileURL(second + path.sep).href));
  fs.rmdirSync(path.join(unreadable, 'catalog.json'));
  const malformedCatalogs = ['{"elements":', '{"version":1}', '{"elements":[]}', '{"elements":[null]}'];
  for (const mutate of [
    (data) => { data.elements[0].id = '1'; },
    (data) => { data.elements[1].id = data.elements[0].id; },
    (data) => { data.elements[0].pack = '../outside'; },
    (data) => { data.elements[0].name = null; },
    (data) => { data.elements[0].tags = {}; },
    (data) => { data.elements[0].tagLabels = { 'zh-Hans': {} }; },
    (data) => { data.elements[0].spec.en = 'not a list'; },
    (data) => { data.packs = [null]; },
    (data) => { data.packs[0].categories = [null]; },
  ]) {
    const data = JSON.parse(oldCatalogBytes); mutate(data); malformedCatalogs.push(JSON.stringify(data));
  }
  for (const badCatalog of malformedCatalogs) {
    fs.writeFileSync(path.join(unreadable, 'catalog.json'), badCatalog);
    for (const action of ['get', 'prompt']) assert.ok(command([action, '001'], { env: { MOTION_PROMPT_BASE: `${unreadable},${second}` } }).includes(pathToFileURL(second + path.sep).href));
    const failure = command(['info'], { env: { MOTION_PROMPT_BASE: unreadable }, status: 3 });
    assert.ok(failure.includes(unreadable));
    assert.match(failure, /不是有效的 JSON|缺少 "elements" 列表|结构无效/);
    assert.doesNotMatch(failure, /TypeError|#undefined/);
  }
  fs.unlinkSync(path.join(apiOnly, 'zh-Hans/e/001.txt'));
  assert.match(command(['get', '001'], { env: { MOTION_PROMPT_BASE: `${apiOnly},${second}` }, status: 1 }), /未找到/);
  const remote = http.createServer((req, res) => {
    if (req.url === '/broken/catalog.json') { res.writeHead(200, { 'Content-Length': 10000 }); res.write('{"elements":'); setTimeout(() => res.destroy(), 10); return; }
    if (req.url === '/invalid/catalog.json') { res.end('{"elements":'); return; }
    const rel = req.url.replace(/^\//, '');
    if (!/^(catalog\.json|zh-Hans\/e\/001\.txt)$/.test(rel)) { res.writeHead(404); res.end(); return; }
    res.end(fs.readFileSync(path.join(second, rel)));
  });
  await withHttpServer(remote, async (remoteBase) => {
    for (const candidates of [remoteBase, `${remoteBase}/broken,${remoteBase}`, `${remoteBase}/invalid,${remoteBase}`]) {
      const remoteOutput = await remoteCommand(['prompt', '001'], { MOTION_PROMPT_BASE: candidates });
      assert.ok(remoteOutput.includes(`${remoteBase}/zh-Hans/e/001.txt`));
      assert.ok(!remoteOutput.includes(`${remoteBase}/broken/zh-Hans/e/001.txt`));
      assert.ok(!remoteOutput.includes(`${remoteBase}/invalid/zh-Hans/e/001.txt`));
    }
  });
  for (const failure of ['assertion', 'spawn', 'command']) {
    const server = http.createServer(); let url;
    await assert.rejects(withHttpServer(server, async (base) => {
      url = base;
      if (failure === 'assertion') assert.fail('预期断言失败');
      await remoteCommand(['unknown-command'], {}, failure === 'spawn' ? path.join(scratch, 'missing-node') : process.execPath);
    }));
    assert.equal(server.listening, false);
    await assert.rejects(request(url));
  }
  const failedListener = http.createServer();
  failedListener.listen = function () { queueMicrotask(() => this.emit('error', new Error('预期监听失败'))); return this; };
  await assert.rejects(withHttpServer(failedListener, () => assert.fail('监听失败不应执行用例')), /预期监听失败/);
  assert.equal(failedListener.listening, false);
  passed('API-only不猜图库或素材，artstyle可执行代码保持原样，缺语言受控失败，无效目录回退和HTTP引用正确');
  passed('显式HTTP用例断言、spawn、命令及监听失败均关闭监听器');

  if (browserMode) {
    const { chromium } = await import(pathToFileURL(path.join(root, 'make-your-own/node_modules/playwright/index.mjs')));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    await browserPick(installed); await browserPick(path.join(root, 'skills/motion-prompt'));
  }
  assert.equal(fs.existsSync(networkLog), false, '检测到意外外部网络访问');
  fs.writeFileSync(path.join(root, '.audit/offline-check-results.json'), JSON.stringify({ catalogVersion: catalog.version, checks, browser: browserMode }, null, 2) + '\n');
  console.log(`离线技能验收通过，共 ${checks.length} 组${browserMode ? '，含真实 Chrome 回传' : '；浏览器另运行 --browser'}。`);
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { for (const child of children) child.kill(); if (browser) await browser.close(); fs.rmSync(scratch, { recursive: true, force: true }); }
