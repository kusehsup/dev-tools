#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { maxZoomForSize, levelSizeAtZoom } = require('../server/tilegen');

assert.strictEqual(maxZoomForSize(6144, 256), 5);
assert.strictEqual(levelSizeAtZoom(6144, 5, 5), 6144);
assert.strictEqual(levelSizeAtZoom(6144, 4, 5), 3072);
assert.strictEqual(levelSizeAtZoom(6144, 0, 5), 192);

const fs = require('fs');
const tiles = path.join(__dirname, '..', 'assets', 'tiles');
if (fs.existsSync(path.join(tiles, 'manifest.json'))) {
  const m = JSON.parse(fs.readFileSync(path.join(tiles, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.maxZoom, 5);
  assert.strictEqual(m.tileCount, 770);
  assert.ok(fs.existsSync(path.join(tiles, 'overview.png')));
  assert.ok(fs.existsSync(path.join(tiles, '5', '0', '0.png')));
  assert.ok(fs.existsSync(path.join(tiles, '5', '23', '23.png')));
  console.log('map-tiles.test.js: ok (manifest + sample tiles present)');
} else {
  console.log('map-tiles.test.js: ok (geometry only; tiles not generated)');
}
