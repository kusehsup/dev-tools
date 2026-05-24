// ============================================================
// ROUTES — Bus driver routes: data, CRUD, rendering, canvas
// ============================================================

const ROUTE_TYPE_LABELS = {
  SUBURBAN:    'Пригородный',
  URBAN:       'Городской',
  INTERURBAN:  'Межгородской',
};

const ROUTE_TYPE_COLORS = {
  SUBURBAN:   '#4caf50',
  URBAN:      '#2196f3',
  INTERURBAN: '#ff9800',
};

const STORAGE_ROUTES     = 'bus_routes_data';
const STORAGE_CHECKPOINTS = 'bus_checkpoints_data';

// --- In-memory state (populated on load) ---
let busRoutes      = [];   // array of route objects {id,name,type,visible,color}
let busCheckpoints = [];   // array of checkpoint objects
let selectedRouteIdx    = null;
let selectedCheckpointId = null;
let showBusRoutes  = true;
let showStops      = true;  // type_checkpoint === 1

// ============================================================
// Persistence
// ============================================================

function saveRoutesData() {
  localStorage.setItem(STORAGE_ROUTES,      JSON.stringify(busRoutes));
  localStorage.setItem(STORAGE_CHECKPOINTS, JSON.stringify(busCheckpoints));
}

function loadRoutesData() {
  try {
    const r = localStorage.getItem(STORAGE_ROUTES);
    const c = localStorage.getItem(STORAGE_CHECKPOINTS);
    if (r && c) {
      busRoutes      = JSON.parse(r);
      busCheckpoints = JSON.parse(c);
      return true;
    }
  } catch {}
  return false;
}

async function initRoutesData() {
  if (loadRoutesData()) return;
  try {
    const resp = await fetch('data/checkpoints.json');
    const data = await resp.json();
    busRoutes = data.routes.map(r => ({
      ...r,
      visible: true,
      color: ROUTE_TYPE_COLORS[r.type] || '#aaaaaa',
    }));
    busCheckpoints = data.checkpoints;
    saveRoutesData();
  } catch(e) {
    console.error('Failed to load checkpoints.json', e);
    busRoutes = [];
    busCheckpoints = [];
  }
}

// ============================================================
// Helpers
// ============================================================

function getRouteCheckpoints(routeId) {
  return busCheckpoints.filter(c => c.route === routeId);
}

function getRouteById(id) {
  return busRoutes.find(r => r.id === id);
}

function nextCheckpointId() {
  return busCheckpoints.length === 0 ? 1 : Math.max(...busCheckpoints.map(c => c.id)) + 1;
}

// ============================================================
// Route CRUD
// ============================================================

function addRoute() {
  const newId = busRoutes.length === 0 ? 0 : Math.max(...busRoutes.map(r => r.id)) + 1;
  const route = {
    id:      newId,
    name:    `Маршрут ${newId}`,
    type:    'URBAN',
    visible: true,
    color:   ROUTE_TYPE_COLORS['URBAN'],
  };
  busRoutes.push(route);
  saveRoutesData();
  renderRouteList();
  selectRoute(busRoutes.length - 1);
  showToast('Маршрут добавлен');
}

function removeRoute(idx) {
  const route = busRoutes[idx];
  showConfirm(`Удалить маршрут «${route.name}» и все его чекпоинты?`, () => {
    busCheckpoints = busCheckpoints.filter(c => c.route !== route.id);
    busRoutes.splice(idx, 1);
    if (selectedRouteIdx >= busRoutes.length) selectedRouteIdx = busRoutes.length - 1;
    saveRoutesData();
    renderRouteList();
    draw();
    showToast('Маршрут удалён');
  });
}

function selectRoute(idx) {
  // Toggle off if clicking the already-selected route
  if (selectedRouteIdx === idx) {
    selectedRouteIdx     = null;
    selectedCheckpointId = null;
    renderRouteList();
    renderCheckpointList();
    draw();
    return;
  }

  selectedRouteIdx     = idx;
  selectedCheckpointId = null;
  renderRouteList();
  renderCheckpointList();

  if (idx !== null && busRoutes[idx]) {
    const cps = getRouteCheckpoints(busRoutes[idx].id);
    if (cps.length > 0) {
      // Fit all checkpoints of this route into view
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

function updateRouteField(idx, field, value) {
  if (!busRoutes[idx]) return;
  busRoutes[idx][field] = value;
  if (field === 'type') {
    busRoutes[idx].color = ROUTE_TYPE_COLORS[value] || '#aaaaaa';
  }
  saveRoutesData();
  renderRouteList();
  draw();
}

function toggleRouteVisible(idx) {
  busRoutes[idx].visible = !busRoutes[idx].visible;
  saveRoutesData();
  renderRouteList();
  draw();
}

// ============================================================
// Checkpoint CRUD
// ============================================================

function addCheckpoint(routeId, x, y) {
  const route = getRouteById(routeId);
  if (!route) return;
  const cps = getRouteCheckpoints(routeId);
  const cp = {
    id:              nextCheckpointId(),
    type:            0,
    route:           routeId,
    type_checkpoint: 0,
    x, y, z:         40.0,
    size:            4,
    storage:         0,
  };
  busCheckpoints.push(cp);
  saveRoutesData();
  renderCheckpointList();
  draw();
  return cp;
}

function removeCheckpoint(cpId) {
  const idx = busCheckpoints.findIndex(c => c.id === cpId);
  if (idx < 0) return;
  busCheckpoints.splice(idx, 1);
  if (selectedCheckpointId === cpId) selectedCheckpointId = null;
  saveRoutesData();
  renderCheckpointList();
  draw();
}

function updateCheckpointField(cpId, field, value) {
  const cp = busCheckpoints.find(c => c.id === cpId);
  if (!cp) return;
  cp[field] = (field === 'type_checkpoint' || field === 'storage' || field === 'type')
    ? parseInt(value) : parseFloat(value);
  saveRoutesData();
  draw();
}

function toggleCheckpointStop(cpId) {
  const cp = busCheckpoints.find(c => c.id === cpId);
  if (!cp) return;
  cp.type_checkpoint = cp.type_checkpoint === 1 ? 0 : 1;
  saveRoutesData();
  renderCheckpointList();
  draw();
}

// ============================================================
// Sidebar rendering
// ============================================================

function renderRouteList() {
  const el = document.getElementById('route-list');
  if (!el) return;
  el.innerHTML = '';

  busRoutes.forEach((route, idx) => {
    const cps       = getRouteCheckpoints(route.id);
    const stopCount = cps.filter(c => c.type_checkpoint === 1).length;
    const isActive  = idx === selectedRouteIdx;

    const card = document.createElement('div');
    card.className = 'route-card' + (isActive ? ' active' : '');
    card.innerHTML = `
      <div class="route-card-header">
        <button class="route-vis-btn" title="Показать/скрыть" onclick="toggleRouteVisible(${idx})" style="color:${route.visible ? route.color : '#555'}">${route.visible ? '●' : '○'}</button>
        <div class="route-card-title" onclick="selectRoute(${idx})">
          <span class="route-badge route-badge-${route.type.toLowerCase()}">${ROUTE_TYPE_LABELS[route.type]}</span>
          <span class="route-name">${escHtml(route.name)}</span>
        </div>
        <div class="route-card-meta" onclick="selectRoute(${idx})">
          <span class="route-stat">${cps.length}т</span>
          <span class="route-stat route-stops">${stopCount}ост</span>
        </div>
        <button class="btn-remove" onclick="removeRoute(${idx})" title="Удалить маршрут">✕</button>
      </div>
      ${isActive ? renderRouteEditor(route, idx) : ''}
    `;
    el.appendChild(card);
  });

  renderCheckpointList();
}

function renderRouteEditor(route, idx) {
  return `
    <div class="route-editor">
      <div class="field-row">
        <label class="field-label">Название</label>
        <input class="field-input" value="${escHtml(route.name)}"
          onchange="updateRouteField(${idx},'name',this.value)"
          oninput="busRoutes[${idx}].name=this.value">
      </div>
      <div class="field-row">
        <label class="field-label">Тип</label>
        <select class="field-input" onchange="updateRouteField(${idx},'type',this.value)">
          ${['SUBURBAN','URBAN','INTERURBAN'].map(t =>
            `<option value="${t}" ${route.type===t?'selected':''}>${ROUTE_TYPE_LABELS[t]}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-row">
        <label class="field-label">Цвет</label>
        <input type="color" class="field-color" value="${route.color}"
          onchange="updateRouteField(${idx},'color',this.value)">
      </div>
    </div>
  `;
}

function renderCheckpointList() {
  const el = document.getElementById('checkpoint-list');
  if (!el) return;
  el.innerHTML = '';

  if (selectedRouteIdx === null || !busRoutes[selectedRouteIdx]) {
    el.innerHTML = '<div style="color:var(--text-tertiary);padding:8px;font-size:12px">Выберите маршрут</div>';
    return;
  }

  const route = busRoutes[selectedRouteIdx];
  const cps   = getRouteCheckpoints(route.id);

  const header = document.createElement('div');
  header.className = 'cp-list-header';
  header.innerHTML = `
    <span style="font-size:11px;color:var(--text-tertiary)">Чекпоинты маршрута: <b style="color:${route.color}">${escHtml(route.name)}</b></span>
    <button class="btn btn-green" style="padding:2px 8px;font-size:11px" onclick="startAddCheckpointMode()">+ Добавить</button>
  `;
  el.appendChild(header);

  if (cps.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text-tertiary);padding:8px;font-size:12px';
    empty.textContent = 'Нет чекпоинтов. Нажмите «+ Добавить» и кликните на карте.';
    el.appendChild(empty);
    return;
  }

  cps.forEach((cp, localIdx) => {
    const isStop    = cp.type_checkpoint === 1;
    const isSelected = cp.id === selectedCheckpointId;
    const row = document.createElement('div');
    row.className = 'cp-row' + (isStop ? ' cp-stop' : '') + (isSelected ? ' cp-selected' : '');
    row.innerHTML = `
      <div class="cp-row-main" onclick="selectCheckpoint(${cp.id})">
        <span class="cp-index">#${localIdx + 1}</span>
        <button class="cp-stop-btn${isStop?' active':''}" title="${isStop?'Остановка':'Путевая точка'}"
          onclick="event.stopPropagation();toggleCheckpointStop(${cp.id})">
          ${isStop ? '🚏' : '·'}
        </button>
        <span class="cp-coords">${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}</span>
        ${isStop ? `<span class="cp-storage-badge">S:${cp.storage}</span>` : ''}
        <button class="btn-remove" style="margin-left:auto" onclick="event.stopPropagation();removeCheckpoint(${cp.id})" title="Удалить">✕</button>
      </div>
      ${isSelected ? renderCpEditor(cp) : ''}
    `;
    el.appendChild(row);
  });
}

function renderCpEditor(cp) {
  return `
    <div class="cp-editor">
      <div class="cp-editor-grid">
        <label>X</label><input class="field-input" type="number" step="0.1" value="${cp.x}"
          onchange="updateCheckpointField(${cp.id},'x',this.value)">
        <label>Y</label><input class="field-input" type="number" step="0.1" value="${cp.y}"
          onchange="updateCheckpointField(${cp.id},'y',this.value)">
        <label>Z</label><input class="field-input" type="number" step="0.1" value="${cp.z}"
          onchange="updateCheckpointField(${cp.id},'z',this.value)">
        <label>Size</label><input class="field-input" type="number" step="0.5" min="1" value="${cp.size}"
          onchange="updateCheckpointField(${cp.id},'size',this.value)">
        <label>Storage</label><input class="field-input" type="number" step="1" min="0" value="${cp.storage}"
          onchange="updateCheckpointField(${cp.id},'storage',this.value)">
        <label>Type</label><input class="field-input" type="number" step="1" min="0" max="1" value="${cp.type_checkpoint}"
          onchange="updateCheckpointField(${cp.id},'type_checkpoint',this.value)">
      </div>
    </div>
  `;
}

function selectCheckpoint(cpId) {
  selectedCheckpointId = selectedCheckpointId === cpId ? null : cpId;
  renderCheckpointList();
  const cp = busCheckpoints.find(c => c.id === cpId);
  if (cp) {
    viewScale = Math.max(viewScale, 1.5);
    viewX = cp.x - canvas.width  / 2 / viewScale;
    viewY = cp.y + canvas.height / 2 / viewScale;
  }
  draw();
}

// ============================================================
// Add-checkpoint mode
// ============================================================

let addingCheckpointMode = false;

function startAddCheckpointMode() {
  if (selectedRouteIdx === null) return;
  addingCheckpointMode = true;
  setMode('pan');
  canvas.style.cursor = 'crosshair';
  setInfo('Кликните на карте, чтобы добавить чекпоинт · ПКМ или Escape — отмена');
  showToast('Режим добавления чекпоинта');
}

function cancelAddCheckpointMode() {
  addingCheckpointMode = false;
  canvas.style.cursor = 'grab';
  setInfo('');
}

// ============================================================
// Export to SQL
// ============================================================

function exportRouteSQL() {
  const routeIds = selectedRouteIdx !== null
    ? [busRoutes[selectedRouteIdx].id]
    : busRoutes.map(r => r.id);

  const toExport = busCheckpoints.filter(c => routeIds.includes(c.route));

  if (toExport.length === 0) {
    showToast('Нет данных для экспорта');
    return;
  }

  const rows = toExport.map(c =>
    `\t(${c.id}, ${c.type}, ${c.route}, ${c.type_checkpoint}, ${c.x}, ${c.y}, ${c.z}, ${c.size}, ${c.storage})`
  ).join(',\n');

  const sql = `DELETE FROM \`checkpoint\` WHERE \`route\` IN (${[...new Set(toExport.map(c=>c.route))].join(',')});\n` +
    `INSERT INTO \`checkpoint\` (\`id\`, \`type\`, \`route\`, \`type_checkpoint\`, \`x\`, \`y\`, \`z\`, \`size\`, \`storage\`) VALUES\n` +
    rows + ';';

  openExportModal(
    selectedRouteIdx !== null
      ? `SQL — ${busRoutes[selectedRouteIdx].name}`
      : 'SQL — все маршруты',
    sql
  );
}

function exportAllRoutesSQL() {
  const savedIdx = selectedRouteIdx;
  selectedRouteIdx = null;
  exportRouteSQL();
  selectedRouteIdx = savedIdx;
}

// ============================================================
// Canvas drawing
// ============================================================

function drawBusRoutes() {
  if (!showBusRoutes) return;

  busRoutes.forEach(route => {
    if (!route.visible) return;

    const cps = getRouteCheckpoints(route.id);
    if (cps.length === 0) return;

    const isSelected = busRoutes.indexOf(route) === selectedRouteIdx;
    // Hide non-selected routes when a route is actively selected
    if (selectedRouteIdx !== null && !isSelected) return;

    const col = route.color;
    const alpha = 1.0;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw path line
    ctx.strokeStyle = col;
    ctx.lineWidth   = isSelected ? 3 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    cps.forEach((cp, i) => {
      const s = worldToScreen(cp.x, cp.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else         ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    // Arrow direction indicators every N points
    if (isSelected && cps.length > 1) {
      const step = Math.max(1, Math.floor(cps.length / 8));
      for (let i = step; i < cps.length; i += step) {
        const prev = worldToScreen(cps[i-1].x, cps[i-1].y);
        const curr = worldToScreen(cps[i].x,   cps[i].y);
        drawArrow(ctx, prev, curr, col);
      }
    }

    // Draw checkpoints
    cps.forEach((cp, i) => {
      const s    = worldToScreen(cp.x, cp.y);
      const stop = cp.type_checkpoint === 1;
      const isSel = cp.id === selectedCheckpointId;

      if (stop && showStops) {
        // Stop marker — bigger circle with white outline
        ctx.beginPath();
        ctx.arc(s.x, s.y, isSel ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Stop number label
        if (viewScale > 0.08) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.min(10, Math.max(7, viewScale * 18))}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(cp.storage || i + 1), s.x, s.y);
        }
      } else {
        // Waypoint dot
        const r = isSel ? 5 : (isSelected ? 3 : 2);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    });

    // Route label near first checkpoint
    if (isSelected || viewScale > 0.15) {
      const s = worldToScreen(cps[0].x, cps[0].y);
      ctx.fillStyle = col;
      ctx.font = `bold ${isSelected ? 11 : 9}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.globalAlpha = isSelected ? 1 : 0.7;
      ctx.fillText(route.name.slice(0, 28), s.x + 8, s.y - 4);
    }

    ctx.restore();
  });
}

function drawArrow(ctx, from, to, color) {
  const dx  = to.x - from.x;
  const dy  = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 12) return;

  const mx  = (from.x + to.x) / 2;
  const my  = (from.y + to.y) / 2;
  const ang = Math.atan2(dy, dx);
  const sz  = 7;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo( sz, 0);
  ctx.lineTo(-sz,  sz * 0.5);
  ctx.lineTo(-sz, -sz * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ============================================================
// Utility
// ============================================================

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function scrollToRoute(idx) {
  const el = document.getElementById('route-list');
  if (!el) return;
  const cards = el.querySelectorAll('.route-card');
  if (cards[idx]) cards[idx].scrollIntoView({ block: 'nearest' });
}
