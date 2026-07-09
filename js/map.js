// ============================================================
// MAP — calibration persistence, coordinate transforms, rendering
// ============================================================

// --- Map image ---
// onload is assigned in canvas.js after draw() is defined
const mapImg = new Image();
let customMapObjectUrl = null;
let mapImageSource = 'default'; // 'default' | 'custom'

function revokeCustomMapUrl() {
  if (customMapObjectUrl) {
    URL.revokeObjectURL(customMapObjectUrl);
    customMapObjectUrl = null;
  }
}

function openMapImageDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MAP_IMAGE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(MAP_IMAGE_STORE)) {
        req.result.createObjectStore(MAP_IMAGE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCustomMapBlob(blob) {
  const db = await openMapImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MAP_IMAGE_STORE, 'readwrite');
    tx.objectStore(MAP_IMAGE_STORE).put(blob, MAP_IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadCustomMapBlob() {
  const db = await openMapImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MAP_IMAGE_STORE, 'readonly');
    const req = tx.objectStore(MAP_IMAGE_STORE).get(MAP_IMAGE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function clearCustomMapBlob() {
  const db = await openMapImageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MAP_IMAGE_STORE, 'readwrite');
    tx.objectStore(MAP_IMAGE_STORE).delete(MAP_IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatMapFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateMapPanelStatus(extra) {
  const el = document.getElementById('map-panel-status');
  if (!el) return;
  const srcLabel = mapImageSource === 'custom' ? 'своя (из браузера)' : 'assets/Map.png';
  const dim = mapImg.naturalWidth && mapImg.naturalHeight
    ? `${mapImg.naturalWidth}×${mapImg.naturalHeight}px`
    : '—';
  el.textContent = `Источник: ${srcLabel} · ${dim}${extra ? ` · ${extra}` : ''}`;
}

function applyMapImageSrc(src, source) {
  mapImageSource = source;
  mapImg.onload = () => {
    updateMapPanelStatus();
    draw();
  };
  mapImg.onerror = () => {
    showToast?.('Не удалось загрузить карту');
    updateMapPanelStatus('ошибка загрузки');
  };
  mapImg.src = src;
}

function setMapImageFromBlob(blob) {
  revokeCustomMapUrl();
  customMapObjectUrl = URL.createObjectURL(blob);
  applyMapImageSrc(customMapObjectUrl, 'custom');
}

function loadDefaultMapImage() {
  revokeCustomMapUrl();
  applyMapImageSrc(`${DEFAULT_MAP_SRC}?t=${Date.now()}`, 'default');
}

async function initMapImage() {
  try {
    const blob = await loadCustomMapBlob();
    if (blob) {
      setMapImageFromBlob(blob);
      return;
    }
  } catch {}
  loadDefaultMapImage();
}

function toggleMapPanel() {
  const panel = document.getElementById('map-panel');
  const btn = document.getElementById('btn-map-panel');
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  btn?.classList.toggle('active', open);
  if (open) {
    document.getElementById('cal-panel')?.classList.remove('open');
    document.getElementById('mode-cal')?.classList.remove('active');
    if (mode === 'cal') setMode('pan');
    updateMapPanelStatus();
  }
}

function onMapFileSelected(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
    showToast('Нужен файл PNG');
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const blob = new Blob([reader.result], { type: 'image/png' });
      await saveCustomMapBlob(blob);
      setMapImageFromBlob(blob);
      showToast(`Карта обновлена (${formatMapFileSize(blob.size)})`);
      updateMapPanelStatus(formatMapFileSize(blob.size));
    } catch {
      showToast('Не удалось сохранить карту');
    }
  };
  reader.onerror = () => showToast('Ошибка чтения файла');
  reader.readAsArrayBuffer(file);
}

async function resetMapPng() {
  showConfirm('Сбросить карту к assets/Map.png?', async () => {
    try {
      await clearCustomMapBlob();
      loadDefaultMapImage();
      showToast('Карта сброшена');
    } catch {
      showToast('Не удалось сбросить карту');
    }
  });
}

async function downloadMapPng() {
  try {
    const resp = await fetch(mapImg.src);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Map.png';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Map.png скачан');
  } catch {
    showToast('Не удалось скачать карту');
  }
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

// game coord → map pixel from centre (Y up in both systems)
function gameToMapPx(gx, gy) {
  return {
    x: gx * mapCal.scaleX + mapCal.offsetX,
    y: gy * mapCal.scaleY + mapCal.offsetY,
  };
}

// map pixel from centre → game coord
function mapPxToGame(mx, my) {
  return {
    x: (mx - mapCal.offsetX) / mapCal.scaleX,
    y: (my - mapCal.offsetY) / mapCal.scaleY,
  };
}

// world → canvas screen
function worldToScreen(wx, wy) {
  return {
    x: (wx - viewX) * viewScale,
    y: (viewY - wy) * viewScale,
  };
}

// canvas screen → world
function screenToWorld(sx, sy) {
  return {
    x: sx / viewScale + viewX,
    y: viewY - sy / viewScale,
  };
}

// canvas screen → map pixel from centre
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
  const tlGame = mapPxToGame(-MAP_HALF,  MAP_HALF);
  const brGame = mapPxToGame( MAP_HALF, -MAP_HALF);
  const tl = worldToScreen(tlGame.x, tlGame.y);
  const br = worldToScreen(brGame.x, brGame.y);
  const w  = br.x - tl.x;
  const h  = br.y - tl.y;

  ctx.drawImage(mapImg, tl.x, tl.y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(tl.x, tl.y, w, h);
  drawOriginCross();
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
