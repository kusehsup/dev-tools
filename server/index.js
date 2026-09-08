'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { generateTilesFromPng, TILE_SIZE } = require('./tilegen');

const PORT = Number(process.env.PORT || 3847);
const ROOT = process.env.DEV_TOOLS_ROOT || path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const TILES_DIR = path.join(ASSETS, 'tiles');
const META_PATH = path.join(ASSETS, 'map-meta.json');
const MAP_PNG_PATH = path.join(ASSETS, 'Map.png');
const UPLOAD_TOKEN = process.env.MAP_UPLOAD_TOKEN || '';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = file.mimetype === 'image/png'
      || (file.originalname || '').toLowerCase().endsWith('.png');
    cb(ok ? null : new Error('Нужен файл PNG'), ok);
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

let busy = false;
let lastProgress = null;

function readMeta() {
  try {
    if (fs.existsSync(META_PATH)) {
      return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    }
  } catch {}
  try {
    const manifest = path.join(TILES_DIR, 'manifest.json');
    if (fs.existsSync(manifest)) {
      return JSON.parse(fs.readFileSync(manifest, 'utf8'));
    }
  } catch {}
  return null;
}

function writeMeta(meta) {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  try {
    fs.mkdirSync(TILES_DIR, { recursive: true });
    fs.writeFileSync(path.join(TILES_DIR, 'manifest.json'), JSON.stringify(meta, null, 2) + '\n');
  } catch {}
}

function requireUploadAuth(req, res, next) {
  // Uploads replace the global map — require MAP_UPLOAD_TOKEN (never open by default).
  if (!UPLOAD_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Загрузка отключена: задайте MAP_UPLOAD_TOKEN на сервере' });
  }
  const header = req.get('x-upload-token') || '';
  const query = req.query.token || '';
  const bodyToken = req.body?.token || '';
  if ([header, query, bodyToken].includes(UPLOAD_TOKEN)) return next();
  return res.status(401).json({ ok: false, error: 'Неверный токен загрузки' });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, busy, root: ROOT });
});

app.get('/api/map/meta', (req, res) => {
  const meta = readMeta();
  const hasTiles = fs.existsSync(TILES_DIR);
  res.json({
    ok: true,
    busy,
    progress: lastProgress,
    hasTiles,
    meta: meta || {
      tileSize: TILE_SIZE,
      maxZoom: 0,
      mapWidth: 6144,
      mapHeight: 6144,
      version: 0,
    },
  });
});

app.get('/api/map/progress', (req, res) => {
  res.json({ ok: true, busy, progress: lastProgress });
});

app.post('/api/map/upload', requireUploadAuth, upload.single('map'), async (req, res) => {
  if (busy) {
    return res.status(409).json({ ok: false, error: 'Уже идёт обработка карты' });
  }
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, error: 'Файл не получен' });
  }

  busy = true;
  lastProgress = { done: 0, total: 1, zoom: 0, maxZoom: 0, stage: 'save' };

  const tmpPath = path.join(ASSETS, `.upload-${Date.now()}.png`);
  try {
    fs.mkdirSync(ASSETS, { recursive: true });
    fs.writeFileSync(tmpPath, req.file.buffer);

    lastProgress = { ...lastProgress, stage: 'tiles' };
    const info = await generateTilesFromPng(tmpPath, TILES_DIR, {
      onProgress: (p) => { lastProgress = { ...p, stage: 'tiles' }; },
    });

    // Replace global Map.png after successful tile gen
    fs.renameSync(tmpPath, MAP_PNG_PATH);

    const prev = readMeta() || {};
    const meta = {
      ...info,
      version: (prev.version || 0) + 1,
      originalName: req.file.originalname || 'Map.png',
      byteSize: req.file.buffer.length,
      tilesUrl: 'assets/tiles',
    };
    writeMeta(meta);
    lastProgress = { done: info.tileCount, total: info.tileCount, zoom: info.maxZoom, maxZoom: info.maxZoom, stage: 'done' };

    res.json({ ok: true, meta });
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    console.error('[map/upload]', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  } finally {
    busy = false;
  }
});

app.post('/api/map/rebuild', requireUploadAuth, async (req, res) => {
  if (busy) {
    return res.status(409).json({ ok: false, error: 'Уже идёт обработка карты' });
  }
  if (!fs.existsSync(MAP_PNG_PATH)) {
    return res.status(404).json({ ok: false, error: 'assets/Map.png не найден' });
  }

  busy = true;
  lastProgress = { done: 0, total: 1, stage: 'tiles' };
  try {
    const info = await generateTilesFromPng(MAP_PNG_PATH, TILES_DIR, {
      onProgress: (p) => { lastProgress = { ...p, stage: 'tiles' }; },
    });
    const prev = readMeta() || {};
    const meta = {
      ...info,
      version: (prev.version || 0) + 1,
      originalName: prev.originalName || 'Map.png',
      byteSize: fs.statSync(MAP_PNG_PATH).size,
      tilesUrl: 'assets/tiles',
    };
    writeMeta(meta);
    lastProgress = { done: info.tileCount, total: info.tileCount, stage: 'done' };
    res.json({ ok: true, meta });
  } catch (err) {
    console.error('[map/rebuild]', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  } finally {
    busy = false;
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ ok: false, error: err.message || String(err) });
  }
  next();
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-tools-api] listening on 127.0.0.1:${PORT}`);
  console.log(`[dev-tools-api] root=${ROOT}`);
  console.log(`[dev-tools-api] upload token ${UPLOAD_TOKEN ? 'enabled' : 'disabled'}`);
});
