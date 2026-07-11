// ============================================================
// TRAIN ROUTES — machinist checkpoints & train_checks stations
// ============================================================

const TRAIN_ROUTE_KIND_LABELS = {
  MAIN:  'Главная',
  METRO: 'Метро',
};

const TRAIN_ROUTE_BADGE_CLASS = {
  MAIN:  'route-badge-main',
  METRO: 'route-badge-metro',
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
let trainSubTab = 'stations'; // 'stations' | 'checkpoints'
let trainFilterStopsOnly = false;
let showTrainRoutes  = true;
let showTrainStops   = true;
let showTrainChecks  = true;

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

function getTrainStationsOrdered(routeId) {
  return getTrainRouteStations(routeId).filter(s => s.name !== 'Конечная');
}

function resolveTrainStopName(routeId, cp) {
  if (cp.type_checkpoint !== 1) return null;
  const ordered = getTrainStationsOrdered(routeId);
  if (ordered[cp.storage]) return ordered[cp.storage].name;
  const byId = trainStations.find(s => s.route === routeId && s.id === cp.storage);
  if (byId) return byId.name;
  let best = null;
  let bestD = Infinity;
  for (const st of ordered) {
    const d = Math.hypot(st.x - cp.x, st.y - cp.y);
    if (d < bestD) { bestD = d; best = st; }
  }
  return bestD < 250 ? best.name : null;
}

function escTrainHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trainBadgeClass(kind) {
  return TRAIN_ROUTE_BADGE_CLASS[kind] || 'route-badge-urban';
}

function fitTrainRouteToView(route) {
  const cps = getTrainRouteCheckpoints(route.id);
  const sts = getTrainRouteStations(route.id).filter(s => !(s.x === 0 && s.y === 0));
  const points = [
    ...cps.map(c => ({ x: c.x, y: c.y })),
    ...sts.map(s => ({ x: s.x, y: s.y })),
  ];
  if (!points.length) return;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.14 || 500;
  const padY = (maxY - minY) * 0.14 || 500;
  const scaleX = canvas.width  / (maxX - minX + padX * 2);
  const scaleY = canvas.height / (maxY - minY + padY * 2);
  viewScale = Math.max(0.05, Math.min(20, Math.min(scaleX, scaleY)));
  viewX = (minX + maxX) / 2 - canvas.width  / 2 / viewScale;
  viewY = (minY + maxY) / 2 + canvas.height / 2 / viewScale;
}

function switchTrainSubTab(tab) {
  trainSubTab = tab;
  document.getElementById('train-subtab-stations')?.classList.toggle('active', tab === 'stations');
  document.getElementById('train-subtab-checkpoints')?.classList.toggle('active', tab === 'checkpoints');
  renderTrainRouteList();
}

function setTrainFilterStopsOnly(checked) {
  trainFilterStopsOnly = !!checked;
  renderTrainRouteList();
}

function copyTrainCoords(x, y, z) {
  const text = `${x}, ${y}, ${z}`;
  navigator.clipboard.writeText(text).then(() => showToast(`Скопировано: ${text}`));
}

function scrollToTrainDetailRow(selector) {
  document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
  if (route) fitTrainRouteToView(route);
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
  if (trainSubTab !== 'checkpoints') switchTrainSubTab('checkpoints');
  renderTrainRouteList();
  const cp = trainCheckpoints.find(c => c.id === cpId);
  if (cp) {
    viewScale = Math.max(viewScale, 1.2);
    viewX = cp.x - canvas.width  / 2 / viewScale;
    viewY = cp.y + canvas.height / 2 / viewScale;
    scrollToTrainDetailRow(`[data-train-cp="${cpId}"]`);
  }
  draw();
}

function selectTrainStation(stId) {
  selectedTrainStationId = selectedTrainStationId === stId ? null : stId;
  selectedTrainCheckpointId = null;
  if (trainSubTab !== 'stations') switchTrainSubTab('stations');
  renderTrainRouteList();
  const st = trainStations.find(s => s.id === stId);
  if (st && !(st.x === 0 && st.y === 0)) {
    viewScale = Math.max(viewScale, 1.2);
    viewX = st.x - canvas.width  / 2 / viewScale;
    viewY = st.y + canvas.height / 2 / viewScale;
    scrollToTrainDetailRow(`[data-train-st="${stId}"]`);
  }
  draw();
}

function renderTrainSummary(route) {
  const el = document.getElementById('train-summary');
  if (!el) return;

  if (!route) {
    el.innerHTML = '<div class="train-summary-empty">Выберите маршрут, чтобы увидеть станции и чекпоинты</div>';
    return;
  }

  const cps = getTrainRouteCheckpoints(route.id);
  const stations = getTrainStationsOrdered(route.id);
  const stops = cps.filter(c => c.type_checkpoint === 1);
  const waypoints = cps.length - stops.length;

  el.innerHTML = `
    <div><b>${escTrainHtml(route.name)}</b> · маршрут #${route.id}</div>
    <div>${stations.length} станций БД · ${cps.length} чекпоинтов (${stops.length} ост., ${waypoints} пут.)</div>
  `;
}

function renderTrainDetailTools(route) {
  const el = document.getElementById('train-detail-tools');
  if (!el) return;

  if (!route) {
    el.innerHTML = '';
    return;
  }

  if (trainSubTab === 'stations') {
    const count = getTrainStationsOrdered(route.id).length;
    el.innerHTML = `<span class="train-detail-count">${count} записей train_checks</span>`;
    return;
  }

  const cps = getTrainRouteCheckpoints(route.id);
  const shown = trainFilterStopsOnly ? cps.filter(c => c.type_checkpoint === 1).length : cps.length;
  el.innerHTML = `
    <label><input type="checkbox" ${trainFilterStopsOnly ? 'checked' : ''} onchange="setTrainFilterStopsOnly(this.checked)"> Только остановки</label>
    <span class="train-detail-count">${shown} / ${cps.length}</span>
  `;
}

function renderTrainDetailList(route) {
  const el = document.getElementById('train-detail-list');
  if (!el) return;
  el.innerHTML = '';

  if (!route) {
    el.innerHTML = '<div style="color:var(--text-tertiary);padding:10px;font-size:12px">Список появится после выбора маршрута</div>';
    return;
  }

  if (trainSubTab === 'stations') {
    const stations = getTrainStationsOrdered(route.id);
    const header = document.createElement('div');
    header.className = 'cp-list-header';
    header.innerHTML = `<span style="font-size:11px;color:var(--text-tertiary)">Таблица <b style="color:${route.color}">train_checks</b></span>`;
    el.appendChild(header);

    stations.forEach((st, i) => {
      const sel = st.id === selectedTrainStationId;
      const row = document.createElement('div');
      row.className = 'cp-row cp-stop' + (sel ? ' cp-selected' : '');
      row.dataset.trainSt = String(st.id);
      row.innerHTML = `
        <div class="cp-row-main" onclick="selectTrainStation(${st.id})">
          <span class="cp-index">${st.id}</span>
          <span class="cp-stop-btn active" title="Станция">🚉</span>
          <span class="train-station-name">${escTrainHtml(st.name)}</span>
          <span class="train-station-coords">${st.x.toFixed(1)}, ${st.y.toFixed(1)}</span>
        </div>
        ${sel ? renderTrainStationEditor(st) : ''}`;
      el.appendChild(row);
    });
    return;
  }

  let cps = getTrainRouteCheckpoints(route.id);
  if (trainFilterStopsOnly) cps = cps.filter(c => c.type_checkpoint === 1);

  const header = document.createElement('div');
  header.className = 'cp-list-header';
  header.innerHTML = `<span style="font-size:11px;color:var(--text-tertiary)">Таблица <b style="color:${route.color}">checkpoint</b> · type=2</span>`;
  el.appendChild(header);

  if (!cps.length) {
    el.innerHTML += '<div style="color:var(--text-tertiary);padding:8px;font-size:12px">Нет чекпоинтов по фильтру</div>';
    return;
  }

  cps.forEach((cp, localIdx) => {
    const isStop = cp.type_checkpoint === 1;
    const isSelected = cp.id === selectedTrainCheckpointId;
    const stopName = isStop ? resolveTrainStopName(route.id, cp) : null;
    const row = document.createElement('div');
    row.className = 'cp-row' + (isStop ? ' cp-stop' : '') + (isSelected ? ' cp-selected' : '');
    row.dataset.trainCp = String(cp.id);
    row.innerHTML = `
      <div class="cp-row-main" onclick="selectTrainCheckpoint(${cp.id})">
        <span class="cp-index">#${localIdx + 1}</span>
        <span class="train-cp-kind ${isStop ? 'stop' : 'way'}">${isStop ? 'ост' : 'путь'}</span>
        <span class="cp-coords">${stopName ? escTrainHtml(stopName) : `${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}`}</span>
        ${isStop ? `<span class="cp-storage-badge">S:${cp.storage}</span>` : ''}
        <span class="cp-storage-badge" style="opacity:0.55">id:${cp.id}</span>
      </div>
      ${isSelected ? renderTrainCheckpointEditor(cp, route.id, stopName) : ''}`;
    el.appendChild(row);
  });
}

function renderTrainStationEditor(st) {
  return `
    <div class="cp-editor">
      <div class="cp-editor-grid" style="grid-template-columns:52px 1fr 52px 1fr">
        <label>CHECK_ID</label><span>${st.id}</span>
        <label>Маршрут</label><span>${st.route}</span>
        <label>X</label><span>${st.x}</span>
        <label>Y</label><span>${st.y}</span>
        <label>Z</label><span>${st.z}</span>
      </div>
      <div class="train-detail-actions">
        <button class="train-copy-btn" onclick="copyTrainCoords(${st.x}, ${st.y}, ${st.z})">Копировать XYZ</button>
      </div>
    </div>`;
}

function renderTrainCheckpointEditor(cp, routeId, stopName) {
  return `
    <div class="cp-editor">
      ${stopName ? `<div style="font-size:11px;color:#e8a020;margin-bottom:4px">Станция: <b>${escTrainHtml(stopName)}</b></div>` : ''}
      <div class="cp-editor-grid">
        <label>ID</label><span>${cp.id}</span>
        <label>Route</label><span>${cp.route}</span>
        <label>X</label><span>${cp.x}</span>
        <label>Y</label><span>${cp.y}</span>
        <label>Z</label><span>${cp.z}</span>
        <label>Size</label><span>${cp.size}</span>
        <label>Storage</label><span>${cp.storage}</span>
        <label>Type</label><span>${cp.type_checkpoint}</span>
      </div>
      <div class="train-detail-actions">
        <button class="train-copy-btn" onclick="copyTrainCoords(${cp.x}, ${cp.y}, ${cp.z})">Копировать XYZ</button>
      </div>
    </div>`;
}

function renderTrainRouteList() {
  const routeEl = document.getElementById('train-route-list');
  if (!routeEl) return;

  routeEl.innerHTML = '';
  const isSingle = selectedTrainRouteIdx !== null && trainRoutes[selectedTrainRouteIdx];
  routeEl.classList.toggle('route-list--single', !!isSingle);

  if (isSingle) {
    const route = trainRoutes[selectedTrainRouteIdx];
    const idx = selectedTrainRouteIdx;
    const cps = getTrainRouteCheckpoints(route.id);
    const stops = cps.filter(c => c.type_checkpoint === 1).length;

    const back = document.createElement('div');
    back.className = 'route-back-row';
    back.innerHTML = `<button class="route-back-btn" onclick="selectTrainRoute(${idx})">← Все маршруты</button>
      <span class="route-stat" style="margin-left:auto">${cps.length}т · <span class="route-stops">${stops}ост</span></span>`;
    routeEl.appendChild(back);

    const card = document.createElement('div');
    card.className = 'route-card active';
    card.innerHTML = `
      <div class="route-card-header">
        <button class="route-vis-btn" title="Показать/скрыть" onclick="toggleTrainRouteVisible(${idx})" style="color:${route.visible ? route.color : '#555'}">${route.visible ? '●' : '○'}</button>
        <div class="route-card-title">
          <span class="route-badge ${trainBadgeClass(route.kind)}">${TRAIN_ROUTE_KIND_LABELS[route.kind] || 'Поезд'}</span>
          <span class="route-name">${escTrainHtml(route.name)}</span>
        </div>
      </div>`;
    routeEl.appendChild(card);
  } else {
    trainRoutes.forEach((route, idx) => {
      const cps = getTrainRouteCheckpoints(route.id);
      const stops = cps.filter(c => c.type_checkpoint === 1).length;
      const stations = getTrainStationsOrdered(route.id).length;
      const card = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = `
        <div class="route-card-header">
          <button class="route-vis-btn" title="Показать/скрыть" onclick="event.stopPropagation();toggleTrainRouteVisible(${idx})" style="color:${route.visible ? route.color : '#555'}">${route.visible ? '●' : '○'}</button>
          <div class="route-card-title" onclick="selectTrainRoute(${idx})">
            <span class="route-badge ${trainBadgeClass(route.kind)}">${TRAIN_ROUTE_KIND_LABELS[route.kind] || 'Поезд'}</span>
            <span class="route-name">${escTrainHtml(route.name)}</span>
          </div>
          <div class="route-card-meta" onclick="selectTrainRoute(${idx})">
            <span class="route-stat">${stations}ст</span>
            <span class="route-stat">${cps.length}т</span>
            <span class="route-stat route-stops">${stops}ост</span>
          </div>
        </div>`;
      routeEl.appendChild(card);
    });
  }

  const route = isSingle ? trainRoutes[selectedTrainRouteIdx] : null;
  renderTrainSummary(route);
  renderTrainDetailTools(route);
  renderTrainDetailList(route);
}

function hitTestTrainMap(sx, sy) {
  const routes = selectedTrainRouteIdx !== null
    ? [trainRoutes[selectedTrainRouteIdx]].filter(Boolean)
    : trainRoutes.filter(r => r.visible);

  for (const route of routes) {
    if (selectedTrainRouteIdx === null && !route.visible) continue;

    const cps = getTrainRouteCheckpoints(route.id);
    for (let i = cps.length - 1; i >= 0; i--) {
      const cp = cps[i];
      const s = worldToScreen(cp.x, cp.y);
      const r = cp.type_checkpoint === 1 ? 10 : 6;
      if (Math.hypot(sx - s.x, sy - s.y) <= r) {
        return { kind: 'checkpoint', id: cp.id, cp, route };
      }
    }

    if (showTrainChecks) {
      const stations = getTrainStationsOrdered(route.id);
      for (let i = stations.length - 1; i >= 0; i--) {
        const st = stations[i];
        const s = worldToScreen(st.x, st.y);
        if (Math.hypot(sx - s.x, sy - s.y) <= 12) {
          return { kind: 'station', id: st.id, st, route };
        }
      }
    }
  }
  return null;
}

function resetTrainData() {
  showConfirm('Сбросить данные машиниста к исходным из JSON?', async () => {
    localStorage.removeItem(STORAGE_TRAIN_ROUTES);
    localStorage.removeItem(STORAGE_TRAIN_STATIONS);
    localStorage.removeItem(STORAGE_TRAIN_CHECKPOINTS);
    selectedTrainRouteIdx = null;
    selectedTrainCheckpointId = null;
    selectedTrainStationId = null;
    trainFilterStopsOnly = false;
    await initTrainData();
    renderTrainRouteList();
    draw();
    showToast('Данные машиниста сброшены');
  });
}

function parseSqlTupleValues(tupleStr) {
  const values = [];
  let i = 0;
  const s = tupleStr.trim().replace(/^\(/, '').replace(/\)$/, '');

  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;

    if (s[i] === "'") {
      let end = i + 1;
      while (end < s.length) {
        if (s[end] === "'" && s[end + 1] === "'") end += 2;
        else if (s[end] === "'") break;
        else end++;
      }
      values.push(s.slice(i + 1, end).replace(/''/g, "'"));
      i = end + 1;
      continue;
    }

    let end = i;
    while (end < s.length && s[end] !== ',') end++;
    const raw = s.slice(i, end).trim();
    values.push(raw === '' ? null : (raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10)));
    i = end + 1;
  }

  return values;
}

function parseCheckpointSQL(sql) {
  const rows = [];
  const insertRe = /INSERT\s+INTO\s+`?checkpoint`?\s*\([^)]*\)\s*VALUES\s*/gi;
  let match;

  while ((match = insertRe.exec(sql)) !== null) {
    const rest = sql.slice(match.index + match[0].length);
    let end = rest.indexOf(';');
    if (end === -1) end = rest.length;
    const valuesBlock = rest.slice(0, end);

    const tupleRe = /\(([^()]*)\)/g;
    let tupleMatch;
    while ((tupleMatch = tupleRe.exec(valuesBlock)) !== null) {
      const vals = parseSqlTupleValues('(' + tupleMatch[1] + ')');
      if (vals.length < 9) continue;
      rows.push({
        id: +vals[0],
        type: +vals[1],
        route: +vals[2],
        type_checkpoint: +vals[3],
        x: +vals[4],
        y: +vals[5],
        z: +vals[6],
        size: +vals[7],
        storage: +vals[8],
      });
    }
  }

  return rows;
}

function applyTrainCheckpointImport(imported) {
  const trainRouteIds = new Set(trainRoutes.map(r => r.id));
  const valid = imported.filter(c =>
    c.type === 2 &&
    trainRouteIds.has(c.route) &&
    Number.isFinite(c.id) &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y)
  );

  if (!valid.length) return { ok: false, reason: 'no_rows' };

  const affectedRoutes = new Set(valid.map(c => c.route));
  const kept = trainCheckpoints.filter(c => !affectedRoutes.has(c.route));
  trainCheckpoints = [...kept, ...valid];
  saveTrainData();

  const trainRows = imported.filter(c => c.type === 2 && trainRouteIds.has(c.route)).length;
  return {
    ok: true,
    imported: valid.length,
    skipped: imported.length - trainRows,
    routes: [...affectedRoutes].sort((a, b) => a - b),
  };
}

function importTrainCheckpointsFromSQL(sql) {
  const parsed = parseCheckpointSQL(sql);
  if (!parsed.length) {
    showToast('В SQL не найдено INSERT INTO checkpoint');
    return false;
  }

  const result = applyTrainCheckpointImport(parsed);
  if (!result.ok) {
    showToast('Нет чекпоинтов type=2 для маршрутов 0–2');
    return false;
  }

  selectedTrainCheckpointId = null;
  if (selectedTrainRouteIdx !== null) {
    const route = trainRoutes[selectedTrainRouteIdx];
    if (route && result.routes.includes(route.id)) fitTrainRouteToView(route);
  }
  if (trainSubTab !== 'checkpoints') switchTrainSubTab('checkpoints');
  renderTrainRouteList();
  draw();

  const routeNames = result.routes
    .map(id => trainRoutes.find(r => r.id === id)?.name || `#${id}`)
    .join(', ');
  const skipNote = result.skipped ? `, пропущено ${result.skipped}` : '';
  showToast(`Импортировано ${result.imported} чекпоинтов (${routeNames})${skipNote}`);
  return true;
}

function onTrainCheckpointFileSelected(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const name = file.name.toLowerCase();
  if (!name.endsWith('.sql') && !name.endsWith('.txt')) {
    showToast('Нужен файл .sql с INSERT INTO checkpoint');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    if (!/INSERT\s+INTO\s+`?checkpoint`?/i.test(text)) {
      showToast('Файл не содержит INSERT INTO checkpoint');
      return;
    }
    importTrainCheckpointsFromSQL(text);
  };
  reader.onerror = () => showToast('Ошибка чтения файла');
  reader.readAsText(file, 'utf-8');
}

function exportTrainRouteSQL() {
  const routeIds = selectedTrainRouteIdx !== null
    ? [trainRoutes[selectedTrainRouteIdx].id]
    : trainRoutes.map(r => r.id);

  const toExport = trainCheckpoints.filter(c => c.type === 2 && routeIds.includes(c.route));
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
      ? `SQL checkpoint — ${trainRoutes[selectedTrainRouteIdx].name}`
      : 'SQL checkpoint — все маршруты',
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
  if (!showTrainRoutes && !showTrainChecks) return;

  trainRoutes.forEach(route => {
    if (!route.visible) return;
    const cps = getTrainRouteCheckpoints(route.id);
    if (!cps.length) return;

    const isSelected = trainRoutes.indexOf(route) === selectedTrainRouteIdx;
    if (selectedTrainRouteIdx !== null && !isSelected) return;

    const col = route.color;
    ctx.save();

    if (showTrainRoutes) {
      ctx.globalAlpha = isSelected ? 1 : 0.85;
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
    }

    if (showTrainChecks) {
      getTrainStationsOrdered(route.id).forEach(st => {
        const s = worldToScreen(st.x, st.y);
        const sel = st.id === selectedTrainStationId;
        ctx.fillStyle = sel ? 'rgba(255,213,79,0.45)' : 'rgba(255,213,79,0.2)';
        ctx.strokeStyle = sel ? '#ffe082' : '#ffd54f';
        ctx.lineWidth = sel ? 2 : 1;
        const sz = sel ? 9 : 7;
        ctx.beginPath();
        ctx.rect(s.x - sz, s.y - sz, sz * 2, sz * 2);
        ctx.fill();
        ctx.stroke();

        if (isSelected || viewScale > 0.1) {
          ctx.fillStyle = '#ffe082';
          ctx.font = `bold ${sel ? 11 : 9}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(st.name, s.x + sz + 3, s.y - 2);
        }
      });
    }

    if (showTrainRoutes) {
      cps.forEach((cp, i) => {
        const s = worldToScreen(cp.x, cp.y);
        const stop = cp.type_checkpoint === 1;
        if (stop && !showTrainStops) return;
        const sel = cp.id === selectedTrainCheckpointId;
        const stopName = stop ? resolveTrainStopName(route.id, cp) : null;

        if (stop) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, sel ? 9 : 6, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (viewScale > 0.06) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.min(10, Math.max(7, viewScale * 16))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(cp.storage), s.x, s.y);
          }

          if ((sel || viewScale > 0.14) && stopName) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${sel ? 10 : 9}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(stopName, s.x + 10, s.y + 8);
          }
        } else {
          const r = sel ? 5 : (isSelected ? 3 : 2);
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          if (sel) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      });

      if (isSelected || viewScale > 0.12) {
        const s0 = worldToScreen(cps[0].x, cps[0].y);
        ctx.fillStyle = col;
        ctx.font = `bold ${isSelected ? 11 : 9}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.globalAlpha = isSelected ? 1 : 0.75;
        ctx.fillText(route.name, s0.x + 8, s0.y - 6);
      }
    }

    ctx.restore();
  });
}
