#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bin = path.join(root, 'dist/cli/bin.js');

if (!fs.existsSync(bin)) {
  console.error('Missing dist/cli/bin.js — CLI build failed');
  process.exit(1);
}

const resourcesDir = path.join(root, 'skills/add-agenttrace/resources');
if (!fs.existsSync(resourcesDir)) {
  console.error(`Missing ${path.relative(root, resourcesDir)} — sync-resources failed`);
  process.exit(1);
}
const bootResource = path.join(resourcesDir, 'agenttrace-boot.ts');
if (!fs.existsSync(bootResource)) {
  console.error(`Missing ${path.relative(root, bootResource)} — sync-resources failed`);
  process.exit(1);
}
const runnerObserve = path.join(resourcesDir, 'runner/observe.ts');
if (!fs.existsSync(runnerObserve)) {
  console.error(`Missing ${path.relative(root, runnerObserve)} — sync-resources failed`);
  process.exit(1);
}

console.log('Publish entry OK');
