'use strict';

const path = require('path');
const fs = require('fs');
const { generateTilesFromPng } = require('../tilegen');

async function main() {
  const root = process.env.DEV_TOOLS_ROOT || path.resolve(__dirname, '../..');
  const png = path.join(root, 'assets', 'Map.png');
  const tiles = path.join(root, 'assets', 'tiles');
  const metaPath = path.join(root, 'assets', 'map-meta.json');

  if (!fs.existsSync(png)) {
    console.error('Missing', png);
    process.exit(1);
  }

  console.log('Generating tiles from', png);
  const info = await generateTilesFromPng(png, tiles, {
    onProgress: (p) => {
      const pct = ((p.done / p.total) * 100).toFixed(1);
      process.stdout.write(`\r  z${p.zoom}/${p.maxZoom} ${p.done}/${p.total} (${pct}%)   `);
    },
  });
  process.stdout.write('\n');

  let version = 1;
  try {
    version = (JSON.parse(fs.readFileSync(metaPath, 'utf8')).version || 0) + 1;
  } catch {}

  const meta = { ...info, version, originalName: 'Map.png', byteSize: fs.statSync(png).size, tilesUrl: 'assets/tiles' };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log('Done:', meta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
