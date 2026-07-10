// ============================================================
// TRAIN ROUTES — machinist checkpoints & train_checks stations
// ============================================================

const TRAIN_ROUTE_KIND_LABELS = {
  MAIN:  'Главная',
  METRO: 'Метро',
};

const TRAIN_ROUTE_COLORS = {
  0: '#e91e63',
  1: '#9c27b0',
  2: '#00bcd4',
};

const STORAGE_TRAIN_ROUTES      = 'train_routes_data';
const STORAGE_TRAIN_STATIONS    = 'train_stations_data';
const STORAGE_TRAIN_CHECKPOINTS = 'train_checkpoints_data';

let trainRoutes      = [];
let trainStations    = [];
let trainCheckpoints = [];
let selectedTrainRouteIdx = null;
let selectedTrainCheckpointId = null;
let selectedTrainStationId = null;
let showTrainRoutes  = true;
let showTrainStops   = true;

function saveTrainData() {
  localStorage.setItem(STORAGE_TRAIN_ROUTES,      JSON.stringify(trainRoutes));
  localStorage.setItem(STORAGE_TRAIN_STATIONS,    JSON.stringify(trainStations));
  localStorage.setItem(STORAGE_TRAIN_CHECKPOINTS, JSON.stringify(trainCheckpoints));
}

function loadTrainData() {
  try {
    const r = localStorage.getItem(STORAGE_TRAIN_ROUTES);
    const s = localStorage.getItem(STORAGE_TRAIN_STATIONS);
    const c = localStorage.getItem(STORAGE_TRAIN_CHECKPOINTS);
    if (r && s && c) {
      trainRoutes      = JSON.parse(r);
      trainStations    = JSON.parse(s);
      trainCheckpoints = JSON.parse(c);
      return true;
    }
  } catch {}
  return false;
}

async function initTrainData() {
  if (loadTrainData()) return;
  try {
    const resp = await fetch('data/train-data.json');
    const data = await resp.json();
    trainRoutes = data.routes.map(r => ({
      ...r,
      visible: true,
      color: TRAIN_ROUTE_COLORS[r.id] || '#ff9800',
    }));
    trainStations    = data.stations;
    trainCheckpoints = data.checkpoints;
    saveTrainData();
  } catch (e) {
    console.error('Failed to load train-data.json', e);
    trainRoutes = [];
    trainStations = [];
    trainCheckpoints = [];
  }
}

function getTrainRouteCheckpoints(routeId) {
  return trainCheckpoints.filter(c => c.route === routeId);
}

function getTrainRouteStations(routeId) {
  return trainStations.filter(s => s.route === routeId);
}

function getTrainRouteById(id) {
  return trainRoutes.find(r => r.id === id);
}

function escTrainHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectTrainRoute(idx) {
  if (idx === null || selectedTrainRouteIdx === idx) {
    selectedTrainRouteIdx = null;
    selectedTrainCheckpointId = null;
    selectedTrainStationId = null;
    renderTrainRouteList();
    draw();
    return;
  }

  selectedTrainRouteIdx = idx;
  selectedTrainCheckpointId = null;
  selectedTrainStationId = null;
  renderTrainRouteList();

  const route = trainRoutes[idx];
  if (route) {
    const cps = getTrainRouteCheckpoints(route.id);
    if (cps.length > 0) {
      const xs = cps.map(c => c.x);
      const ys = cps.map(c => c.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const padX = (maxX - minX) * 0.12 || 500;
      const padY = (maxY - minY) * 0.12 || 500;
      const scaleX = canvas.width  / (maxX - minX + padX * 2);
      const scaleY = canvas.height / (maxY - minY + padY * 2);
      viewScale = Math.max(0.05, Math.min(20, Math.min(scaleX, scaleY)));
      viewX = (minX + maxX) / 2 - canvas.width  / 2 / viewScale;
      viewY = (minY + maxY) / 2 + canvas.height / 2 / viewScale;
    }
  }
  draw();
}

function toggleTrainRouteVisible(idx) {
  trainRoutes[idx].visible = !trainRoutes[idx].visible;
  saveTrainData();
  renderTrainRouteList();
  draw();
}

function selectTrainCheckpoint(cpId) {
  selectedTrainCheckpointId = selectedTrainCheckpointId === cpId ? null : cpId;
  selectedTrainStationId = null;
  renderTrainRouteList();
  const cp = trainCheckpoints.find(c => c.id === cpId);
  if (cp) {
    viewScale = Math.max(viewScale, 1.5);
    viewX = cp.x - canvas.width  / 2 / viewScale;
    viewY = cp.y + canvas.height / 2 / viewScale;
  }
  draw();
}

function selectTrainStation(stId) {
  selectedTrainStationId = selectedTrainStationId === stId ? null : stId;
  selectedTrainCheckpointId = null;
  renderTrainRouteList();
  const st = trainStations.find(s => s.id === stId);
  if (st) {
    viewScale = Math.max(viewScale, 1.5);
    viewX = st.x - canvas.width  / 2 / viewScale;
    viewY = st.y + canvas.height / 2 / viewScale;
  }
  draw();
}

function renderTrainRouteList() {
  const routeEl = document.getElementById('train-route-list');
  const stationEl = document.getElementById('train-station-list');
  const cpEl = document.getElementById('train-checkpoint-list');
  if (!routeEl) return;

  routeEl.innerHTML = '';
  const isSingle = selectedTrainRouteIdx !== null && trainRoutes[selectedTrainRouteIdx];

  if (isSingle) {
    const route = trainRoutes[selectedTrainRouteIdx];
    const idx = selectedTrainRouteIdx;
    const cps = getTrainRouteCheckpoints(route.id);
    const stops = cps.filter(c => c.type_checkpoint === 1).length;

    const back = document.createElement('div');
    back.className = 'route-back-row';
    back.innerHTML = `<button class="route-back-btn" onclick="selectTrainRoute(${idx})">← Все маршруты</button>
      <span class="route-stat" style="margin-left:auto">${cps.length}т &nbsp; <span class="route-stops">${stops}ст</span></span>`;
    routeEl.appendChild(back);

    const card = document.createElement('div');
    card.className = 'route-card active';
    card.innerHTML = `
      <div class="route-card-header">
        <button class="route-vis-btn" title="Показать/скрыть" onclick="toggleTrainRouteVisible(${idx})" style="color:${route.visible ? route.color : '#555'}">${route.visible ? '●' : '○'}</button>
        <div class="route-card-title">
          <span class="route-badge route-badge-urban">${TRAIN_ROUTE_KIND_LABELS[route.kind] || 'Поезд'}</span>
          <span class="route-name">${escTrainHtml(route.name)}</span>
        </div>
      </div>`;
    routeEl.appendChild(card);
  } else {
    trainRoutes.forEach((route, idx) => {
      const cps = getTrainRouteCheckpoints(route.id);
      const stops = cps.filter(c => c.type_checkpoint === 1).length;
      const card = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = `
        <div class="route-card-header">
          <button class="route-vis-btn" title="Показать/скрыть" onclick="toggleTrainRouteVisible(${idx})" style="color:${route.visible ? route.color : '#555'}">${route.visible ? '●' : '○'}</button>
          <div class="route-card-title" onclick="selectTrainRoute(${idx})">
            <span class="route-badge route-badge-urban">${TRAIN_ROUTE_KIND_LABELS[route.kind] || 'Поезд'}</span>
            <span class="route-name">${escTrainHtml(route.name)}</span>
          </div>
          <div class="route-card-meta" onclick="selectTrainRoute(${idx})">
            <span class="route-stat">${cps.length}т</span>
            <span class="route-stat route-stops">${stops}ст</span>
          </div>
        </div>`;
      routeEl.appendChild(card);
    });
  }

  if (!stationEl || !cpEl) return;

  stationEl.innerHTML = '';
  cpEl.innerHTML = '';

  if (!isSingle) {
    stationEl.innerHTML = '<div style="color:var(--text-tertiary);padding:8px;font-size:12px">Выберите маршрут</div>';
    cpEl.innerHTML = '<div style="color:var(--text-tertiary);padding:8px;font-size:12px">Выберите маршрут</div>';
    return;
  }

  const route = trainRoutes[selectedTrainRouteIdx];
  const stations = getTrainRouteStations(route.id);
  const cps = getTrainRouteCheckpoints(route.id);

  const stHeader = document.createElement('div');
  stHeader.className = 'cp-list-header';
  stHeader.innerHTML = `<span style="font-size:11px;color:var(--text-tertiary)">Станции <b style="color:${route.color}">train_checks</b></span>`;
  stationEl.appendChild(stHeader);

  stations.forEach((st, i) => {
    const sel = st.id === selectedTrainStationId;
    const row = document.createElement('div');
    row.className = 'cp-row cp-stop' + (sel ? ' cp-selected' : '');
    row.innerHTML = `
      <div class="cp-row-main" onclick="selectTrainStation(${st.id})">
        <span class="cp-index">#${i + 1}</span>
        <span class="cp-stop-btn active" title="Станция">🚉</span>
        <span class="cp-coords">${escTrainHtml(st.name)}</span>
        <span class="cp-storage-badge" style="margin-left:auto;font-family:var(--font-mono)">${st.x.toFixed(1)}, ${st.y.toFixed(1)}</span>
      </div>
      ${sel ? `<div class="cp-editor"><div class="cp-editor-grid">
        <label>ID</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${st.id}</span>
        <label>X</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${st.x}</span>
        <label>Y</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${st.y}</span>
        <label>Z</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${st.z}</span>
      </div></div>` : ''}`;
    stationEl.appendChild(row);
  });

  const cpHeader = document.createElement('div');
  cpHeader.className = 'cp-list-header';
  cpHeader.innerHTML = `<span style="font-size:11px;color:var(--text-tertiary)">Чекпоинты <b style="color:${route.color}">type=2</b></span>`;
  cpEl.appendChild(cpHeader);

  cps.forEach((cp, localIdx) => {
    const isStop = cp.type_checkpoint === 1;
    const isSelected = cp.id === selectedTrainCheckpointId;
    const row = document.createElement('div');
    row.className = 'cp-row' + (isStop ? ' cp-stop' : '') + (isSelected ? ' cp-selected' : '');
    row.innerHTML = `
      <div class="cp-row-main" onclick="selectTrainCheckpoint(${cp.id})">
        <span class="cp-index">#${localIdx + 1}</span>
        <span class="cp-stop-btn${isStop ? ' active' : ''}" title="${isStop ? 'Станция (type_checkpoint=1)' : 'Путевая точка'}">${isStop ? '🚏' : '·'}</span>
        <span class="cp-coords">${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}</span>
        ${isStop ? `<span class="cp-storage-badge">S:${cp.storage}</span>` : ''}
        <span class="cp-storage-badge" style="margin-left:auto;opacity:0.7">id:${cp.id}</span>
      </div>
      ${isSelected ? `<div class="cp-editor"><div class="cp-editor-grid">
        <label>X</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.x}</span>
        <label>Y</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.y}</span>
        <label>Z</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.z}</span>
        <label>Size</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.size}</span>
        <label>Storage</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.storage}</span>
        <label>Type CP</label><span class="field-input" style="border:none;background:transparent;padding:4px 0">${cp.type_checkpoint}</span>
      </div></div>` : ''}`;
    cpEl.appendChild(row);
  });
}

function resetTrainData() {
  showConfirm('Сбросить данные машиниста к исходным из JSON?', async () => {
    localStorage.removeItem(STORAGE_TRAIN_ROUTES);
    localStorage.removeItem(STORAGE_TRAIN_STATIONS);
    localStorage.removeItem(STORAGE_TRAIN_CHECKPOINTS);
    selectedTrainRouteIdx = null;
    selectedTrainCheckpointId = null;
    selectedTrainStationId = null;
    await initTrainData();
    renderTrainRouteList();
    draw();
    showToast('Данные машиниста сброшены');
  });
}

function exportTrainRouteSQL() {
  const routeIds = selectedTrainRouteIdx !== null
    ? [trainRoutes[selectedTrainRouteIdx].id]
    : trainRoutes.map(r => r.id);

  const toExport = trainCheckpoints.filter(c => routeIds.includes(c.route));
  if (!toExport.length) {
    showToast('Нет данных для экспорта');
    return;
  }

  const rows = toExport.map(c =>
    `\t(${c.id}, ${c.type}, ${c.route}, ${c.type_checkpoint}, ${c.x}, ${c.y}, ${c.z}, ${c.size}, ${c.storage})`
  ).join(',\n');

  const sql = `DELETE FROM \`checkpoint\` WHERE \`type\` = 2 AND \`route\` IN (${[...new Set(toExport.map(c => c.route))].join(',')});\n` +
    `INSERT INTO \`checkpoint\` (\`id\`, \`type\`, \`route\`, \`type_checkpoint\`, \`x\`, \`y\`, \`z\`, \`size\`, \`storage\`) VALUES\n` +
    rows + ';';

  openExportModal(
    selectedTrainRouteIdx !== null
      ? `SQL машинист — ${trainRoutes[selectedTrainRouteIdx].name}`
      : 'SQL машинист — все маршруты',
    sql
  );
}

function exportTrainStationsSQL() {
  const routeIds = selectedTrainRouteIdx !== null
    ? [trainRoutes[selectedTrainRouteIdx].id]
    : trainRoutes.map(r => r.id);

  const toExport = trainStations.filter(s => routeIds.includes(s.route));
  if (!toExport.length) {
    showToast('Нет станций для экспорта');
    return;
  }

  const rows = toExport.map(s =>
    `\t(${s.id}, '${s.name.replace(/'/g, "''")}', ${s.route}, ${s.x}, ${s.y}, ${s.z})`
  ).join(',\n');

  const sql = `DELETE FROM \`train_checks\` WHERE \`CHECK_ROUTE\` IN (${[...new Set(toExport.map(s => s.route))].join(',')});\n` +
    `INSERT INTO \`train_checks\` (\`CHECK_ID\`, \`CHECK_NAME\`, \`CHECK_ROUTE\`, \`CHECK_STATION_X\`, \`CHECK_STATION_Y\`, \`CHECK_STATION_Z\`) VALUES\n` +
    rows + ';';

  openExportModal(
    selectedTrainRouteIdx !== null
      ? `SQL train_checks — ${trainRoutes[selectedTrainRouteIdx].name}`
      : 'SQL train_checks — все маршруты',
    sql
  );
}

function drawTrainRoutes() {
  if (!showTrainRoutes) return;

  trainRoutes.forEach(route => {
    if (!route.visible) return;
    const cps = getTrainRouteCheckpoints(route.id);
    if (!cps.length) return;

    const isSelected = trainRoutes.indexOf(route) === selectedTrainRouteIdx;
    if (selectedTrainRouteIdx !== null && !isSelected) return;

    const col = route.color;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.beginPath();
    cps.forEach((cp, i) => {
      const s = worldToScreen(cp.x, cp.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    if (cps.length > 1) {
      const minLen = isSelected ? 28 : 40;
      const sz = isSelected ? 8 : 6;
      for (let i = 1; i < cps.length; i++) {
        const prev = worldToScreen(cps[i - 1].x, cps[i - 1].y);
        const curr = worldToScreen(cps[i].x, cps[i].y);
        drawArrow(ctx, prev, curr, col, sz, minLen);
      }
    }

    cps.forEach((cp, i) => {
      const s = worldToScreen(cp.x, cp.y);
      const stop = cp.type_checkpoint === 1;
      if (stop && !showTrainStops) return;
      const sel = cp.id === selectedTrainCheckpointId;
      const r = sel ? 7 : (stop ? 5 : 3);
      ctx.fillStyle = stop ? col : 'rgba(255,255,255,0.55)';
      ctx.strokeStyle = col;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (stop && isSelected) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`S${cp.storage}`, s.x + 8, s.y - 4);
      }
      if (!stop && sel) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText(`#${i + 1}`, s.x + 6, s.y - 4);
      }
    });

    if (isSelected) {
      const stations = getTrainRouteStations(route.id);
      stations.forEach(st => {
        if (st.x === 0 && st.y === 0 && st.name === 'Конечная') return;
        const s = worldToScreen(st.x, st.y);
        const sel = st.id === selectedTrainStationId;
        ctx.strokeStyle = '#ffd54f';
        ctx.fillStyle = sel ? 'rgba(255,213,79,0.35)' : 'rgba(255,213,79,0.15)';
        ctx.lineWidth = sel ? 2 : 1;
        const sz = sel ? 10 : 7;
        ctx.beginPath();
        ctx.rect(s.x - sz, s.y - sz, sz * 2, sz * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffd54f';
        ctx.font = `bold ${sel ? 11 : 9}px monospace`;
        ctx.fillText(st.name, s.x + sz + 3, s.y + 3);
      });
    }

    ctx.restore();
  });
}
