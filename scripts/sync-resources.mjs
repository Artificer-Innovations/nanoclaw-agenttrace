#!/usr/bin/env node
/**
 * Sync packages/host/src + packages/runner/src → skills/add-agenttrace/resources
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const hostSrc = path.join(root, 'packages/host/src');
const runnerSrc = path.join(root, 'packages/runner/src');
const destHost = path.join(root, 'skills/add-agenttrace/resources');
const destRunner = path.join(root, 'skills/add-agenttrace/resources/runner');

function syncTs(srcDir, destDir, { skipTests = false } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(destDir)) {
    if (name === 'runner') continue;
    fs.rmSync(path.join(destDir, name), { recursive: true, force: true });
  }
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.ts')) continue;
    if (skipTests && name.endsWith('.test.ts')) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}

syncTs(hostSrc, destHost, { skipTests: false });
fs.mkdirSync(destRunner, { recursive: true });
for (const name of fs.readdirSync(destRunner)) {
  fs.rmSync(path.join(destRunner, name), { recursive: true, force: true });
}
for (const name of fs.readdirSync(runnerSrc)) {
  if (!name.endsWith('.ts')) continue;
  fs.copyFileSync(path.join(runnerSrc, name), path.join(destRunner, name));
}

console.log(`Synced host → ${path.relative(root, destHost)}`);
console.log(`Synced runner → ${path.relative(root, destRunner)}`);
