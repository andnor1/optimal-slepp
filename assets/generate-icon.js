#!/usr/bin/env node
/**
 * Clock Out – icon & splash generator
 *
 * Delegates to generate_icon.py (requires Python 3 + Pillow + numpy).
 * Run from the project root:
 *   node assets/generate-icon.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(
  'python3',
  [path.join(__dirname, 'generate_icon.py')],
  { stdio: 'inherit', cwd: path.join(__dirname, '..') },
);

if (result.status !== 0) {
  console.error('Icon generation failed');
  process.exit(result.status ?? 1);
}
