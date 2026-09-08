// ============================================================
// MAP — calibration, transforms, tiled rendering + optional server upload
// ============================================================

const MAP_TILE_SIZE = 256;
const MAP_TILE_MAX_Z_DEFAULT = 5; // 6144 / 256 → ceil(log2(24)) = 5
const MAP_TILE_BASE_DEFAULT = 'assets/tiles';

function mapApiBase() {
  const pathName = location.pathname || '/';
  if (pathName.includes('/dev-tools')) {
    const base = pathName.slice(0, pathName.indexOf('/dev-tools') + '/dev-tools'.length);
    return `${base.replace(/\/$/, '')}/api`;
  }
  return '/api';
}


const mapImg = new Image(); // low-res overview (never the 29MB full PNG by default)
let mapTilesReady = false;
let mapTileMeta = {
  tileSize: MAP_TILE_SIZE,
  maxZoom: MAP_TILE_MAX_Z_DEFAULT,
  mapWidth: MAP_SIZE_PX,
  mapHeight: MAP_SIZE_PX,
  tilesUrl: MAP_TILE_BASE_DEFAULT,
  version: 0,
};
const _tileCache = new Map(); // "z/x/y" → Image | 'loading' | 'error'
let _tileDrawScheduled = false;
let _mapPanelOpen = false;

function tilesBaseUrl() {
  const base = mapTileMeta.tilesUrl || MAP_TILE_BASE_DEFAULT;
  const v = mapTileMeta.version ? `?v=${mapTileMeta.version}` : '';
  // version query only on overview/meta; tile files use path + optional cache buster below
  return base.replace(/\/$/, '');
}

function tileKey(z, x, y) {
  return `${mapTileMeta.version || 0}/${z}/${x}/${y}`;
}

function tileUrl(z, x, y) {
  const v = mapTileMeta.version ? `?v=${mapTileMeta.version}` : '';
  return `${tilesBaseUrl()}/${z}/${x}/${y}.png${v}`;
}

function overviewUrl() {
  const v = mapTileMeta.version ? `?v=${mapTileMeta.version}` : '';
  return `${tilesBaseUrl()}/overview.png${v}`;
}

function levelSizeAtZoom(z) {
  const maxZ = mapTileMeta.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT;
  const mapW = mapTileMeta.mapWidth || MAP_SIZE_PX;
  return Math.ceil(mapW / Math.pow(2, maxZ - z));
}

function requestTile(z, x, y) {
  const key = tileKey(z, x, y);
  const cached = _tileCache.get(key);
  if (cached instanceof Image) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  if (cached === 'loading' || cached === 'error') return null;

  _tileCache.set(key, 'loading');
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    _tileCache.set(key, img);
    scheduleTileRedraw();
  };
  img.onerror = () => {
    _tileCache.set(key, 'error');
  };
  img.src = tileUrl(z, x, y);
  return null;
}

function scheduleTileRedraw() {
  if (_tileDrawScheduled) return;
  _tileDrawScheduled = true;
  requestAnimationFrame(() => {
    _tileDrawScheduled = false;
    if (typeof draw === 'function') draw();
  });
}

function chooseTileZoom(mapScreenW) {
  const maxZ = mapTileMeta.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT;
  const mapW = mapTileMeta.mapWidth || MAP_SIZE_PX;
  const target = Math.max(1, mapScreenW);
  let z = Math.round(maxZ - Math.log2(mapW / target));
  if (!Number.isFinite(z)) z = 0;
  return Math.max(0, Math.min(maxZ, z));
}

function mapImageCornersScreen() {
  const tlGame = mapPxToGame(-MAP_HALF, MAP_HALF);
  const brGame = mapPxToGame(MAP_HALF, -MAP_HALF);
  const tl = worldToScreen(tlGame.x, tlGame.y);
  const br = worldToScreen(brGame.x, brGame.y);
  return { tl, br, w: br.x - tl.x, h: br.y - tl.y };
}

function imagePxToScreen(ix, iy, corners) {
  const { tl, w, h } = corners;
  return {
    x: tl.x + (ix / MAP_SIZE_PX) * w,
    y: tl.y + (iy / MAP_SIZE_PX) * h,
  };
}

// --- Calibration ---
function defaultCal() {
  return { scaleX: 0.51256, scaleY: 0.51249, offsetX: 4.05, offsetY: 0.94 };
}

function loadMapCal() {
  try {
    const raw = localStorage.getItem(STORAGE.MAP_CAL);
    if (raw) return JSON.parse(raw);
  } catch {}
  return defaultCal();
}

function saveMapCal() {
  localStorage.setItem(STORAGE.MAP_CAL, JSON.stringify(mapCal));
}

let mapCal = loadMapCal();

// --- Coordinate transforms ---

function gameToMapPx(gx, gy) {
  return {
    x: gx * mapCal.scaleX + mapCal.offsetX,
    y: gy * mapCal.scaleY + mapCal.offsetY,
  };
}

function mapPxToGame(mx, my) {
  return {
    x: (mx - mapCal.offsetX) / mapCal.scaleX,
    y: (my - mapCal.offsetY) / mapCal.scaleY,
  };
}

function worldToScreen(wx, wy) {
  return {
    x: (wx - viewX) * viewScale,
    y: (viewY - wy) * viewScale,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: sx / viewScale + viewX,
    y: viewY - sy / viewScale,
  };
}

function screenToMapPx(sx, sy) {
  const tlGame = mapPxToGame(-MAP_HALF,  MAP_HALF);
  const brGame = mapPxToGame( MAP_HALF, -MAP_HALF);
  const tlScr  = worldToScreen(tlGame.x, tlGame.y);
  const brScr  = worldToScreen(brGame.x, brGame.y);
  const fx = (sx - tlScr.x) / (brScr.x - tlScr.x);
  const fy = (sy - tlScr.y) / (brScr.y - tlScr.y);
  return {
    mpx:  fx * MAP_SIZE_PX - MAP_HALF,
    mpy: -fy * MAP_SIZE_PX + MAP_HALF,
  };
}

// --- Rendering ---

function drawMap() {
  const corners = mapImageCornersScreen();
  const { tl, w, h } = corners;

  if (mapImg.complete && mapImg.naturalWidth > 0) {
    ctx.drawImage(mapImg, tl.x, tl.y, w, h);
  } else {
    ctx.fillStyle = '#0c0c10';
    ctx.fillRect(tl.x, tl.y, w, h);
  }

  drawVisibleTiles(corners);

  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(tl.x, tl.y, w, h);
  drawOriginCross();
}

function drawVisibleTiles(corners) {
  const { w, h } = corners;
  if (!(w > 1 && h > 1)) return;

  const tileSize = mapTileMeta.tileSize || MAP_TILE_SIZE;
  const z = chooseTileZoom(Math.abs(w));
  const levelSize = levelSizeAtZoom(z);
  const scale = levelSize / MAP_SIZE_PX;
  const cols = Math.ceil(levelSize / tileSize);
  const rows = Math.ceil(levelSize / tileSize);

  const samples = [
    screenToMapPx(0, 0),
    screenToMapPx(canvas.width, 0),
    screenToMapPx(0, canvas.height),
    screenToMapPx(canvas.width, canvas.height),
  ];
  let minIx = Infinity, maxIx = -Infinity, minIy = Infinity, maxIy = -Infinity;
  for (const s of samples) {
    const ix = s.mpx + MAP_HALF;
    const iy = MAP_HALF - s.mpy;
    if (ix < minIx) minIx = ix;
    if (ix > maxIx) maxIx = ix;
    if (iy < minIy) minIy = iy;
    if (iy > maxIy) maxIy = iy;
  }

  const pad = tileSize / scale;
  minIx = Math.max(0, minIx - pad);
  maxIx = Math.min(MAP_SIZE_PX, maxIx + pad);
  minIy = Math.max(0, minIy - pad);
  maxIy = Math.min(MAP_SIZE_PX, maxIy + pad);

  let x0 = Math.floor((minIx * scale) / tileSize);
  let x1 = Math.floor(((maxIx * scale) - 1e-6) / tileSize);
  let y0 = Math.floor((minIy * scale) / tileSize);
  let y1 = Math.floor(((maxIy * scale) - 1e-6) / tileSize);
  x0 = Math.max(0, Math.min(cols - 1, x0));
  x1 = Math.max(0, Math.min(cols - 1, x1));
  y0 = Math.max(0, Math.min(rows - 1, y0));
  y1 = Math.max(0, Math.min(rows - 1, y1));

  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      const img = requestTile(z, tx, ty);
      if (!img) continue;

      const lx = tx * tileSize;
      const ly = ty * tileSize;
      const srcW = Math.min(tileSize, levelSize - lx);
      const srcH = Math.min(tileSize, levelSize - ly);
      if (srcW <= 0 || srcH <= 0) continue;

      const ix0 = lx / scale;
      const iy0 = ly / scale;
      const ix1 = (lx + srcW) / scale;
      const iy1 = (ly + srcH) / scale;
      const p0 = imagePxToScreen(ix0, iy0, corners);
      const p1 = imagePxToScreen(ix1, iy1, corners);
      ctx.drawImage(
        img,
        0, 0, srcW, srcH,
        p0.x, p0.y, p1.x - p0.x, p1.y - p0.y
      );
    }
  }
}

function drawOriginCross() {
  const o = worldToScreen(0, 0);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(canvas.width, o.y);  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim();
  ctx.fillText('0,0', o.x + 4, o.y - 4);
}

function drawGrid() {
  ctx.strokeStyle = '#1a1a22';
  ctx.lineWidth   = 1;
  const step = 100 * viewScale;
  const ox = (-viewX * viewScale) % step;
  const oy = ( viewY * viewScale) % step;
  const startX = ((ox % step) + step) % step;
  const startY = ((oy % step) + step) % step;

  for (let x = startX; x < canvas.width;  x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = startY; y < canvas.height; y += step)  { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);  ctx.stroke(); }

  const o = worldToScreen(0, 0);
  ctx.strokeStyle = '#22222c';
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(canvas.width, o.y);  ctx.stroke();
}

// --- Calibration UI ---

function addCalPoint(sx, sy, wx, wy) {
  const { mpx, mpy } = screenToMapPx(sx, sy);
  calPoints.push({ mpx, mpy, wx, wy, gameX: '', gameY: '' });
  calActiveIdx = calPoints.length - 1;
  renderCalPoints();
  draw();
}

function removeCalPoint(i) {
  calPoints.splice(i, 1);
  if (calActiveIdx >= calPoints.length) calActiveIdx = calPoints.length - 1;
  renderCalPoints();
  draw();
}

function renderCalPoints() {
  const el = document.getElementById('cal-points');
  el.innerHTML = '';

  calPoints.forEach((pt, i) => {
    const row = document.createElement('div');
    row.className = 'cal-row' + (i === calActiveIdx ? ' active' : '');
    row.innerHTML = `
      <div class="cal-row-header">
        <span>Точка ${i + 1}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono)">px:${pt.mpx.toFixed(0)},${pt.mpy.toFixed(0)}</span>
          <button class="btn-remove" onclick="removeCalPoint(${i})">✕</button>
        </div>
      </div>
      <div class="cal-coords-grid">
        <label>X игра:</label>
        <input class="field-input" type="number" step="0.01" value="${pt.gameX}" placeholder="-2371"
          onchange="calPoints[${i}].gameX = parseFloat(this.value) || ''; updateCalApply()">
        <label>Y игра:</label>
        <input class="field-input" type="number" step="0.01" value="${pt.gameY}" placeholder="2790"
          onchange="calPoints[${i}].gameY = parseFloat(this.value) || ''; updateCalApply()">
      </div>`;
    row.addEventListener('mousedown', e => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
        calActiveIdx = i;
        renderCalPoints();
        draw();
      }
    });
    el.appendChild(row);
  });

  updateCalApply();
}

function updateCalApply() {
  const valid = calPoints.filter(p => p.gameX !== '' && p.gameY !== '');
  const btn   = document.getElementById('cal-apply-btn');
  btn.disabled = valid.length < 2;
  btn.textContent = valid.length < 2
    ? `Применить (нужно ≥2, есть ${valid.length})`
    : `Применить по ${valid.length} точкам`;
}

function applyCalibration() {
  const pts = calPoints.filter(p => p.gameX !== '' && p.gameY !== '');
  if (pts.length < 2) return;

  function leastSquares(gameVals, mapVals) {
    const n = gameVals.length;
    let sg = 0, sm = 0, sgg = 0, sgm = 0;
    for (let i = 0; i < n; i++) {
      sg  += gameVals[i];
      sm  += mapVals[i];
      sgg += gameVals[i] * gameVals[i];
      sgm += gameVals[i] * mapVals[i];
    }
    const denom = n * sgg - sg * sg;
    if (Math.abs(denom) < 1e-9) return null;
    const scale  = (n * sgm - sg * sm) / denom;
    const offset = (sm - scale * sg) / n;
    return { scale, offset };
  }

  const rx = leastSquares(pts.map(p => p.gameX), pts.map(p => p.mpx));
  const ry = leastSquares(pts.map(p => p.gameY), pts.map(p => p.mpy));

  const resEl = document.getElementById('cal-result');
  if (!rx || !ry) {
    resEl.textContent = 'Ошибка: точки коллинеарны.';
    return;
  }

  mapCal = { scaleX: rx.scale, offsetX: rx.offset, scaleY: ry.scale, offsetY: ry.offset };
  saveMapCal();

  let maxErr = 0;
  pts.forEach(p => {
    maxErr = Math.max(maxErr,
      Math.abs(p.gameX * mapCal.scaleX + mapCal.offsetX - p.mpx),
      Math.abs(p.gameY * mapCal.scaleY + mapCal.offsetY - p.mpy)
    );
  });

  resEl.textContent =
    `scaleX=${rx.scale.toFixed(5)} offsetX=${rx.offset.toFixed(2)} ` +
    `scaleY=${ry.scale.toFixed(5)} offsetY=${ry.offset.toFixed(2)} | макс.погр: ${maxErr.toFixed(2)}`;

  document.getElementById('cal-params').textContent =
    `scaleX=${rx.scale.toFixed(6)}, offsetX=${rx.offset.toFixed(4)}, ` +
    `scaleY=${ry.scale.toFixed(6)}, offsetY=${ry.offset.toFixed(4)}`;

  draw();
}

function drawCalPoints() {
  calPoints.forEach((pt, i) => {
    const s      = worldToScreen(pt.wx, pt.wy);
    const active = i === calActiveIdx;
    const col    = active ? '#e8a020' : 'rgba(255,136,0,0.6)';

    ctx.strokeStyle = col;
    ctx.lineWidth   = active ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(s.x - 10, s.y); ctx.lineTo(s.x + 10, s.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x, s.y - 10); ctx.lineTo(s.x, s.y + 10); ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = col;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`К${i + 1}`, s.x + 9, s.y - 5);

    if (pt.gameX !== '' && pt.gameY !== '') {
      ctx.fillStyle = 'rgba(255,200,100,0.6)';
      ctx.font = '9px monospace';
      ctx.fillText(`(${pt.gameX}, ${pt.gameY})`, s.x + 9, s.y + 7);
    }
  });
}

// --- Map load / server API ---

function updateMapPanelStatus(extra) {
  const el = document.getElementById('map-panel-status');
  if (!el) return;
  const m = mapTileMeta;
  const bits = [
    `тайлы: ${m.tilesUrl || MAP_TILE_BASE_DEFAULT}`,
    `${m.mapWidth || MAP_SIZE_PX}×${m.mapHeight || MAP_SIZE_PX}`,
    `maxZ=${m.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT}`,
    m.version ? `v${m.version}` : null,
    extra || null,
  ].filter(Boolean);
  el.textContent = bits.join(' · ');
}

function applyOverviewSrc(src) {
  mapImg.onload = () => {
    mapTilesReady = true;
    updateMapPanelStatus('overview OK');
    draw();
  };
  mapImg.onerror = () => {
    // Fall back to full Map.png only if overview/tiles missing
    if (src !== DEFAULT_MAP_SRC) {
      updateMapPanelStatus('overview нет → Map.png');
      mapImg.onload = () => { mapTilesReady = true; draw(); };
      mapImg.onerror = () => {
        mapTilesReady = true;
        updateMapPanelStatus('карта не загрузилась');
        draw();
      };
      mapImg.src = DEFAULT_MAP_SRC;
      return;
    }
    mapTilesReady = true;
    updateMapPanelStatus('карта не загрузилась');
    draw();
  };
  mapImg.src = src;
}

function clearTileCache() {
  _tileCache.clear();
}

async function fetchMapMeta() {
  try {
    const res = await fetch(`${mapApiBase()}/map/meta`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadLocalTileManifest() {
  try {
    const res = await fetch(`${MAP_TILE_BASE_DEFAULT}/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function initMapImage() {
  updateMapPanelStatus('загрузка…');
  const api = await fetchMapMeta();
  if (api?.meta) {
    mapTileMeta = {
      tileSize: api.meta.tileSize || MAP_TILE_SIZE,
      maxZoom: api.meta.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT,
      mapWidth: api.meta.mapWidth || MAP_SIZE_PX,
      mapHeight: api.meta.mapHeight || MAP_SIZE_PX,
      tilesUrl: api.meta.tilesUrl || MAP_TILE_BASE_DEFAULT,
      version: api.meta.version || 0,
    };
    if (api.hasTiles) {
      clearTileCache();
      applyOverviewSrc(overviewUrl());
      return;
    }
  }

  const local = await loadLocalTileManifest();
  if (local) {
    mapTileMeta = {
      tileSize: local.tileSize || MAP_TILE_SIZE,
      maxZoom: local.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT,
      mapWidth: local.mapWidth || MAP_SIZE_PX,
      mapHeight: local.mapHeight || MAP_SIZE_PX,
      tilesUrl: MAP_TILE_BASE_DEFAULT,
      version: local.version || 0,
    };
    clearTileCache();
    applyOverviewSrc(overviewUrl());
    return;
  }

  // No tiles yet — still try overview path, then Map.png fallback
  applyOverviewSrc(overviewUrl());
}

function toggleMapPanel() {
  const panel = document.getElementById('map-panel');
  const btn = document.getElementById('btn-map-panel');
  if (!panel) return;
  _mapPanelOpen = !_mapPanelOpen;
  panel.classList.toggle('open', _mapPanelOpen);
  btn?.classList.toggle('active', _mapPanelOpen);
  if (_mapPanelOpen) {
    document.getElementById('cal-panel')?.classList.remove('open');
    if (mode === 'cal') setMode('pan');
    const tokenInput = document.getElementById('map-upload-token');
    if (tokenInput && !tokenInput.value) {
      try { tokenInput.value = localStorage.getItem('tl_map_upload_token') || ''; } catch {}
    }
    fetchMapMeta().then(() => updateMapPanelStatus());
    updateMapPanelStatus();
  }
}

function mapUploadHeaders() {
  const input = document.getElementById('map-upload-token');
  let token = input?.value?.trim() || '';
  if (token) {
    try { localStorage.setItem('tl_map_upload_token', token); } catch {}
  } else {
    try { token = localStorage.getItem('tl_map_upload_token') || ''; } catch {}
    if (token && input && !input.value) input.value = token;
  }
  const h = {};
  if (token) h['x-upload-token'] = token;
  return h;
}

async function onServerMapFileSelected(input) {
  const file = input?.files?.[0];
  if (!file) return;
  updateMapPanelStatus(`загрузка ${file.name}…`);
  showToast?.('Загрузка карты на сервер…');
  const fd = new FormData();
  fd.append('map', file);
  try {
    const res = await fetch(`${mapApiBase()}/map/upload`, {
      method: 'POST',
      headers: mapUploadHeaders(),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    mapTileMeta = {
      tileSize: data.meta.tileSize || MAP_TILE_SIZE,
      maxZoom: data.meta.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT,
      mapWidth: data.meta.mapWidth || MAP_SIZE_PX,
      mapHeight: data.meta.mapHeight || MAP_SIZE_PX,
      tilesUrl: data.meta.tilesUrl || MAP_TILE_BASE_DEFAULT,
      version: data.meta.version || Date.now(),
    };
    clearTileCache();
    applyOverviewSrc(overviewUrl());
    showToast?.('Тайлы готовы');
    updateMapPanelStatus('загружено');
  } catch (err) {
    console.error(err);
    showToast?.(err.message || 'Ошибка загрузки');
    updateMapPanelStatus(err.message || 'ошибка');
  } finally {
    input.value = '';
  }
}

async function rebuildServerTiles() {
  updateMapPanelStatus('пересборка тайлов…');
  showToast?.('Пересборка тайлов…');
  try {
    const res = await fetch(`${mapApiBase()}/map/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...mapUploadHeaders() },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    mapTileMeta = {
      tileSize: data.meta.tileSize || MAP_TILE_SIZE,
      maxZoom: data.meta.maxZoom ?? MAP_TILE_MAX_Z_DEFAULT,
      mapWidth: data.meta.mapWidth || MAP_SIZE_PX,
      mapHeight: data.meta.mapHeight || MAP_SIZE_PX,
      tilesUrl: data.meta.tilesUrl || MAP_TILE_BASE_DEFAULT,
      version: data.meta.version || Date.now(),
    };
    clearTileCache();
    applyOverviewSrc(overviewUrl());
    showToast?.('Тайлы пересобраны');
    updateMapPanelStatus('пересобрано');
  } catch (err) {
    console.error(err);
    showToast?.(err.message || 'Ошибка пересборки');
    updateMapPanelStatus(err.message || 'ошибка');
  }
}
