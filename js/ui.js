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

  const cursors = { pan: 'grab', tl: 'cell', cal: 'crosshair', spawn: 'copy' };
  canvas.style.cursor = cursors[m] || 'crosshair';

  document.getElementById('cal-panel').classList.toggle('open', m === 'cal');
}

// --- Tabs ---
function switchTab(t) {
  const tabs = ['tl', 'zones', 'log'];
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', tabs[i] === t));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', tabs[i] === t));

  const isTL    = t === 'tl'    || (t === 'log' && activeContext === 'tl');
  const isZones = t === 'zones' || (t === 'log' && activeContext === 'zones');

  // Show/hide mode buttons based on context
  ['mode-path','mode-tl','mode-spawn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isTL ? '' : 'none';
  });
  ['mode-zone-poly','mode-zone-rect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isZones ? '' : 'none';
  });

  // TL-only controls
  ['sep-sim','sep-sim2','btn-run','btn-stop','btn-reset',
   'lbl-speed','car-speed','sim-stats','tl-toggles'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isTL ? '' : 'none';
  });

  if (t === 'tl') {
    activeContext = 'tl';
    if (['zone-poly', 'zone-rect'].includes(mode)) setMode('path');
    drawingZone = null;
  } else if (t === 'zones') {
    activeContext = 'zones';
    if (['path', 'tl'].includes(mode)) setMode('pan');
    stopSimulation();
  }

  draw();
}

// --- Visibility toggles ---
function toggleMap()     { showMap    = !showMap;    document.getElementById('btn-map').classList.toggle('on', showMap);         draw(); }
function toggleZones()   { showZones  = !showZones;  document.getElementById('btn-zones').classList.toggle('on', showZones);     draw(); }
function toggleAngles()  { showAngles = !showAngles; document.getElementById('btn-angles').classList.toggle('on', showAngles);   draw(); }
function togglePathVis() { showPath   = !showPath;   document.getElementById('btn-path-vis').classList.toggle('on', showPath);   draw(); }

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

  if (e.key === '1') setMode('path');
  if (e.key === '2') setMode('tl');
  if (e.key === '3') setMode('pan');
  if (e.key === '4') setMode('spawn');
  if (e.key === 'm' || e.key === 'M') toggleMap();
  if (e.key === ' ')  { simRunning ? stopSimulation() : runSimulation(); e.preventDefault(); }
  if (e.key === 'c' && !e.ctrlKey) clearPath();

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
    confirmRemoveTL(selectedIdx);
    e.preventDefault();
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
