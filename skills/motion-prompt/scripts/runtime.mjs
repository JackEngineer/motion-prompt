import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MEDIA = 'png|jpe?g|webp|gif|svg|ico|mp4|webm|woff2?|ttf|otf';
const RULES = [
  /^(?:index|found)\.html$/,
  /^(?:README|CONTRIBUTING|FORMAT|THIRD-PARTY-NOTICES)(?:\.[\w-]+)?\.md$/,
  /^LICENSE$/,
  /^data\/tags\.zh-Hans\.json$/,
  /^skills\/motion-prompt\/(?:SKILL\.md|README(?:\.[\w-]+)?\.md|references\/[\w.-]+\.md)$/,
  new RegExp(`^assets/[^/]+\\.(?:js|css|${MEDIA})$`),
  /^api\/v1\/(?:catalog\.json|kit\/[\w-]+\.js|(?:en|ja|zh-Hans)\/(?:catalog\.tsv|[ep]\/\d{3}\.txt))$/,
  /^packs\/(?:README(?:\.[\w-]+)?\.md|[\w-]+\/(?:meta\.json|pack\.js|README(?:\.[\w-]+)?\.md))$/,
  new RegExp(`^packs/[\\w-]+/(?:img|fonts)/[^/]+\\.(?:${MEDIA})$`),
  /^examples\/found\.json$/,
  /^make-your-own\/(?:README(?:\.[\w-]+)?\.md|render\.mjs|package(?:-lock)?\.json)$/,
  /^make-your-own\/prompts\/(?:en|ja|zh-Hans)\/[\w-]+\.md$/,
  new RegExp(`^make-your-own/examples/[\\w-]+/(?:en|ja|zh-Hans)/[\\w.-]+\\.(?:html|md|${MEDIA})$`),
];
const ROOTS = ['index.html', 'found.html', 'LICENSE', 'assets', 'api', 'packs', 'examples', 'make-your-own', 'skills/motion-prompt', 'data/tags.zh-Hans.json'];
const DENIED = /^(?:\.|node_modules$|runtime$|out$|output$|cache$|private$)/i;
const REQUIRED = ['index.html', 'found.html', 'assets/site.js', 'assets/site.css', 'assets/catalog.js', 'assets/runtime.js', 'assets/found.js', 'assets/found.css', 'examples/found.json', 'api/v1/catalog.json', ...['zh-Hans', 'en', 'ja'].map((lang) => `api/v1/${lang}/catalog.tsv`)];
export const isPublicPath = (rel) => typeof rel === 'string' && !/[\\\0]/.test(rel) && rel === path.posix.normalize(rel) && !rel.split('/').some((part) => !part || DENIED.test(part)) && RULES.some((rule) => rule.test(rel));
export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function publicFiles(root) {
  const files = [];
  const walk = (rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink()) throw new Error(`公开资源不能是符号链接：${rel}`);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) if (!DENIED.test(name)) walk(`${rel}/${name}`);
    } else if (st.isFile() && isPublicPath(rel)) files.push(rel);
  };
  for (const name of [...ROOTS, ...fs.readdirSync(root).filter((p) => /\.md$/.test(p))]) walk(name);
  return [...new Set(files)].sort();
}

function checkLocalReference(root, allowed, from, reference) {
  const value = reference.trim().replace(/^<|>$/g, '');
  if (!value || value.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) || value.includes('<')) return;
  let rel;
  try { rel = decodeURIComponent(new URL(value, `https://offline.invalid/${from}`).pathname).replace(/^\//, ''); }
  catch { throw new Error(`本地资源引用无效：${from} → ${value}`); }
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (!allowed.has(rel) || !fs.existsSync(path.join(root, rel))) throw new Error(`本地资源未随包交付：${from} → ${value}`);
}

export function validateLinks(root, allowed) {
  for (const rel of allowed) {
    const ext = path.extname(rel);
    if (!['.html', '.md', '.css'].includes(ext)) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    let references;
    if (ext === '.md') {
      const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      references = [...prose.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    } else if (ext === '.html') {
      references = [...text.matchAll(/(?:href|src|data-href-[\w-]+)=["']([^"']+)["']/g)].map((match) => match[1]);
    } else {
      references = [...text.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)/g)].map((match) => match[1]);
    }
    for (const reference of references) checkLocalReference(root, allowed, rel, reference);
  }
}

export function validateGallery(root, files = publicFiles(root)) {
  const allowed = new Set(files);
  for (const rel of REQUIRED) if (!allowed.has(rel) || !fs.existsSync(path.join(root, rel))) throw new Error(`离线资源缺失：${rel}。请重新构建或完整复制技能目录。`);
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(path.join(root, 'api/v1/catalog.json'), 'utf8')); }
  catch { throw new Error('离线目录 catalog.json 无效，请重新构建或完整复制技能目录。'); }
  if (!catalog.version || !Array.isArray(catalog.elements) || !catalog.elements.length) throw new Error('离线目录缺少版本或条目。');
  let browserCatalog;
  try {
    const script = fs.readFileSync(path.join(root, 'assets/catalog.js'), 'utf8');
    browserCatalog = JSON.parse(/window\.MP_CATALOG = (.*);/.exec(script)[1]);
  } catch { throw new Error('本地示例库的 catalog.js 无效，请重新构建。'); }
  if (JSON.stringify(browserCatalog) !== JSON.stringify(catalog)) throw new Error('本地示例库与 API 数据不一致，请重新构建。');
  for (const pack of catalog.packs || []) {
    for (const resource of [...(pack.images || []), ...(pack.fonts || []).map((font) => font.url)]) {
      if (typeof resource !== 'string' || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(resource)) throw new Error(`离线素材包引用了非本地资源：${pack.pack}`);
      checkLocalReference(root, allowed, `packs/${pack.pack}/pack.js`, resource);
    }
  }
  validateLinks(root, allowed);
  for (const e of catalog.elements) {
    if (!Array.isArray(e.tagLabels?.['zh-Hans']) || e.tagLabels['zh-Hans'].length !== e.tags?.length || e.tagLabels['zh-Hans'].some((label) => typeof label !== 'string' || !label.trim())) throw new Error(`条目 #${e.id} 缺少完整中文标签，请重新构建。`);
    if (!/^\d{3}$/.test(e.id) || !/^[\w-]+$/.test(e.pack)) throw new Error('离线目录含有无效的条目编号或素材包名称。');
    for (const rel of [`packs/${e.pack}/pack.js`, `api/v1/kit/${e.pack}.js`, ...['zh-Hans', 'en', 'ja'].flatMap((lang) => [`api/v1/${lang}/e/${e.id}.txt`, `api/v1/${lang}/p/${e.id}.txt`])]) {
      if (!allowed.has(rel)) throw new Error(`离线资源缺失：${rel}。请重新构建或完整复制技能目录。`);
    }
  }
  return { catalog, publicFiles: allowed };
}

export function createManifest(root) {
  const list = publicFiles(root);
  const { catalog } = validateGallery(root, list);
  const files = Object.fromEntries(list.map((rel) => {
    const bytes = fs.readFileSync(path.join(root, rel));
    return [rel, { bytes: bytes.length, sha256: digest(bytes) }];
  }));
  return { format: 1, catalogVersion: catalog.version, files };
}

export function validateRuntime(root) {
  root = path.resolve(root);
  let manifest;
  try {
    const rootStat = fs.lstatSync(root);
    const manifestFile = path.join(root, 'manifest.json');
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !fs.lstatSync(manifestFile).isFile()) throw new Error('不是普通目录或文件');
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  }
  catch { throw new Error('离线技能 manifest.json 缺失或无效，请重新构建或完整复制技能目录。'); }
  if (manifest?.format !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('离线技能清单格式无效。');
  for (const [rel, entry] of Object.entries(manifest.files)) {
    if (!isPublicPath(rel) || !entry || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`离线技能清单项无效：${rel}`);
    const full = path.join(root, rel);
    try {
      let current = root;
      const parts = rel.split('/');
      for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new Error('不是普通目录或文件');
      }
      const bytes = fs.readFileSync(full);
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error('内容不一致');
    } catch { throw new Error(`离线资源缺失或校验失败：${rel}。请重新构建或完整复制技能目录。`); }
  }
  const result = validateGallery(root, Object.keys(manifest.files));
  if (result.catalog.version !== manifest.catalogVersion) throw new Error('离线清单与目录版本不一致。');
  return { ...result, manifest };
}
