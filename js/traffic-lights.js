// ============================================================
// TRAFFIC LIGHTS — CRUD, persistence, sidebar list, canvas draw
// ============================================================

// --- Factory ---
function makeTL(x, y) {
  return {
    x, y,
    rotZ: 0,
    status: 'RED',
    areaX1: x - 20, areaY1: y - 20,
    areaX2: x + 20, areaY2: y + 20,
    angleHalf: 115,
    turnThreshold: 0,
    modelId: 1351, greenTime: 15, redTime: 15,
    posZ: 0, rotX: 0, rotY: 0,
  };
}

function addTrafficLight(sx, sy) {
  const w = (sx !== undefined)
    ? screenToWorld(sx, sy)
    : screenToWorld(canvas.width / 2, canvas.height / 2);
  trafficLights.push(makeTL(w.x, w.y));
  selectedIdx = trafficLights.length - 1;
  renderTLList();
  draw();
  saveTLState();
}

function removeTL(i) {
  trafficLights.splice(i, 1);
  if (selectedIdx >= trafficLights.length) selectedIdx = trafficLights.length - 1;
  renderTLList();
  draw();
  saveTLState();
}

function updateTL(i, key, value) {
  trafficLights[i][key] = (key === 'status') ? value : parseFloat(value);
  renderTLList();
  draw();
  saveTLState();
}

// --- Persistence ---
function saveTLState() {
  try { localStorage.setItem(STORAGE.TL_LIST, JSON.stringify(trafficLights)); } catch {}
  tlShowingDefault = false;
  updateTLButtons();
}

function hasSavedTLState() {
  return !!localStorage.getItem(STORAGE.TL_LIST);
}

function loadSavedTLState() {
  try {
    const raw = localStorage.getItem(STORAGE.TL_LIST);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

// --- Save/default toggle button logic ---
function updateTLButtons() {
  const btnSave  = document.getElementById('btn-tl-saved');
  const btnClear = document.getElementById('btn-tl-clear');
  if (!btnSave) return;

  if (!hasSavedTLState()) {
    btnSave.textContent = '💾 Сохранить';
    btnSave.className   = 'btn btn-yellow';
    btnClear.style.display = 'none';
  } else if (tlShowingDefault) {
    btnSave.textContent = '↩ Вернуть сохранённое';
    btnSave.className   = 'btn btn-blue';
    btnClear.style.display = '';
  } else {
    btnSave.textContent = '👁 Показать дефолт';
    btnSave.className   = 'btn btn-green';
    btnClear.style.display = '';
  }
}

function onTLSaveBtnClick() {
  if (!hasSavedTLState()) {
    saveTLState();
    showToast('Светофоры сохранены');
    return;
  }
  if (tlShowingDefault) {
    const saved = loadSavedTLState();
    if (saved) {
      trafficLights = saved;
      renderTLList();
      draw();
    }
    tlShowingDefault = false;
    _defaultTLSnap   = null;
    updateTLButtons();
    return;
  }
  _defaultTLSnap = trafficLights;
  trafficLights  = buildDefaultTLs();
  renderTLList();
  draw();
  tlShowingDefault = true;
  updateTLButtons();
  showToast('Показаны дефолтные значения');
}

function onTLClearBtnClick() {
  showConfirm(
    'Удалить сохранённые светофоры из localStorage? Останутся только дефолтные значения.',
    () => {
      localStorage.removeItem(STORAGE.TL_LIST);
      tlShowingDefault = false;
      _defaultTLSnap   = null;
      trafficLights    = buildDefaultTLs();
      renderTLList();
      draw();
      updateTLButtons();
      showToast('Сохранённые данные удалены');
    }
  );
}

// --- Sidebar list ---
function renderTLList() {
  const el = document.getElementById('tl-list');
  el.innerHTML = '';

  trafficLights.forEach((tl, i) => {
    const col   = COLORS[tl.status] || '#aaa';
    const label = STATUS_LABEL[tl.status] || tl.status;
    const card  = document.createElement('div');
    card.className = 'tl-card' + (i === selectedIdx ? ' selected' : '');

    card.innerHTML = `
      <div class="tl-card-header">
        <span class="tl-card-title">TL #${i}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="tl-status-badge" style="background:${col}22;color:${col};border:1px solid ${col}44">${label}</span>
          <button class="btn-remove" onclick="event.stopPropagation();confirmRemoveTL(${i})">✕</button>
        </div>
      </div>

      <div class="tl-card-row">
        <div class="field">
          <span class="field-label">X</span>
          <input class="field-input" type="number" value="${tl.x.toFixed(1)}" step="1"
            onchange="updateTL(${i},'x',this.value)">
        </div>
        <div class="field">
          <span class="field-label">Y</span>
          <input class="field-input" type="number" value="${tl.y.toFixed(1)}" step="1"
            onchange="updateTL(${i},'y',this.value)">
        </div>
        <div class="field">
          <span class="field-label">ROT Z°</span>
          <input class="field-input" type="number" value="${tl.rotZ}" step="5"
            onchange="updateTL(${i},'rotZ',this.value)">
        </div>
      </div>

      <div class="tl-card-row">
        <div class="field" style="flex:2">
          <span class="field-label">Статус</span>
          <select class="field-input" onchange="updateTL(${i},'status',this.value)">
            ${['GREEN','YELLOW','RED','YELLOW_RED'].map(s =>
              `<option value="${s}" ${tl.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <span class="field-label">Half°</span>
          <input class="field-input" type="number" value="${tl.angleHalf}" step="5"
            onchange="updateTL(${i},'angleHalf',this.value)">
        </div>
      </div>

      <div class="tl-card-row">
        <div class="field">
          <span class="field-label">Area X1</span>
          <input class="field-input" type="number" value="${tl.areaX1.toFixed(2)}" step="1"
            onchange="updateTL(${i},'areaX1',this.value)">
        </div>
        <div class="field">
          <span class="field-label">Area Y1</span>
          <input class="field-input" type="number" value="${tl.areaY1.toFixed(2)}" step="1"
            onchange="updateTL(${i},'areaY1',this.value)">
        </div>
      </div>

      <div class="tl-card-row">
        <div class="field">
          <span class="field-label">Area X2</span>
          <input class="field-input" type="number" value="${tl.areaX2.toFixed(2)}" step="1"
            onchange="updateTL(${i},'areaX2',this.value)">
        </div>
        <div class="field">
          <span class="field-label">Area Y2</span>
          <input class="field-input" type="number" value="${tl.areaY2.toFixed(2)}" step="1"
            onchange="updateTL(${i},'areaY2',this.value)">
        </div>
      </div>

      <div class="tl-card-row">
        <div class="field">
          <span class="field-label">Turn thr°</span>
          <input class="field-input" type="number" value="${tl.turnThreshold}" step="5"
            onchange="updateTL(${i},'turnThreshold',this.value)">
        </div>
      </div>`;

    card.addEventListener('mousedown', e => {
      if (!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)) {
        selectedIdx = i;
        renderTLList();
        scrollToTL(i);
        draw();
      }
    });

    el.appendChild(card);
  });
}

function confirmRemoveTL(i) {
  showConfirm(
    `Удалить TL#${i} (${STATUS_LABEL[trafficLights[i]?.status] ?? ''})?`,
    () => removeTL(i)
  );
}

function scrollToTL(i) {
  const cards = document.getElementById('tl-list').querySelectorAll('.tl-card');
  cards[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// --- Zone corner drag ---
function applyZonePointDrag(tl, pointIdx, wx, wy) {
  if (pointIdx === 1) { tl.areaX1 = wx; tl.areaY1 = wy; }
  else                { tl.areaX2 = wx; tl.areaY2 = wy; }
}

function getZoneScreenPoints(tl) {
  return {
    p1: worldToScreen(tl.areaX1, tl.areaY1),
    p2: worldToScreen(tl.areaX2, tl.areaY2),
  };
}

function getZoneAABB(tl) {
  return {
    minX: Math.min(tl.areaX1, tl.areaX2),
    maxX: Math.max(tl.areaX1, tl.areaX2),
    minY: Math.min(tl.areaY1, tl.areaY2),
    maxY: Math.max(tl.areaY1, tl.areaY2),
  };
}

function pointInZone(px, py, tl) {
  const b = getZoneAABB(tl);
  return px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY;
}

function hitTestZonePoints(ex, ey) {
  const HIT_R = 8;
  for (let i = 0; i < trafficLights.length; i++) {
    if (!showZones) continue;
    const { p1, p2 } = getZoneScreenPoints(trafficLights[i]);
    if (Math.hypot(ex - p1.x, ey - p1.y) < HIT_R) return { tlIdx: i, point: 1 };
    if (Math.hypot(ex - p2.x, ey - p2.y) < HIT_R) return { tlIdx: i, point: 2 };
  }
  return null;
}

// --- Canvas drawing ---
function drawTL(tl, i) {
  const s   = worldToScreen(tl.x, tl.y);
  const sel = i === selectedIdx;
  const col = COLORS[tl.status] || '#aaa';

  // GTA angle to canvas angle:
  // GTA: 0=north, CW positive. Canvas: 0=east, CW positive (Y down).
  // canvas_angle = -rotZ * π/180 - π/2
  const gtaToCanvas = a => -a * Math.PI / 180 - Math.PI / 2;

  // --- Zone rectangle ---
  if (showZones) {
    const hasZone = !(tl.areaX1 === 0 && tl.areaY1 === 0 && tl.areaX2 === 0 && tl.areaY2 === 0);
    if (hasZone) {
      const pA = worldToScreen(tl.areaX1, tl.areaY1);
      const pB = worldToScreen(tl.areaX2, tl.areaY1);
      const pC = worldToScreen(tl.areaX2, tl.areaY2);
      const pD = worldToScreen(tl.areaX1, tl.areaY2);

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle   = col;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
      ctx.lineTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y);
      ctx.closePath(); ctx.fill();

      ctx.globalAlpha  = 0.55;
      ctx.strokeStyle  = col;
      ctx.lineWidth    = 1;
      ctx.stroke();
      ctx.restore();

      // Diagonal dashed P1→P2
      ctx.strokeStyle = col + '66';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pC.x, pC.y); ctx.stroke();
      ctx.setLineDash([]);

      // Corner handles
      [pA, pC].forEach((pt, j) => {
        const isDragging = draggingPoint?.tlIdx === i && draggingPoint?.point === j + 1;
        ctx.fillStyle    = isDragging ? '#fff' : '#ff6600';
        ctx.strokeStyle  = '#ff9944';
        ctx.lineWidth    = 1.5;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle  = '#fff';
        ctx.lineWidth    = 1.5;
        ctx.beginPath(); ctx.moveTo(pt.x - 3, pt.y); ctx.lineTo(pt.x + 3, pt.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y - 3); ctx.lineTo(pt.x, pt.y + 3); ctx.stroke();
        ctx.fillStyle    = '#ff9944';
        ctx.font         = '10px monospace';
        ctx.fillText(`P${j + 1}`, pt.x + 8, pt.y - 4);
      });
    }
  }

  // --- Angle arcs ---
  if (showAngles) {
    const r         = 45;
    const fineStart = gtaToCanvas(tl.rotZ + 180 + tl.angleHalf);
    const fineEnd   = gtaToCanvas(tl.rotZ + 180 - tl.angleHalf);

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle   = col;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.arc(s.x, s.y, r, fineStart, fineEnd, true);
    ctx.closePath();
    ctx.fill();

    if (tl.turnThreshold > 0) {
      ctx.globalAlpha = 0.42;
      const ts = gtaToCanvas(tl.rotZ + 180 + tl.turnThreshold);
      const te = gtaToCanvas(tl.rotZ + 180 - tl.turnThreshold);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, r, ts, te, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // "штраф" label at arc midpoint
    const midA = gtaToCanvas(tl.rotZ + 180);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle   = col;
    ctx.font        = '9px monospace';
    ctx.fillText('штраф', s.x + Math.cos(midA) * (r + 6), s.y + Math.sin(midA) * (r + 6));
    ctx.restore();

    // Front arrow
    const fa = gtaToCanvas(tl.rotZ);
    ctx.strokeStyle = 'rgba(255,255,0,0.5)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(fa) * 50, s.y + Math.sin(fa) * 50);
    ctx.stroke();
  }

  // --- Body ---
  ctx.fillStyle   = sel ? '#2a3a6a' : '#16162a';
  ctx.strokeStyle = sel ? '#5e6ad2' : '#2a2a4a';
  ctx.lineWidth   = sel ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();

  // Label
  ctx.shadowColor = '#000';
  ctx.shadowBlur  = 3;
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 11px monospace';
  ctx.fillText(`TL#${i}`, s.x + 12, s.y - 8);
  ctx.fillStyle   = 'rgba(200,220,255,0.85)';
  ctx.font        = '9px monospace';
  ctx.fillText(`${STATUS_LABEL[tl.status]}  R:${tl.rotZ}°`, s.x + 12, s.y + 5);
  ctx.shadowBlur  = 0;
}

// --- Default TL data ---
function parseTL(status, x, y, rotZ, ax1, ay1, ax2, ay2, ah, tt, modelId, gt, rt, posZ, rX, rY) {
  const hasZone = !(ax1 === 0 && ay1 === 0 && ax2 === 0 && ay2 === 0);
  return {
    x, y, rotZ, status,
    areaX1: hasZone ? ax1 : x - 15, areaY1: hasZone ? ay1 : y - 15,
    areaX2: hasZone ? ax2 : x + 15, areaY2: hasZone ? ay2 : y + 15,
    angleHalf: ah, turnThreshold: tt,
    modelId: modelId ?? 1351, greenTime: gt ?? 15, redTime: rt ?? 15,
    posZ: posZ ?? 0, rotX: rX ?? 0, rotY: rY ?? 0,
  };
}

function buildDefaultTLs() {
  const D = 115, T = 0;
  return [
    parseTL('GREEN',-2371.030029,2790.479980,0,-2367.25,2786.88,-2385.10,2799.20,D,T,1351,15,15,36.5,0,0),
    parseTL('GREEN',-388.107,983.678,-179.999984,-393.07,987.73,-354.89,975.76,D,T,1351,15,15,11.12,0,0),
    parseTL('RED',-397.59,961.706,-89.999870,-399.39,955.01,-383.30,988.11,D,T,1351,15,15,11.12,0,0),
    parseTL('GREEN',-363.540344,958.214355,0,-359.02,956.79,-398.31,966.45,D,T,1351,15,15,11.119999,0,0),
    parseTL('RED',-360.288,980.649,89.999870,-357.77,986.23,-369.27,953.53,D,T,1351,15,15,11.12,0,0),
    parseTL('GREEN',99.739997,535.130004,-109.619941,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('RED',121.139999,519.929992,-20.819883,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('GREEN',136.389999,540.710021,69.719970,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('RED',115.190002,556.280029,158.999984,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('GREEN',236.960006,801.750000,68.639923,0,0,0,0,D,T,1351,20,20,10.990,0,0),
    parseTL('RED',215.729995,816.969970,160.619979,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('GREEN',203.600006,794.940002,-110.819923,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('RED',221.779998,781.010009,-21.479911,0,0,0,0,D,T,1351,20,20,10.99,0,0),
    parseTL('GREEN',2295.32861,-1710.48389,0,0,0,0,0,D,T,1351,25,15,20.82959,0,0),
    parseTL('RED',2302.81323,-1684.68042,89.999870,0,0,0,0,D,T,1351,15,25,20.91260,0,0),
    parseTL('GREEN',2274.18506,-1679.40356,-179.999984,0,0,0,0,D,T,1351,25,15,20.91260,0,0),
    parseTL('GREEN',2584.41724,-2139.05981,-179.999984,0,0,0,0,D,T,1351,15,15,20.92969,0,0),
    parseTL('GREEN',2615.53345,-2170.82739,0,0,0,0,0,D,T,1351,15,15,20.92969,0,0),
    parseTL('RED',2620.83594,-2144.56445,89.999870,0,0,0,0,D,T,1351,15,15,20.92969,0,0),
    parseTL('RED',2303.40161,-1864.56812,90.000511,0,0,0,0,D,T,1351,15,15,20.824710,0,0),
    parseTL('GREEN',2274.45337,-1854.88940,-179.999984,0,0,0,0,D,T,1351,15,15,20.904790,0,0),
    parseTL('GREEN',2295.35962,-1895.24341,0,0,0,0,0,D,T,1351,15,15,20.88965,0,0),
    parseTL('GREEN',2295.34326,-1771.19849,0,0,0,0,0,D,T,1351,15,15,20.90527,0,0),
    parseTL('GREEN',2274.48242,-1734.84033,-179.999984,0,0,0,0,D,T,1351,15,15,20.91992,0,0),
    parseTL('RED',2264.88916,-1764.08337,-90.000511,0,0,0,0,D,T,1351,15,15,20.91699,0,0),
    parseTL('RED',2444.98950,-1885.46741,-90.000511,0,0,0,0,D,T,1351,15,15,20.93896,0,0),
    parseTL('GREEN',2475.41284,-1895.22424,0,0,0,0,0,D,T,1351,15,15,20.95215,0,0),
    parseTL('GREEN',2454.55176,-1854.84741,-179.999984,0,0,0,0,D,T,1351,15,15,20.93311,0,0),
    parseTL('GREEN',2475.34546,-2174.59595,0,0,0,0,0,D,T,1351,15,15,20.86475,0,0),
    parseTL('RED',2444.70996,-2165.42969,-90.000511,0,0,0,0,D,T,1351,15,15,20.78857,0,0),
    parseTL('GREEN',2454.45557,-2138.47754,-179.999984,0,0,0,0,D,T,1351,15,15,20.92236,0,0),
    parseTL('RED',2704.35009765625,-2140.68994140625,-179.999984,0,0,0,0,D,T,1351,15,15,21.0,0,0),
    parseTL('GREEN',2704.090087890625,-2165.5,-90.000511,0,0,0,0,D,T,1351,15,15,21.0,0,0),
    parseTL('GREEN',2731.8701171875,-2144.669921875,90.000511,0,0,0,0,D,T,1351,15,15,21.0,0,0),
    parseTL('GREEN',2224.58081,-2292.62061,-179.999984,0,0,0,0,D,T,1351,15,15,21.00391,0,0),
    parseTL('GREEN',2219.53857,-2335.52905,-90.000000,0,0,0,0,D,T,1351,15,15,21.01270,0,0),
    parseTL('RED',2250.95923,-2302.36475,90.000511,0,0,0,0,D,T,1351,15,15,20.94043,0,0),
    parseTL('RED',2245.60742,-2366.03784,0,0,0,0,0,D,T,1351,15,15,20.97119,0,0),
    parseTL('RED',316.097991,1672.469970,-95.000434,0,0,0,0,D,T,1350,10,25,11.0,0,0),
    parseTL('GREEN',345.74597,1660.49866,-4.000053,0,0,0,0,D,T,1350,25,10,11.11878,0,0),
    parseTL('GREEN',330.06952,1702.71667,158.000076,0,0,0,0,D,T,1350,25,10,11.10108,0,0),
    parseTL('GREEN',-2676.24,-69.5419,180.0,0,0,0,0,D,T,1350,25,10,10.1,0,0),
    parseTL('RED',-2647.83,-73.9783,90.0,0,0,0,0,D,T,1350,10,25,10.6394,0,0),
    parseTL('GREEN',-2651.16,-103.393,0.0,0,0,0,0,D,T,1350,25,10,10.322,0,0),
    parseTL('RED',-314.077,571.187,-6.0,0,0,0,0,D,T,1350,10,25,11.3132,0,0),
    parseTL('GREEN',-294.122,610.902,84.0,0,0,0,0,D,T,1350,25,10,11.1,0,0),
    parseTL('GREEN',-393.869,645.571,179.0,0,0,0,0,D,T,1350,25,10,11.2,0,0),
    parseTL('RED',-409.376,605.804,-96.0,0,0,0,0,D,T,1350,10,25,11.1,0,0),
    parseTL('GREEN',306.622619,1164.030029,84.066276,0,0,0,0,D,T,1350,25,10,11.152874,0,0),
    parseTL('RED',280.455993,1175.869506,174.218231,0,0,0,0,D,T,1350,10,25,11.169987,0,0),
    parseTL('RED',296.301666,1141.470825,-5.973437,0,0,0,0,D,T,1350,10,25,11.179988,0,0),
    parseTL('RED',2483.35034,-2319.48901,90.0,0,0,0,0,D,T,1350,10,25,20.81982,0,0),
    parseTL('GREEN',2475.34473,-2366.24292,0.0,0,0,0,0,D,T,1350,25,10,20.92285,0,0),
    parseTL('RED',2448.90283,-2355.82495,-90.0,0,0,0,0,D,T,1350,10,25,20.83667,0,0),
    parseTL('GREEN',2454.55859,-2292.29980,180.0,0,0,0,0,D,T,1350,25,10,20.88696,0,0),
    parseTL('RED',2224.51147,-2134.84912,-180.0,0,0,0,0,D,T,1350,25,10,20.91357,0,0),
    parseTL('GREEN',2255.05225,-2144.64941,90.0,0,0,0,0,D,T,1350,10,25,20.90625,0,0),
    parseTL('RED',2245.53174,-2175.23145,0.0,0,0,0,0,D,T,1350,10,25,20.88428,0,0),
  ];
}
