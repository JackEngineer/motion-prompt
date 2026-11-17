#!/usr/bin/env node
// 构建 Motion Prompt：packs/*/{meta.json,pack.js}  ->  api/v1/**  +  assets/catalog.js  +  packs/**/README*.md
// 需要 Node.js 18 或更高版本，无额外依赖。校验失败时会列出问题并以状态码 1 退出。
//
//   node tools/build.mjs                 构建仓库
//   node tools/build.mjs --check         仅校验，不写入文件
//   node tools/build.mjs --root <dir>    读取 <dir>/packs，写入 <dir>（用于临时构建）
//   node tools/build.mjs --partial       允许素材包序号不连续（全局编号会变化，仅供开发使用）
import fs from 'node:fs';
import { mpPrompt } from '../skills/motion-prompt/scripts/prompt.mjs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE = 'https://showheyohtaki.github.io/motion-prompt/';
const REPO = 'https://github.com/showheyohtaki/motion-prompt';
const LICENCE = 'MIT License (c) 2026 Shohei Ohtaki';
const VERSION = 1;
const LANGS = ['ja', 'en', 'zh-Hans'];   // languages of the gallery, the API folders and the copyable prompt
const BASE_LANG = 'en';       // every text field needs this one; any other language code is optional

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const VERIFY = flag('--verify');
const CHECK_ONLY = flag('--check') || VERIFY;
const PARTIAL = flag('--partial');

const errors = [];
const warns = [];
let tagDictionary = {};
try {
  tagDictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tags.zh-Hans.json'), 'utf8'));
  if (!tagDictionary || typeof tagDictionary !== 'object' || Array.isArray(tagDictionary)) throw new Error();
}
catch { tagDictionary = {}; errors.push('data/tags.zh-Hans.json：中文标签词典缺失或格式不正确'); }
const err = (where, msg) => errors.push(`${where}：${msg}`);
const warn = (where, msg) => warns.push(`${where}：${msg}`);
const pad3 = n => String(n).padStart(3, '0');
const isStr = v => typeof v === 'string' && v.trim() !== '';

// ---------------------------------------------------------------- prompt template
// This function is also written into assets/catalog.js (as source text), so the site's
// "copy prompt" button and api/v1/<lang>/p/<id>.txt can never drift apart. Keep it self-contained.

// ---------------------------------------------------------------- pack.js: cut on markers
const MARK = /^ {2}\/\/ @(kit|shared|end|element (\d{2}))$/;
const LOOSE = /^\s*\/\/\s*@(kit|shared|end|element)\b/;

function dedent(lines) {
  const out = lines.map(l => (l.startsWith('  ') ? l.slice(2) : l.trimStart() === '' ? '' : l));
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  while (out.length && out[0].trim() === '') out.shift();
  return out.join('\n');
}

function cutPack(src, where) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  let ended = false;
  lines.forEach((line, i) => {
    const m = MARK.exec(line);
    if (!m) {
      if (LOOSE.test(line)) err(where, `第 ${i + 1} 行的标记格式有误，应为 "  // @kit | @element NN | @shared | @end" 中的一种，实际为 ${JSON.stringify(line)}`);
      if (cur) cur.lines.push(line);
      return;
    }
    if (ended) err(where, `第 ${i + 1} 行的标记出现在 @end 之后`);
    cur = null;
    if (m[1] === 'end') { ended = true; return; }
    cur = { type: m[2] ? 'element' : m[1], no: m[2] || null, line: i + 1, lines: [line] };
    blocks.push(cur);
  });
  if (!ended) err(where, '缺少 "  // @end" 标记');
  const kits = blocks.filter(b => b.type === 'kit');
  if (kits.length !== 1) err(where, `应有一个 @kit 块，实际有 ${kits.length} 个`);
  else if (blocks[0].type !== 'kit') err(where, '@kit 必须位于第一个代码块');
  const elements = blocks.filter(b => b.type === 'element');
  elements.forEach((b, i) => {
    const want = String(i + 1).padStart(2, '0');
    if (b.no !== want) err(where, `第 ${b.line} 行为 "@element ${b.no}"，应为 "@element ${want}"（编号须从 01 开始连续递增）`);
    if (!b.lines.slice(1).some(l => l.trim() !== '')) err(where, `@element ${b.no} 内容为空`);
  });
  const kitText = blocks.filter(b => b.type !== 'element').map(b => dedent(b.lines)).join('\n\n');
  return { elements: elements.map(b => ({ no: b.no, code: dedent(b.lines) })), kitText };
}

// ---------------------------------------------------------------- pack.js: read width/height/cycle/fonts
// pack.js is browser code. Run its factory against inert stand-ins for the DOM, only to read the
// returned { width, height, cycle, cells, fonts, images?, ready? }. Nothing is drawn here (tools/check.mjs does that).
function inert() {
  const target = function () {};
  const p = new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then') return undefined;
      if (key === 'length') return 0;
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}

function evalPack(src, file, where) {
  let got = null;
  const any = inert();
  const sandbox = {
    MotionPrompt: { packs: {}, pack(id, factory) { const r = factory(); got = { id, r }; return r; }, loadFonts: async () => {} },
    document: { createElement: () => any, fonts: any, baseURI: SITE, documentElement: any, body: any },
    Image: any, Path2D: any, OffscreenCanvas: any, FontFace: any, DOMMatrix: any, ImageData: any,
    performance: { now: () => 0 }, devicePixelRatio: 1, location: { search: '', href: SITE, hash: '' },
    console: { log() {}, warn() {}, error() {}, info() {} },
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {},
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 8000 });
  } catch (e) {
    err(where, `pack.js 无法在浏览器之外执行（${e && e.message}）。kit 顶层代码不能依赖实际的画布绘制结果。`);
    return null;
  }
  if (!got) { err(where, 'pack.js 未调用 MotionPrompt.pack(id, factory)'); return null; }
  return got;
}

// ---------------------------------------------------------------- meta.json validation
// A text field is an object keyed by language code: { en: "...", ja: "...", es: "..." }.
// `en` is required. Other languages are optional, but a key that is present must not be empty.
function bi(obj, where, key) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { err(where, `缺少有效的 ${key}（至少需要 { ${BASE_LANG}: "..." }）`); return; }
  if (!isStr(obj[BASE_LANG])) err(where, `${key}.${BASE_LANG} 缺失或为空`);
  for (const l of Object.keys(obj)) if (!isStr(obj[l])) err(where, `${key}.${l} 为空`);
}
const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
// Languages a pack is written in = the keys of its title. Read before fillLangs() adds fallbacks.
function packLangs(meta) {
  const t = meta && meta.title && typeof meta.title === 'object' ? meta.title : {};
  const ls = Object.keys(t).filter(l => isStr(t[l]));
  return [BASE_LANG, ...ls.filter(l => l !== BASE_LANG).sort()];
}
// The gallery and the API read every language in LANGS. Where a pack has no text in one of them,
// the English text stands in, so a pack written in (say) en + es still shows up everywhere.
function fillLangs(meta) {
  const fill = o => { if (o && typeof o === 'object' && !Array.isArray(o)) for (const l of LANGS) if (o[l] == null && o[BASE_LANG] != null) o[l] = o[BASE_LANG]; };
  fill(meta.title);
  for (const c of meta.categories || []) fill(c);
  for (const e of meta.elements || []) if (e && typeof e === 'object') for (const k of ['name', 'meaning', 'ask', 'summary', 'spec', 'use']) fill(e[k]);
}

function validateMeta(meta, where) {
  if (!isStr(meta.pack)) err(where, '缺少 pack');
  if (!Number.isInteger(meta.order) || meta.order < 1) err(where, 'order 必须为正整数');
  bi(meta.title, where, 'title');
  for (const l of packLangs(meta)) if (!LANG_CODE.test(l)) err(where, `title 的键 "${l}" 不是有效的语言代码（例如 en、ja、es、zh-Hans）`);
  if (!Array.isArray(meta.categories) || !meta.categories.length) err(where, 'categories 缺失或为空');
  const slugs = new Set();
  for (const c of meta.categories || []) {
    if (!isStr(c.slug)) err(where, '有类别未设置 slug');
    else if (slugs.has(c.slug)) err(where, `类别 slug "${c.slug}" 重复`);
    slugs.add(c.slug);
    if (!isStr(c[BASE_LANG])) err(where, `类别 "${c.slug}" 的 ${BASE_LANG} 缺失或为空`);
  }
  if (!Array.isArray(meta.elements) || !meta.elements.length) { err(where, 'elements 缺失或为空'); return; }
  const seen = new Set();
  meta.elements.forEach((e, i) => {
    const want = String(i + 1).padStart(2, '0');
    const w = `${where} 元素 ${e && e.no ? e.no : `[${i}]`}`;
    if (!e || typeof e !== 'object') { err(w, '元素必须为对象'); return; }
    if (e.no !== want) err(w, `no 应为 "${want}"（元素编号须从 01 开始连续递增）`);
    if (!isStr(e.slug)) err(w, '缺少 slug');
    else {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) err(w, `slug "${e.slug}" 只能由小写字母和数字组成，各段用连字符分隔`);
      if (seen.has(e.slug)) err(w, `slug "${e.slug}" 在此素材包中重复`);
      seen.add(e.slug);
    }
    if (!isStr(e.category)) err(w, '缺少 category');
    else if (!slugs.has(e.category)) err(w, `categories 中未定义类别 "${e.category}"`);
    bi(e.name, w, 'name');
    bi(e.meaning, w, 'meaning');
    if (e.ask == null) warn(w, '缺少 ask，请提供一句点名向 AI 请求此动效的示例');
    else bi(e.ask, w, 'ask');
    bi(e.summary, w, 'summary');
    bi(e.use, w, 'use');
    if (!e.spec || typeof e.spec !== 'object' || Array.isArray(e.spec)) err(w, `缺少有效的 spec（至少需要 { ${BASE_LANG}: [] }）`);
    else {
      if (!Array.isArray(e.spec[BASE_LANG])) err(w, `缺少 spec.${BASE_LANG} 数组`);
      for (const l of Object.keys(e.spec)) {
        const s = e.spec[l];
        if (!Array.isArray(s) || !s.length) err(w, `spec.${l} 缺失或为空`);
        else {
          if (s.some(x => !isStr(x))) err(w, `spec.${l} 包含空行`);
          if (s.length < 3 || s.length > 6) warn(w, `spec.${l} 有 ${s.length} 行，规范要求 3 到 6 行`);
          if (Array.isArray(e.spec[BASE_LANG]) && s.length !== e.spec[BASE_LANG].length) warn(w, `spec.${l} 有 ${s.length} 行，与 spec.${BASE_LANG} 的 ${e.spec[BASE_LANG].length} 行不一致`);
        }
      }
    }
    if (e.tagOverrides) {
      const values = e.tagOverrides['zh-Hans'];
      if (!values || typeof values !== 'object' || Array.isArray(values)) err(w, 'tagOverrides.zh-Hans 必须为标签到译名的对象');
      else for (const [tag, value] of Object.entries(values)) {
        if (!e.tags?.includes(tag) || !isStr(value)) err(w, `无效的中文标签覆盖：${tag}`);
      }
    }
    if (!Array.isArray(e.tags) || !e.tags.length) err(w, 'tags 缺失或为空');
    else {
      for (const tag of e.tags) if (!isStr(tagDictionary[tag])) err(w, `标签缺少中文翻译：${tag}`);
      if (e.tags.some(t => !isStr(t))) err(w, 'tags 包含空项');
      else if (e.tags.some(t => t !== t.toLowerCase() || /[\t\n,]/.test(t))) err(w, 'tags 必须为小写，且不能含有逗号、制表符或换行符');
      if (e.tags.length < 4 || e.tags.length > 8) warn(w, `有 ${e.tags.length} 个标签，规范要求 4 到 8 个`);
    }
  });
}

// ---------------------------------------------------------------- read packs
const packsDir = path.join(ROOT, 'packs');
const dirs = fs.existsSync(packsDir)
  ? fs.readdirSync(packsDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name).sort()
  : [];
const packs = [];
for (const dir of dirs) {
  const where = `packs/${dir}`;
  const metaFile = path.join(packsDir, dir, 'meta.json');
  const packFile = path.join(packsDir, dir, 'pack.js');
  const hasMeta = fs.existsSync(metaFile), hasPack = fs.existsSync(packFile);
  if (!hasMeta && !hasPack) continue; // an empty folder: someone has only just started
  if (!hasMeta || !hasPack) {
    const msg = `缺少 ${hasMeta ? 'pack.js' : 'meta.json'}`;
    if (PARTIAL) warn(where, msg + '，已跳过该素材包（--partial）'); else err(where, msg);
    continue;
  }
  let meta;
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (e) { err(`${where}/meta.json`, `JSON 格式无效（${e.message}）`); continue; }
  const before = errors.length;
  validateMeta(meta, `${where}/meta.json`);
  const langs = packLangs(meta);
  const raw = JSON.parse(JSON.stringify(meta)); // as written; the pack READMEs are made from this
  if (errors.length === before) fillLangs(meta);
  if (meta.pack !== dir) err(`${where}/meta.json`, `pack 为 "${meta.pack}"，与目录名 "${dir}" 不一致`);
  const src = fs.readFileSync(packFile, 'utf8');
  const cut = cutPack(src, `${where}/pack.js`);
  const got = evalPack(src, packFile, `${where}/pack.js`);
  if (!src.split('\n')[0].includes('MIT License')) warn(`${where}/pack.js`, '首行须包含规范要求的 MIT License 声明');
  const nMeta = Array.isArray(meta.elements) ? meta.elements.length : 0;
  if (cut.elements.length !== nMeta) err(where, `pack.js 有 ${cut.elements.length} 个 @element 块，与 meta.json 的 ${nMeta} 个元素不一致`);
  let info = null;
  if (got) {
    const r = got.r || {};
    if (got.id !== dir) err(`${where}/pack.js`, `MotionPrompt.pack('${got.id}', …) 的编号与目录名不一致`);
    for (const k of ['width', 'height', 'cycle']) if (!(typeof r[k] === 'number' && r[k] > 0)) err(`${where}/pack.js`, `工厂函数返回的 "${k}" 必须为正数`);
    if (!Array.isArray(r.cells)) err(`${where}/pack.js`, '工厂函数未返回 cells 数组');
    else {
      if (r.cells.length !== nMeta) err(where, `cells 有 ${r.cells.length} 项，与 meta.json 的 ${nMeta} 个元素不一致`);
      for (let i = 0; i < r.cells.length; i++) if (typeof r.cells[i] !== 'function') err(`${where}/pack.js`, `cells[${i}] 必须为函数`);
    }
    const fonts = Array.isArray(r.fonts) ? r.fonts.map(f => ({ family: String(f.family), url: String(f.url) })) : [];
    for (const f of fonts) if (!fs.existsSync(path.join(packsDir, dir, f.url))) err(`${where}/pack.js`, `素材包目录中找不到已声明的字体文件 "${f.url}"`);
    // A pack may ship its own images (packs/<pack>/img/). It declares them in `images` and returns `ready`, a promise that settles when they have loaded.
    const images = Array.isArray(r.images) ? r.images.map(String) : [];
    for (const f of images) {
      if (!/^img\/[a-z0-9-]+\.(webp|png|jpg)$/.test(f)) err(`${where}/pack.js`, `图片 "${f}" 必须位于 img/，使用小写文件名及 .webp、.png 或 .jpg 扩展名`);
      else if (!fs.existsSync(path.join(packsDir, dir, f))) err(`${where}/pack.js`, `素材包目录中找不到已声明的图片文件 "${f}"`);
    }
    if (images.length && !(r.ready && typeof r.ready.then === 'function')) err(`${where}/pack.js`, '声明了 images，须同时返回 ready Promise');
    info = { width: r.width, height: r.height, cycle: r.cycle, fonts, images };
  }
  if (errors.length === before && info) packs.push({ dir, meta, raw, cut, info, src, langs });
}

packs.sort((a, b) => a.meta.order - b.meta.order);
for (let i = 1; i < packs.length; i++) if (packs[i].meta.order === packs[i - 1].meta.order)
  err('packs', `"${packs[i].dir}" 和 "${packs[i - 1].dir}" 的 order 均为 ${packs[i].meta.order}`);
if (!dirs.length || (!packs.length && !errors.length)) err('packs', `${packsDir} 中找不到素材包`);
packs.forEach((p, i) => {
  if (p.meta.order !== i + 1) {
    const msg = `"${p.dir}" 的 order 为 ${p.meta.order}，应为 ${i + 1}，序号缺失会导致全局编号变化`;
    if (PARTIAL) warn('packs', msg + '（--partial 允许缺失）'); else err('packs', msg);
  }
});

// ---------------------------------------------------------------- assemble
// Scaling the 2D context is only safe when the code never addresses device pixels directly.
// Reading the transform (getTransform) is allowed: lp2 #09 uses it to draw its offscreen canvases at the caller's scale.
// check.mjs still compares a 2x drawing with the 1x one for every pack marked scalable.
const PIXEL_BOUND = /\b(setTransform|resetTransform|getImageData|putImageData|createImageData)\b|\.canvas\b/;

// The version changes whenever any pack source changes, so the skill CLI's cache never serves stale elements.
const contentHash = crypto.createHash('sha256');
contentHash.update(JSON.stringify(tagDictionary)).update(mpPrompt.toString()).update(fs.readFileSync(fileURLToPath(import.meta.url)));
for (const d of fs.readdirSync(path.join(ROOT, 'packs')).sort()) {
  for (const f of ['pack.js', 'meta.json']) {
    const fp = path.join(ROOT, 'packs', d, f);
    if (fs.existsSync(fp)) contentHash.update(d + '/' + f + '\0').update(fs.readFileSync(fp));
  }
}
const catalog = { version: `${VERSION}.${contentHash.digest('hex').slice(0, 10)}`, site: SITE, repo: REPO, count: 0, packs: [], elements: [] };
const codeById = {};
let n = 0;
for (const p of packs) {
  const { meta, info, cut } = p;
  const first = n + 1;
  meta.elements.forEach((e, i) => {
    n += 1;
    const id = pad3(n);
    catalog.elements.push({
      id, pack: meta.pack, no: e.no, slug: e.slug, category: e.category,
      width: info.width, height: info.height, cycle: info.cycle,
      name: e.name, meaning: e.meaning, ...(e.ask ? { ask: e.ask } : {}), summary: e.summary, spec: e.spec, use: e.use, tags: e.tags, tagLabels: { 'zh-Hans': e.tags.map(tag => e.tagOverrides?.['zh-Hans']?.[tag] || tagDictionary[tag]) },
    });
    codeById[id] = cut.elements[i].code;
  });
  catalog.packs.push({
    pack: meta.pack, order: meta.order, title: meta.title, langs: p.langs, categories: meta.categories,
    count: meta.elements.length, first: pad3(first), last: pad3(n),
    width: info.width, height: info.height, cycle: info.cycle, fonts: info.fonts, ...(info.images.length ? { images: info.images } : {}),
    scalable: !PIXEL_BOUND.test(p.src),
  });
}
catalog.count = n;
const packOf = Object.fromEntries(catalog.packs.map(p => [p.pack, p]));
const kitOf = Object.fromEntries(packs.map(p => [p.dir, p.cut.kitText]));

// ---------------------------------------------------------------- text renderers
const T = {
  'zh-Hans': { what: '示例内容', spec: '动效规格', use: '适用场景', size: '尺寸', cycle: '循环时长', needs: '依赖', demo: '动态示例', pack: '素材包', cat: '类别', tags: '标签',
    sig: 'cells[i](k, w, h, u)：k 为 CanvasRenderingContext2D（调用方已清空画布并用 save/restore 包裹），w、h 为尺寸，u 为秒数，范围 [0, cycle)。画面只取决于 u。',
    code: '以下为元素代码。CELLS、常量和辅助函数在 kit 中。' },
  ja: { what: '何が起きるか', spec: '動きの仕様', use: '使いどころ', size: 'サイズ', cycle: '1周', needs: 'Needs', demo: '動く見本', pack: 'パック', cat: 'カテゴリ', tags: 'タグ',
    sig: 'cells[i](k, w, h, u) … k = CanvasRenderingContext2D（呼ぶ側でクリアと save/restore 済み）、w・h = サイズ、u = 秒（0 以上 1周 未満）。u だけで絵が決まる。',
    code: 'ここから要素のコード。CELLS や定数・補助関数は kit にある。' },
  en: { what: 'What happens', spec: 'Motion spec', use: 'When to use it', size: 'Size', cycle: 'Cycle', needs: 'Needs', demo: 'Live demo', pack: 'Pack', cat: 'Category', tags: 'Tags',
    sig: 'cells[i](k, w, h, u): k = CanvasRenderingContext2D (already cleared and wrapped in save/restore by the caller), w,h = size, u = seconds in [0, cycle). The picture depends only on u.',
    code: 'Element code starts here. CELLS, constants and helpers live in the kit.' },
};

function elementTxt(el, lang) {
  const t = T[lang], p = packOf[el.pack];
  const cat = p.categories.find(c => c.slug === el.category);
  const name = lang === 'en' ? `${el.name.en} / ${el.name.ja}` : `${el.name[lang]} / ${lang === 'zh-Hans' ? '英文名：' : ''}${el.name.en}`;
  const zh = lang === 'zh-Hans';
  const sep = zh ? '：' : ': ';
  const head = [
    `Motion Prompt #${el.id} · ${LICENCE} · ${SITE}#${el.id}`,
    '',
    name,
    `${t.pack}${sep}${el.pack} (${p.title[lang]}) · ${zh ? '元素' : 'element'} ${el.no} · ${t.cat}${sep}${cat ? cat[lang] : el.category}`,
    `${t.what}${sep}${el.summary[lang]}`,
    t.spec + sep.trimEnd(),
    ...el.spec[lang].map(s => `  - ${s}`),
    `${t.use}${sep}${el.use[lang]}`,
    `${t.tags}${sep}${(zh ? el.tagLabels['zh-Hans'] : el.tags).join(zh ? '、' : ', ')}`,
    `${t.size}${sep}${el.width}x${el.height} px · ${t.cycle}${sep}${el.cycle} ${zh ? '秒' : 's'}`,
    `${t.needs}${sep}${zh ? '共用辅助代码' : 'kit'} ${el.pack} -> ${zh ? '../../kit/' : SITE + 'api/v1/kit/'}${el.pack}.js`,
    `${t.demo}${sep}${zh ? '../../../../index.html?lang=zh-Hans' : SITE}#${el.id}`,
    ...(zh ? ['以上资源路径相对于本规格文件。'] : []),
    '',
    t.sig,
    t.code,
  ].map(l => (l ? `// ${l}` : '//'));
  return head.join('\n') + '\n\n' + codeById[el.id] + '\n';
}

function kitJs(p) {
  const range = p.first === p.last ? `#${p.first}` : `#${p.first}-${p.last}`;
  const W = p.width, H = p.height, C = p.cycle;
  const head = [
    `Motion Prompt ${range} · ${LICENCE} · ${SITE}#${p.first}`,
    '',
    `以下为素材包 "${p.pack}"（${p.title['zh-Hans']}）各元素共用的常量和辅助函数。`,
    `元素 ${range} · ${W}x${H} px · 循环时长 ${C} 秒`,
    `元素代码（简体中文）：../zh-Hans/e/<id>.txt（相对于本辅助代码文件）`,
    '其他语言：../en/e/<id>.txt（英文）、../ja/e/<id>.txt（日文）',
    ...(p.fonts.length ? [`请在绘制前加载字体：${p.fonts.map(f => `${f.family} (../../../packs/${p.pack}/${f.url})`).join('、')}。`] : []),
    ...(p.images ? [`共用辅助代码会加载 ${p.images.length} 张图片。随 pack.js 运行时从其目录读取，独立使用时从 ${SITE}packs/${p.pack}/img/ 加载。图片全部加载后 \`ready\` 完成。在此之前，各元素只绘制纯色背景。`] : []),
    '',
    '在浏览器中单独运行一个元素：',
    '  1. 将本文件内容粘贴到 <script> 中。',
    '  2. 在其后粘贴元素代码。元素代码会设置 CELLS[n - 1]，其中 n 是元素在素材包内的编号。',
    '  3. 接着添加以下代码。',
    `       const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H}; document.body.append(c);`,
    `       const k = c.getContext('2d'), cell = CELLS.find(Boolean), t0 = performance.now();`,
    '       (function loop() {',
    `         const u = ((performance.now() - t0) / 1000) % ${C};   // 单位为秒，0 <= u < ${C}`,
    `         k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, ${W}, ${H});`,
    `         k.save(); cell(k, ${W}, ${H}, u); k.restore();`,
    '         requestAnimationFrame(loop);',
    '       })();',
    '各元素的画面只取决于 u，因此可用同一个函数渲染视频帧。将 u 设为 frame / fps。',
  ].map(l => (l ? `// ${l}` : '//'));
  return head.join('\n') + '\n\n' + kitOf[p.pack] + '\n';
}

const tsvCell = s => String(s).replace(/[\t\r\n]+/g, ' ').trim();
function catalogTsv(lang) {
  const columns = 'id\tpack\tcategory\ttitle\ttags\tsummary';
  const head = lang === 'zh-Hans'
    ? `# Motion Prompt 目录（简体中文）· ${catalog.count} 个元素 · ${SITE} · 列：${columns}`
    : `# Motion Prompt catalog (${lang}) · ${catalog.count} elements · ${SITE} · columns: ${columns}`;
  const rows = catalog.elements.map(el => {
    const cat = packOf[el.pack].categories.find(c => c.slug === el.category);
    const title = lang === 'en' ? `${el.name.en} (${el.name.ja})` : `${el.name[lang]} (${el.name.en})`;
    return [el.id, el.pack, cat ? cat[lang] : el.category, title, (lang === 'zh-Hans' ? el.tagLabels['zh-Hans'] : el.tags).join(','), el.summary[lang]].map(tsvCell).join('\t');
  });
  return [head, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------- packs/<pack>/README*.md (the name lists, readable on GitHub)
// One file per language the pack is written in: README.md (en), README.<lang>.md (the others).
// Headings fall back to English for a language that has no block here; add a block to translate them.
const DOC = {
  en: { gen: 'Generated by tools/build.mjs from meta.json. Edit meta.json, not this file.', names: 'names', pack: 'pack', langs: 'Languages',
    intro: 'Find the name, then say it to your AI. Add how long, how strong and what moves, and the result gets closer to what you had in mind.',
    no: '#', name: 'Name', en: 'English', meaning: 'What it is', ask: 'How to ask an AI',
    more: 'Each number opens the moving sample in the gallery. Timings, easing values and reference code for one name:', all: 'All packs', preview: 'preview' },
  ja: { gen: 'tools/build.mjs が meta.json から作ったファイルです。直すときは meta.json を編集してください。', names: '個の名前', pack: 'パック', langs: '言語',
    intro: '名前を見つけたら、そのままAIに伝えてください。「何秒で」「どのくらい強く」「何が動くか」を添えると、思った通りに近づきます。',
    no: '番号', name: '名前', en: '英語名', meaning: 'ひとこと', ask: 'AIへの頼み方の例',
    more: '番号を押すと、ギャラリーの動く見本が開きます。1つの名前の秒数・イージングの数値・参考コード:', all: 'パックの一覧', preview: '見本' },
  'zh-Hant': { gen: '這個檔案由 tools/build.mjs 根據 meta.json 產生。要修改請編輯 meta.json，不要改這個檔案。', names: '個名稱', pack: '包', langs: '語言',
    intro: '找到名稱後，直接告訴 AI。再加上「幾秒」「多強」「什麼在動」，結果會更接近你想要的。',
    no: '編號', name: '名稱', en: '英文名稱', meaning: '一句話說明', ask: '對 AI 的說法範例',
    more: '點編號會在圖庫打開會動的範例。單一名稱的秒數、緩動數值和參考程式碼：', all: '所有包', preview: '範例' },
  es: { gen: 'Generado por tools/build.mjs desde meta.json. Para corregir, edita meta.json, no este archivo.', names: 'nombres', pack: 'pack', langs: 'Idiomas',
    intro: 'Encuentra el nombre y díselo a tu IA. Si agregas cuánto dura, con qué intensidad y qué se mueve, el resultado se acerca más a lo que imaginabas.',
    no: '#', name: 'Nombre', en: 'Inglés', meaning: 'Qué es', ask: 'Cómo pedírselo a una IA',
    more: 'Cada número abre la muestra en movimiento en la galería. Tiempos, valores de easing y código de referencia de un nombre:', all: 'Todos los packs', preview: 'muestra' },
  'zh-Hans': { gen: '由 tools/build.mjs 根据 meta.json 生成。请编辑 meta.json，不要直接修改本文件。', names: '个术语', pack: '素材包', langs: '语言',
    intro: '找到名称后直接告诉 AI。补充时长、幅度和运动对象，可以更接近你想要的效果。',
    no: '编号', name: '名称', en: '英文名', meaning: '含义', ask: '向 AI 提出需求的示例',
    more: '点击编号可打开动态示例。单个术语的时间、缓动数值与参考代码位于：', all: '全部素材包', preview: '示例' },
};
const LANG_NAME = { en: 'English', ja: '日本語', zh: '中文', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย', hi: 'हिन्दी', ar: 'العربية', ru: 'Русский', tr: 'Türkçe' };
const readmeName = lang => (lang === BASE_LANG ? 'README.md' : `README.${lang}.md`);
const tx = (o, lang) => (o && isStr(o[lang]) ? o[lang] : o && isStr(o[BASE_LANG]) ? o[BASE_LANG] : '');
const mdCell = s => String(s).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();

function packReadme(src, p, lang) {
  // src = the pack as written (before fallbacks were filled), p = its catalog entry
  const d = DOC[lang] || DOC.en, meta = src.raw;
  const apiLang = LANGS.includes(lang) ? lang : BASE_LANG;
  const others = src.langs.filter(l => l !== lang).map(l => `[${LANG_NAME[l] || l}](${readmeName(l)})`);
  const out = [
    `<!-- ${d.gen} -->`,
    '',
    `# ${tx(meta.title, lang)}`,
    '',
    `${p.count} ${d.names} · #${p.first}–${p.last} · ${d.pack} \`${p.pack}\`` + (others.length ? ` · ${d.langs}: ${others.join(' / ')}` : ''),
    '',
    d.intro,
    '',
  ];
  const preview = `preview-${p.pack}${lang === 'zh-Hans' ? '-zh-Hans' : ''}.gif`;
  if (fs.existsSync(path.join(ROOT, 'assets', preview))) out.push(`![${tx(meta.title, lang)} ${d.preview}](../../assets/${preview})`, '');
  const withEn = lang !== BASE_LANG;
  for (const c of meta.categories) {
    const els = catalog.elements.filter(e => e.pack === p.pack && e.category === c.slug);
    if (!els.length) continue;
    out.push(`## ${tx(c, lang)}`, '');
    out.push(`| ${[d.no, d.name, ...(withEn ? [d.en] : []), d.meaning, d.ask].join(' | ')} |`);
    out.push(`|${Array(withEn ? 5 : 4).fill('---').join('|')}|`);
    for (const el of els) {
      const raw = meta.elements.find(e => e.slug === el.slug);
      out.push(`| ${[`[#${el.id}](${lang === 'zh-Hans' ? '../../index.html?lang=zh-Hans' : SITE}#${el.id})`, `**${mdCell(tx(raw.name, lang))}**`, ...(withEn ? [mdCell(raw.name[BASE_LANG])] : []), mdCell(tx(raw.meaning, lang)), mdCell(tx(raw.ask, lang))].join(' | ')} |`);
    }
    out.push('');
  }
  out.push(`${d.more} \`api/v1/${apiLang}/e/<id>.txt\` ([#${p.first}](../../api/v1/${apiLang}/e/${p.first}.txt)).`, '');
  out.push(`[${d.all}](../${lang === 'zh-Hans' ? 'README.zh-Hans.md' : 'README.md'})`, '');
  return out.join('\n');
}

function packsIndex(lang = 'en') {
  const zh = lang === 'zh-Hans';
  const out = [
    `<!-- ${DOC[lang].gen} -->`,
    '',
    zh ? '# 素材包' : '# Packs',
    '',
    zh ? '每个素材包收录一个领域的术语。可在下方阅读列表，也可打开示例库查看动态演示。' : 'A pack is one field\'s set of names. Each list below is readable here on GitHub; the gallery shows the same names moving.',
    '',
    zh ? '| 编号 | 素材包 | 术语数量 | 语言版本 |' : '| Numbers | Pack | Names | Lists |',
    '|---|---|---|---|',
  ];
  for (const src of packs) {
    const p = packOf[src.dir];
    const lists = src.langs.map(l => `[${LANG_NAME[l] || l}](${p.pack}/${readmeName(l)})`).join(' · ');
    out.push(`| ${p.first}–${p.last} | \`${p.pack}\` — ${mdCell(src.raw.title[lang] || src.raw.title[BASE_LANG])} | ${p.count} | ${lists} |`);
  }
  out.push('', zh ? '为你的领域新增素材包，或为现有素材包增加语言版本，请参阅[贡献指南](../CONTRIBUTING.zh-Hans.md)。' : 'To add a pack for your field, or a language to an existing pack, see [CONTRIBUTING.md](../CONTRIBUTING.md).', '');
  return out.join('\n');
}

// ---------------------------------------------------------------- report + write
const report = () => {
  for (const w of warns) console.warn(`警告  ${w}`);
  for (const e of errors) console.error(`错误  ${e}`);
};
if (errors.length) {
  report();
  console.error(`\n构建失败。发现 ${errors.length} 个错误和 ${warns.length} 个警告，未写入文件。`);
  process.exit(1);
}

const files = new Map();
files.set('api/v1/catalog.json', JSON.stringify(catalog, null, 1) + '\n');
for (const lang of LANGS) {
  files.set(`api/v1/${lang}/catalog.tsv`, catalogTsv(lang));
  for (const el of catalog.elements) {
    files.set(`api/v1/${lang}/e/${el.id}.txt`, elementTxt(el, lang));
    files.set(`api/v1/${lang}/p/${el.id}.txt`, mpPrompt(el, packOf[el.pack].title[lang], lang) + '\n');
  }
}
for (const p of catalog.packs) files.set(`api/v1/kit/${p.pack}.js`, kitJs(p));
for (const src of packs) for (const lang of src.langs) files.set(`packs/${src.dir}/${readmeName(lang)}`, packReadme(src, packOf[src.dir], lang));
files.set('packs/README.md', packsIndex());
files.set('packs/README.zh-Hans.md', packsIndex('zh-Hans'));
files.set('assets/catalog.js',
  `/* Generated by tools/build.mjs — do not edit. Source of truth: packs/<pack>/{meta.json,pack.js} */\n` +
  `window.MP_CATALOG = ${JSON.stringify(catalog)};\n` +
  `window.MP_PROMPT = ${mpPrompt.toString()};\n`);

if (VERIFY) {
  for (const [rel, expected] of files) {
    const filename = path.join(ROOT, rel);
    if (!fs.existsSync(filename) || !fs.lstatSync(filename).isFile() || fs.readFileSync(filename, 'utf8') !== expected) errors.push(`生成文件缺失或已过期：${rel}`);
  }
  const pending = [path.join(ROOT, 'api/v1')];
  while (pending.length) {
    const directory = pending.pop();
    if (!fs.existsSync(directory)) continue;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) pending.push(filename);
      else if (item.isSymbolicLink() || !files.has(path.relative(ROOT, filename).split(path.sep).join('/'))) errors.push(`多余或无效的生成文件：${path.relative(ROOT, filename)}`);
    }
  }
}
report();
if (errors.length) { console.error('生成结果与当前源文件不一致，请运行 node tools/build.mjs。'); process.exit(1); }
if (!CHECK_ONLY) {
  fs.rmSync(path.join(ROOT, 'api', 'v1'), { recursive: true, force: true }); // generated only; drop stale IDs
  for (const [rel, text] of files) {
    const f = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}
const summary = catalog.packs.map(p => `${p.pack} ${p.first}-${p.last}`).join('、');
console.log(`${CHECK_ONLY ? '已校验' : '已构建'} ${catalog.packs.length} 个素材包，共 ${catalog.count} 个元素（${summary}）`);
console.log(`${VERIFY ? '已核对' : CHECK_ONLY ? '预计写入' : '已写入'} ${files.size} 个文件，目标目录为 ${ROOT}${warns.length ? ` · ${warns.length} 个警告` : ''}`);
