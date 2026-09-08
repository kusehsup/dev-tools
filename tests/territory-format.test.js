#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/territory-format.js'), 'utf8'), ctx);
vm.runInContext('var TERRITORY_ZONES_DATA = { cities: [], streets: [] };', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/territory-zones-data.js'), 'utf8'), ctx);

const srcPath = fs.existsSync('/home/ubuntu/.cursor/projects/workspace/uploads/zones_c0cd.txt')
  ? '/home/ubuntu/.cursor/projects/workspace/uploads/zones_c0cd.txt'
  : path.join(root, 'tests/fixtures/zones.txt');

const src = fs.readFileSync(srcPath, 'utf8');
const parsed = ctx.parseTerritoryPwn(src);

assert.strictEqual(parsed.cities.length, 19, 'expected 19 cities');
assert.strictEqual(parsed.streets.length, 28, 'expected 28 streets');
assert.strictEqual(parsed.cities[0].name, 'Южный');
assert.strictEqual(parsed.cities[0].points.length, 11);
assert.strictEqual(parsed.cities[11].type, 'CITY_RUBLEVKA');
assert.strictEqual(parsed.cities[14].type, 'CITY_MIAMI');
assert.strictEqual(parsed.cities[18].name, 'Нижегородская обл.');
assert.strictEqual(parsed.cities[18].points.length, 0);
assert.strictEqual(parsed.streets[0].name, 'д. Гарель-Роговичи');
assert.strictEqual(parsed.streets[27].name, '[нет данных]');

const exported = ctx.formatTerritoryPwn(parsed.cities, parsed.streets);
assert.match(exported, /g_city\[19\]\[E_ZONES_STRUCT\]/);
assert.match(exported, /#define MAX_ZONES 28/);
assert.match(exported, /g_zone\[MAX_ZONES\]\[E_ZONES_STRUCT\]/);
assert.match(exported, /CITY_RUBLEVKA, "Рублёвка"/);
assert.match(exported, /CITY_MIAMI, "Майами"/);
assert.match(exported, /ZONE_OTHER, "д\. Гарель-Роговичи"/);

const round = ctx.parseTerritoryPwn(exported);
assert.strictEqual(round.cities.length, parsed.cities.length);
assert.strictEqual(round.streets.length, parsed.streets.length);

function coordsClose(a, b, label) {
  assert.strictEqual(a.length, b.length, `${label} count`);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i].name, b[i].name, `${label} name ${i}`);
    assert.strictEqual(a[i].type, b[i].type, `${label} type ${i}`);
    assert.strictEqual(a[i].points.length, b[i].points.length, `${label} pts ${a[i].name}`);
    for (let j = 0; j < a[i].points.length; j++) {
      assert.ok(Math.abs(a[i].points[j].x - b[i].points[j].x) < 0.0002, `${label} x ${a[i].name}#${j}`);
      assert.ok(Math.abs(a[i].points[j].y - b[i].points[j].y) < 0.0002, `${label} y ${a[i].name}#${j}`);
    }
  }
}
coordsClose(parsed.cities, round.cities, 'city');
coordsClose(parsed.streets, round.streets, 'street');

const emptyExport = ctx.formatTerritoryPwn([], []);
const emptyParsed = ctx.parseTerritoryPwn(emptyExport);
assert.strictEqual(emptyParsed.cities.length, 1);
assert.strictEqual(emptyParsed.streets.length, 1);
assert.strictEqual(emptyParsed.cities[0].name, 'Нижегородская обл.');
assert.strictEqual(emptyParsed.streets[0].name, '[нет данных]');

const added = ctx.parseTerritoryPwn(ctx.formatTerritoryPwn(
  [...parsed.cities, { type: 'CITY_OTHER', name: 'Тестовск', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], extra: 0 }],
  parsed.streets
));
assert.strictEqual(added.cities.length, 20);
assert.strictEqual(added.cities[19].name, 'Тестовск');
assert.strictEqual(added.cities[19].points.length, 3);

const poly = ctx.zonePointsAsPoly({ type: 'rect', points: [{ x: 0, y: 10 }, { x: 20, y: 40 }] });
assert.strictEqual(JSON.stringify(poly), JSON.stringify([
  { x: 0, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 40 },
  { x: 0, y: 40 },
]));

assert.strictEqual(ctx.TERRITORY_ZONES_DATA.cities.length, parsed.cities.length);
assert.strictEqual(ctx.TERRITORY_ZONES_DATA.streets.length, parsed.streets.length);
assert.strictEqual(ctx.TERRITORY_ZONES_DATA.cities[0].name, 'Южный');
assert.strictEqual(ctx.TERRITORY_ZONES_DATA.cities[0].coords.length, 22);
assert.strictEqual(ctx.TERRITORY_ZONES_DATA.streets[27].name, '[нет данных]');

console.log('territory-format.test.js: ok');
