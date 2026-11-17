import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const zh = 'zh-Hans';
let elements = 0, specs = 0;
const dictionary = JSON.parse(fs.readFileSync('data/tags.zh-Hans.json', 'utf8'));
const sourceTags = new Set();
const expectedLabels = new Map();
for (const pack of fs.readdirSync('packs')) {
  const file = `packs/${pack}/meta.json`;
  if (!fs.existsSync(file)) continue;
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(meta.title[zh], `${pack}: 素材包标题`);
  const localized = [
    ['title', meta.title[zh]],
    ...meta.categories.map(c => [`category/${c.slug}`, c[zh]]),
    ...meta.elements.flatMap(e => ['name', 'meaning', 'ask', 'summary', 'use', 'spec'].flatMap(key =>
      (Array.isArray(e[key]?.[zh]) ? e[key][zh] : [e[key]?.[zh]]).map((value, i) => [`${e.slug}/${key}/${i}`, value]))),
  ];
  for (const [field, value] of localized) {
    assert.equal(typeof value, 'string', `${pack}/${field}: 缺少中文文案`);
    assert.doesNotMatch(value, /[\u3040-\u30ff]|顧客|営業|目次/, `${pack}/${field}: 中文文案残留日文`);
  }
  for (const c of meta.categories) assert.ok(c[zh], `${pack}/${c.slug}: 类别`);
  for (const e of meta.elements) {
    expectedLabels.set(`${pack}/${e.slug}`, e.tags.map(tag => e.tagOverrides?.[zh]?.[tag] || dictionary[tag]));
    for (const tag of e.tags) {
      sourceTags.add(tag);
      assert.ok(typeof dictionary[tag] === 'string' && dictionary[tag].trim(), `${pack}/${e.slug}: 标签 ${tag} 缺少翻译`);
    }
    for (const key of ['name', 'meaning', 'ask', 'summary', 'use']) {
      assert.ok(e[key]?.[zh]?.trim(), `${pack}/${e.slug}/${key}: 缺少中文`);
    }
    assert.equal(e.spec[zh]?.length, e.spec.en.length, `${pack}/${e.slug}: 规格行数`);
    for (const s of e.spec[zh]) assert.match(s, /[\u3400-\u9fff]/, `${pack}/${e.slug}: 未翻译的规格`);
    specs += e.spec[zh].length;
    elements++;
  }
}
for (const [script, page] of [['site', 'index'], ['found', 'found']]) {
  const source = fs.readFileSync(`assets/${script}.js`, 'utf8');
  const match = /var I18N = (\{[\s\S]*?\n  \});/.exec(source);
  const strings = vm.runInNewContext(`(${match[1]})`);
  assert.deepEqual(Object.keys(strings[zh]).sort(), Object.keys(strings.en).sort(), `${script}: 文案键不完整`);
  const html = fs.readFileSync(`${page}.html`, 'utf8');
  assert.match(html, /<html lang="zh-Hans">/);
  for (const m of html.matchAll(/data-t(?:-html)?="([^"]+)"/g)) assert.ok(strings[zh][m[1]], `${page}: ${m[1]}`);
  assert.ok(!/[ぁ-んァ-ヶ]/.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '')), `${page}: 初始页面残留日文`);
}
assert.deepEqual(Object.keys(dictionary).sort(), [...sourceTags].sort(), '标签词典必须覆盖且仅覆盖现有标签');
const cat = JSON.parse(fs.readFileSync('api/v1/catalog.json', 'utf8'));
assert.equal(cat.elements.length, elements);
for (const e of cat.elements) {
  assert.deepEqual(e.tagLabels?.[zh], expectedLabels.get(`${e.pack}/${e.slug}`), `${e.id}: 中文标签与源词典不一致`);
  const prompt = fs.readFileSync(`api/v1/${zh}/p/${e.id}.txt`, 'utf8');
  const code = fs.readFileSync(`api/v1/${zh}/e/${e.id}.txt`, 'utf8');
  assert.ok(prompt.includes(e.name[zh]) && prompt.includes('动效规格：'));
  assert.doesNotMatch(code, /[\u3040-\u30ff]|顧客|営業|目次/, `${e.id}: 中文规格或参考代码残留日文`);
  assert.ok(code.includes(e.summary[zh]) && code.includes('适用场景'));
  assert.ok(code.includes('标签：' + e.tagLabels[zh].join('、')), `${e.id}: 中文规格的标签未翻译`);
  assert.ok(prompt.includes('../e/' + e.id + '.txt'), `${e.id}: 静态提示词引用必须指向同一语言`);
  assert.ok(!prompt.includes('/en/e/'), `${e.id}: 中文提示词不能回跳英文实现`);
}
for (const pack of cat.packs) {
  assert.doesNotMatch(fs.readFileSync(`api/v1/kit/${pack.pack}.js`, 'utf8'), /[\u3040-\u30ff]/, `${pack.pack}: 共用代码残留日文注释`);
}
console.log(`通过：${elements} 条中文数据、${specs} 行规格、${sourceTags.size} 个标签译名、两页文案键与初始 HTML、全部中文 API 提示词与规格。`);
