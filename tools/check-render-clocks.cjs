#!/usr/bin/env node
/*
  Dev/CI guard: block Date.now() / performance.now() usage in render paths.
  Scans:
    - src/gameLoop/drawLayers/**/*
    - src/gameLoop/draw.ts
  Exits non-zero if banned tokens are found.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGETS = [
  path.join(ROOT, 'src', 'gameLoop', 'drawLayers'),
  path.join(ROOT, 'src', 'gameLoop', 'draw.ts'),
];

const banned = /(Date\.now|performance\.now)/;
let badHits = [];

function scanFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (banned.test(ln)) {
        badHits.push({ file, line: i + 1, text: ln.trim() });
      }
    });
  } catch (e) {
    // ignore
  }
}

function scanDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    // might be a file, not a dir
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      scanFile(dir);
    }
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) scanDir(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) scanFile(full);
  }
}

for (const t of TARGETS) scanDir(t);

if (badHits.length > 0) {
  console.error('Found banned render-path clocks in the following locations:');
  for (const h of badHits) {
    console.error(` - ${path.relative(ROOT, h.file)}:${h.line}: ${h.text}`);
  }
  process.exit(1);
} else {
  console.log('OK: No Date.now()/performance.now() in draw layers or draw.ts');
}
