// ============================================================
// UI — tabs, mode switching, toggles, modals, toast, keyboard
// ============================================================

// --- Info bar ---
function setInfo(msg) {
  document.getElementById('info-bar').textContent = msg;
}

// --- Mode ---
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mode-' + m);
  if (btn) btn.classList.add('active');

  const cursors = { pan: 'grab', tl: 'cell', cal: 'crosshair' };
  canvas.style.cursor = cursors[m] || 'crosshair';

  document.getElementById('cal-panel')?.classList.toggle('open', m === 'cal');
  if (m === 'cal') {
    document.getElementById('map-panel')?.classList.remove('open');
    document.getElementById('btn-map-panel')?.classList.remove('active');
  }
}

// --- Tabs ---
function switchTab(t) {
  if (t === 'routes' && !FEATURES.ROUTES_TAB) return;

  const tabs = ['tl', 'zones', 'routes'];
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', tabs[i] === t));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', tabs[i] === t));

  const isTL     = t === 'tl';
  const isZones  = t === 'zones';
  const isRoutes = t === 'routes';

  const el_tl       = document.getElementById('mode-tl');
  const el_poly     = document.getElementById('mode-zone-poly');
  const el_rect     = document.getElementById('mode-zone-rect');
  const el_tlToggles = document.getElementById('tl-toggles');
  const el_rtToggles = document.getElementById('route-toggles');

  if (el_tl)        el_tl.style.display        = isTL     ? '' : 'none';
  if (el_poly)      el_poly.style.display       = isZones  ? '' : 'none';
  if (el_rect)      el_rect.style.display       = isZones  ? '' : 'none';
  if (el_tlToggles) el_tlToggles.style.display  = isTL     ? '' : 'none';
  if (el_rtToggles) el_rtToggles.style.display  = isRoutes ? '' : 'none';

  if (t === 'tl') {
    activeContext = 'tl';
    if (['zone-poly', 'zone-rect'].includes(mode)) setMode('tl');
    drawingZone = null;
    cancelAddCheckpointMode?.();
  } else if (t === 'zones') {
    activeContext = 'zones';
    if (mode === 'tl') setMode('pan');
    cancelAddCheckpointMode?.();
    switchZonesSubTab(zonesSubTab || 'green');
  } else if (t === 'routes') {
    activeContext = 'routes';
    if (['tl','zone-poly','zone-rect'].includes(mode)) setMode('pan');
    drawingZone = null;
  }

  draw();
}

// --- Visibility toggles ---
function toggleMap()    { showMap    = !showMap;    document.getElementById('btn-map').classList.toggle('on', showMap);     draw(); }
function toggleZones()  { showZones  = !showZones;  document.getElementById('btn-zones').classList.toggle('on', showZones); draw(); }
function toggleAngles() { showAngles = !showAngles; document.getElementById('btn-angles').classList.toggle('on', showAngles); draw(); }
function toggleBusRoutes() { showBusRoutes = !showBusRoutes; document.getElementById('btn-routes-canvas').classList.toggle('on', showBusRoutes); draw(); }
function toggleShowRoutes() { showBusRoutes = !showBusRoutes; document.getElementById('btn-show-routes').classList.toggle('on', showBusRoutes); draw(); }
function toggleShowStops()  { showStops    = !showStops;    document.getElementById('btn-show-stops').classList.toggle('on', showStops);  draw(); }

function resetRoutesData() {
  showConfirm('Сбросить все данные маршрутов к исходным из SQL?', async () => {
    localStorage.removeItem('bus_routes_data');
    localStorage.removeItem('bus_checkpoints_data');
    selectedRouteIdx     = null;
    selectedCheckpointId = null;
    await initRoutesData();
    renderRouteList();
    draw();
    showToast('Данные сброшены');
  });
}

// --- Toast ---
function showToast(msg, duration = 1800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), duration);
}

// --- Confirm modal ---
let _confirmCallback = null;

function showConfirm(msg, onConfirm) {
  _confirmCallback = onConfirm;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-overlay').classList.add('open');
}

function confirmYes() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback?.();
  _confirmCallback = null;
}

function confirmNo() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback = null;
}

// --- Keyboard shortcuts ---
window.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

  if (e.key === 'Escape') { cancelAddCheckpointMode?.(); }
  if (e.key === '1') setMode('tl');
  if (e.key === '2') setMode('pan');
  if (e.key === 'm' || e.key === 'M') toggleMap();

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null && activeContext === 'tl') {
    confirmRemoveTL(selectedIdx);
    e.preventDefault();
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneIdx !== null && activeContext === 'zones') {
    const z = zones[selectedZoneIdx];
    if (z && !z.isGreenZone) {
      removeZone(selectedZoneIdx);
      e.preventDefault();
    }
  }
});

// --- Double-click: copy world coords ---
canvas.addEventListener('dblclick', e => {
  if (mode === 'zone-poly' && drawingZone && drawingZone.points.length >= 3) {
    drawingZone.points.pop();
    finishZone();
    return;
  }
  const w    = screenToWorld(e.offsetX, e.offsetY);
  const text = `${w.x.toFixed(4)}, ${w.y.toFixed(4)}, 0.0`;
  navigator.clipboard.writeText(text).then(() => showToast(`Скопировано: ${text}`));
});
