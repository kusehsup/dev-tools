'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TILE_SIZE = 256;
const OVERVIEW_SIZE = 1024;

function maxZoomForSize(mapSize, tileSize = TILE_SIZE) {
  return Math.max(0, Math.ceil(Math.log2(Math.max(mapSize, 1) / tileSize)));
}

function levelSizeAtZoom(mapSize, z, maxZoom) {
  const scale = 2 ** (maxZoom - z);
  return Math.ceil(mapSize / scale);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function rimraf(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

/**
 * Slice a map PNG into a tile pyramid: tiles/{z}/{x}/{y}.png
 * Keeps native map aspect (no stretch-to-power-of-two). Edge tiles are
 * padded to TILE_SIZE with black so every file is 256×256.
 * Also writes overview.png + manifest.json inside tilesRoot.
 */
async function generateTilesFromPng(pngPath, tilesRoot, {
  tileSize = TILE_SIZE,
  overviewSize = OVERVIEW_SIZE,
  onProgress = null,
} = {}) {
  const meta = await sharp(pngPath, { limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new Error('Не удалось прочитать размеры PNG');

  const mapWidth = meta.width;
  const mapHeight = meta.height;
  const mapSize = Math.max(mapWidth, mapHeight);
  const maxZoom = maxZoomForSize(mapSize, tileSize);

  await rimraf(tilesRoot);
  await ensureDir(tilesRoot);

  // Overview for instant first paint
  await sharp(pngPath, { limitInputPixels: false })
    .resize(overviewSize, overviewSize, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 8 })
    .toFile(path.join(tilesRoot, 'overview.png'));

  let total = 0;
  const levelPlan = [];
  for (let z = 0; z <= maxZoom; z++) {
    const levelW = levelSizeAtZoom(mapWidth, z, maxZoom);
    const levelH = levelSizeAtZoom(mapHeight, z, maxZoom);
    const cols = Math.ceil(levelW / tileSize);
    const rows = Math.ceil(levelH / tileSize);
    levelPlan.push({ z, levelW, levelH, cols, rows });
    total += cols * rows;
  }

  let done = 0;
  for (const { z, levelW, levelH, cols, rows } of levelPlan) {
    const levelBuf = await sharp(pngPath, { limitInputPixels: false })
      .resize(levelW, levelH, { fit: 'fill', kernel: 'lanczos3' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = levelBuf;
    const channels = info.channels;

    for (let x = 0; x < cols; x++) {
      const xDir = path.join(tilesRoot, String(z), String(x));
      await ensureDir(xDir);
      const left = x * tileSize;
      const srcW = Math.min(tileSize, levelW - left);

      for (let y = 0; y < rows; y++) {
        const top = y * tileSize;
        const srcH = Math.min(tileSize, levelH - top);

        // Extract region into a TILE_SIZE canvas (pad with black)
        const tile = Buffer.alloc(tileSize * tileSize * 4, 0);
        for (let row = 0; row < srcH; row++) {
          const srcOff = ((top + row) * levelW + left) * channels;
          const dstOff = row * tileSize * 4;
          for (let col = 0; col < srcW; col++) {
            const si = srcOff + col * channels;
            const di = dstOff + col * 4;
            tile[di] = data[si];
            tile[di + 1] = data[si + 1];
            tile[di + 2] = data[si + 2];
            tile[di + 3] = channels === 4 ? data[si + 3] : 255;
          }
        }

        await sharp(tile, { raw: { width: tileSize, height: tileSize, channels: 4 } })
          .png({ compressionLevel: 6 })
          .toFile(path.join(xDir, `${y}.png`));

        done += 1;
        if (onProgress && (done % 16 === 0 || done === total)) {
          onProgress({ done, total, zoom: z, maxZoom });
        }
      }
    }
  }

  const manifest = {
    tileSize,
    mapWidth,
    mapHeight,
    mapSize,
    maxZoom,
    overview: 'overview.png',
    overviewSize,
    pathTemplate: '{z}/{x}/{y}.png',
    tileCount: total,
    generatedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(
    path.join(tilesRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  return manifest;
}

module.exports = {
  TILE_SIZE,
  OVERVIEW_SIZE,
  maxZoomForSize,
  levelSizeAtZoom,
  generateTilesFromPng,
};
