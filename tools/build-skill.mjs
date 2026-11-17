#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManifest, validateRuntime } from '../skills/motion-prompt/scripts/runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'skills/motion-prompt/runtime');

export function compareRuntime(directory, expected) {
  const seen = [];
  const walk = (dir, prefix = '') => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + item.name;
      if (item.isSymbolicLink()) throw new Error(`离线运行时不允许符号链接：${rel}`);
      if (item.isDirectory()) walk(path.join(dir, item.name), `${rel}/`);
      else seen.push(rel);
    }
  };
  walk(directory);
  const wanted = [...Object.keys(expected.files), 'manifest.json'].sort();
  if (JSON.stringify(seen.sort()) !== JSON.stringify(wanted)) throw new Error('离线运行时文件集合发生漂移，请运行 node tools/build-skill.mjs。');
  const actual = validateRuntime(directory).manifest;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('离线运行时内容已过期，请运行 node tools/build-skill.mjs。');
}

export function buildSkill({ check = false } = {}) {
  const verified = spawnSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--verify'], { cwd: root, encoding: 'utf8' });
  if (verified.error || verified.status !== 0) throw new Error(`源数据与生成结果核对失败，请先运行 node tools/build.mjs。\n${verified.error?.message || verified.stderr || verified.stdout}`);
  const manifest = createManifest(root);
  if (check) {
    compareRuntime(destination, manifest);
  } else {
    const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.runtime-build-'));
    const backup = `${temporary}-previous`;
    try {
      for (const rel of Object.keys(manifest.files)) {
        const output = path.join(temporary, rel);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.copyFileSync(path.join(root, rel), output);
      }
      fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      compareRuntime(temporary, manifest);
      if (fs.existsSync(destination)) fs.renameSync(destination, backup);
      try { fs.renameSync(temporary, destination); }
      catch (error) { if (fs.existsSync(backup)) fs.renameSync(backup, destination); throw error; }
      fs.rmSync(backup, { recursive: true, force: true });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  const bytes = Object.values(manifest.files).reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`离线技能${check ? '校验通过' : '已生成'}：${Object.keys(manifest.files).length} 个公开文件，${bytes} 字节，目录版本 ${manifest.catalogVersion}。`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('用法：node tools/build-skill.mjs [--check]');
    buildSkill({ check: process.argv.includes('--check') });
  } catch (error) { console.error(`离线技能构建失败：${error.message}`); process.exitCode = 1; }
}
