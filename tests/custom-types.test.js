#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const ctx = {
  localStorage: {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  showToast() {},
  showConfirm(_m, cb) { cb && cb(); },
  openExportModal(_t, code) { this.lastExport = code; },
  zones: [],
  zonePointsAsPoly(z) { return z.points || []; },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/custom-types.js'), 'utf8'), ctx);

const sample = [
  { name: 'Склад А', points: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }], type: 'poly' },
];

const poly = ctx.exportZonesWithConfig(sample, { exportPreset: 'poly', label: 'Склады' });
assert.match(poly, /Склад А/);
assert.match(poly, /10\.0/);

const aabb = ctx.exportZonesWithConfig(sample, { exportPreset: 'aabb' });
assert.match(aabb, /10\.0, 20\.0, 30\.0, 40\.0/);

const custom = ctx.exportZonesWithConfig(sample, {
  exportPreset: 'custom',
  entryTemplate: '{{name}}={{x1}}',
  join: '\n',
  fileTemplate: 'BEGIN\n{{entries}}\nEND',
});
assert.strictEqual(custom, 'BEGIN\nСклад А=10.0\nEND');

console.log('custom-types.test.js: ok');
