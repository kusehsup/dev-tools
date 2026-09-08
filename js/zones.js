// ============================================================
// ZONES — CRUD, drawing, green zones, persistence
// ============================================================

function zoneColorFor(i) { return ZONE_COLORS[i % ZONE_COLORS.length]; }

function territoryColorFor(kind) {
  return kind === TERRITORY_KIND_ZONE ? '#9b72e8' : '#26c6da';
}

function isUserZone(z) {
  return !z.isGreenZone && !z.isParkingZone && !z.isTerritoryZone;
}

function zoneBelongsToSubTab(z, tab) {
  if (tab === 'parking') return !!z.isParkingZone;
  if (tab === 'territory') return !!z.isTerritoryZone;
  return !z.isParkingZone && !z.isTerritoryZone;
}

function zoneSubTabOf(z) {
  if (z.isParkingZone) return 'parking';
  if (z.isTerritoryZone) return 'territory';
  return 'user';
}

function persistEditedZone(z) {
  if (!z || z.isGreenZone) return;
  if (z.isParkingZone) saveParkingZones();
  else if (z.isTerritoryZone) saveTerritoryZones();
  else saveUserZones();
}

function currentZoneDrawTarget() {
  if (zonesSubTab === 'parking') return 'parking';
  if (zonesSubTab === 'territory') return 'territory';
  return 'user';
}

// --- Drawing mode entry points (called from topbar buttons) ---
function startZonePoly() {
  startZoneDraw('poly', currentZoneDrawTarget());
}

function startZoneRect() {
  startZoneDraw('rect', currentZoneDrawTarget());
}

function startParkingZonePoly() {
  startZoneDraw('poly', 'parking');
}

function startParkingZoneRect() {
  startZoneDraw('rect', 'parking');
}

function startTerritoryZonePoly() {
  startZoneDraw('poly', 'territory');
}

function startTerritoryZoneRect() {
  startZoneDraw('rect', 'territory');
}

function startZoneDraw(type, target) {
  setMode(type === 'rect' ? 'zone-rect' : 'zone-poly');
  drawingZone = { type, points: [], target };
  switchTab('zones');
  if (zonesSubTab !== target) switchZonesSubTab(target);
  if (target === 'parking' && !parkingZonesLoaded) loadParkingZones();
  if (target === 'territory' && !territoryZonesLoaded) loadTerritoryZones();
  setInfo(type === 'rect'
    ? 'Прямоугольник: зажми ЛКМ и тяни'
    : 'Полигон: ЛКМ — точка, ПКМ или двойной клик — замкнуть');
}

function finishZone() {
  if (!drawingZone) return;
  const z = drawingZone;
  drawingZone = null;
  if (z.type === 'poly' && z.points.length < 3) { setMode('pan'); draw(); return; }
  if (z.type === 'rect' && z.points.length < 2) { setMode('pan'); draw(); return; }

  const target = z.target || currentZoneDrawTarget();
  const isParking = target === 'parking';
  const isTerritory = target === 'territory';
  const parkingCount = zones.filter(x => x.isParkingZone).length;
  const userCount = zones.filter(isUserZone).length;

  let points = z.points;
  let type = z.type;
  if (isTerritory && type === 'rect' && points.length >= 2) {
    const poly = zonePointsAsPoly({ type: 'rect', points });
    points = poly;
    type = 'poly';
  }

  const zone = {
    type,
    name: isParking ? `Парковка ${parkingCount + 1}` : `Зона ${userCount + 1}`,
    color: isParking ? '#ff9800' : zoneColorFor(userCount),
    points,
    closed: true,
  };
  if (isParking) {
    zone.isParkingZone = true;
    zone.parkingId = `custom-${Date.now()}`;
  }
  if (isTerritory) {
    const kind = territoryFilter === 'zone' ? TERRITORY_KIND_ZONE : TERRITORY_KIND_CITY;
    const count = zones.filter(x => x.isTerritoryZone && x.territoryKind === kind).length;
    zone.isTerritoryZone = true;
    zone.territoryKind = kind;
    zone.territoryType = defaultTerritoryType(kind);
    zone.territoryId = `custom-${Date.now()}`;
    zone.extra = 0;
    zone.color = territoryColorFor(kind);
    zone.name = kind === TERRITORY_KIND_ZONE ? `Район ${count + 1}` : `Город ${count + 1}`;
  }

  zones.push(zone);
  selectedZoneIdx = zones.length - 1;
  setMode('pan');
  persistEditedZone(zone);
  renderZoneList();
  draw();
  showToast(isParking ? 'Зона парковщика создана' : isTerritory
    ? (zone.territoryKind === TERRITORY_KIND_ZONE ? 'Район создан' : 'Город создан')
    : 'Зона создана');
}

function removeZone(i) {
  const z = zones[i];
  if (!z || z.isGreenZone) return;

  const doRemove = () => {
    const idx = zones.indexOf(z);
    if (idx < 0) return;
    zones.splice(idx, 1);
    if (selectedZoneIdx >= zones.length) selectedZoneIdx = zones.length - 1;
    persistEditedZone(z);
    renderZoneList();
    draw();
  };

  if (z.isTerritoryZone) {
    showConfirm(`Удалить территорию «${z.name}»?`, doRemove);
    return;
  }
  doRemove();
}

// --- Persistence ---
function saveUserZones() {
  const toSave = zones.filter(isUserZone);
  try { localStorage.setItem(STORAGE.ZONES, JSON.stringify(toSave)); } catch {}
}

function loadUserZones() {
  try {
    const raw = localStorage.getItem(STORAGE.ZONES);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveParkingZones() {
  const toSave = zones
    .filter(z => z.isParkingZone)
    .map(z => ({
      parkingId: z.parkingId ?? null,
      name: z.name,
      color: z.color || '#ff9800',
      type: z.type || 'poly',
      points: z.points,
    }));
  try { localStorage.setItem(STORAGE.PARKING, JSON.stringify(toSave)); } catch {}
}

function loadSavedParkingZones() {
  try {
    const raw = localStorage.getItem(STORAGE.PARKING);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

function parkingZonesFromBuiltin() {
  return PARKING_ZONES_DATA.map((pz, idx) => ({
    type: 'poly',
    name: pz.name,
    color: '#ff9800',
    points: flatCoordsToPoints(pz.coords),
    closed: true,
    isParkingZone: true,
    parkingId: `builtin-${idx}`,
  })).filter(z => z.points.length >= 3);
}

// --- Sidebar list ---
function switchZonesSubTab(tab) {
  zonesSubTab = tab;
  document.getElementById('zones-subtab-user')?.classList.toggle('active', tab === 'user');
  document.getElementById('zones-subtab-parking')?.classList.toggle('active', tab === 'parking');
  document.getElementById('zones-subtab-territory')?.classList.toggle('active', tab === 'territory');
  const footerUser = document.getElementById('zones-footer-user');
  const footerPark = document.getElementById('zones-footer-parking');
  const footerTerr = document.getElementById('zones-footer-territory');
  const terrToolbar = document.getElementById('territory-toolbar');
  if (footerUser) footerUser.style.display = tab === 'user' ? '' : 'none';
  if (footerPark) footerPark.style.display = tab === 'parking' ? '' : 'none';
  if (footerTerr) footerTerr.style.display = tab === 'territory' ? '' : 'none';
  if (terrToolbar) terrToolbar.style.display = tab === 'territory' ? '' : 'none';

  if (tab === 'parking' && !parkingZonesLoaded) {
    loadParkingZones();
  }
  if (tab === 'territory' && !territoryZonesLoaded) {
    loadTerritoryZones();
  }

  const visible = zones
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => zoneBelongsToSubTab(z, tab) && territoryCardVisible(z));
  if (visible.length && (selectedZoneIdx === null || !visible.some(v => v.i === selectedZoneIdx))) {
    selectedZoneIdx = visible[0].i;
  }

  renderZoneList();
  draw();
}

function setTerritoryFilter(filter) {
  territoryFilter = filter;
  ['all', 'city', 'zone'].forEach(f => {
    document.getElementById(`territory-filter-${f}`)?.classList.toggle('active', f === filter);
  });
  renderZoneList();
  draw();
}

function setTerritorySearch(q) {
  territorySearch = q;
  renderZoneList();
}

function territoryCardVisible(z) {
  if (!z.isTerritoryZone) return true;
  if (territoryFilter !== 'all' && z.territoryKind !== territoryFilter) return false;
  const q = (territorySearch || '').trim().toLowerCase();
  if (q && !String(z.name || '').toLowerCase().includes(q)) return false;
  return true;
}

function renderZoneList() {
  const el = document.getElementById('zone-list');
  el.innerHTML = '';

  const tab = zonesSubTab;
  const showParking = tab === 'parking';
  const showTerritory = tab === 'territory';

  zones.forEach((z, i) => {
    if (!zoneBelongsToSubTab(z, tab)) return;
    if (showTerritory && !territoryCardVisible(z)) return;

    const card    = document.createElement('div');
    card.className = 'zone-card' + (i === selectedZoneIdx ? ' selected' : '');
    card.dataset.zoneIdx = String(i);

    const pts  = z.points;
    const hasPts = pts.length > 0;
    const xs   = hasPts ? pts.map(p => p.x) : [0];
    const ys   = hasPts ? pts.map(p => p.y) : [0];
    const xmin = Math.min(...xs).toFixed(2), xmax = Math.max(...xs).toFixed(2);
    const ymin = Math.min(...ys).toFixed(2), ymax = Math.max(...ys).toFixed(2);
    const ptCount = z.type === 'rect' ? 4 : pts.length;

    let gzExtra = '';
    if (z.isGreenZone) {
      const gz    = GREEN_ZONES_DATA.find(g => g.dbId === z.dbId);
      let zRange  = '';
      if (gz) {
        try { const arr = JSON.parse(gz.polygon_points); if (arr?.[0]) zRange = `Z: ${arr[0][0]}..${arr[0][1]} | `; } catch {}
      }
      gzExtra = `
        <div class="zone-card-meta" style="color:#88cc88">${zRange}ID: ${z.dbId}</div>
        <div class="gz-fields">
          <div class="field">
            <span class="field-label">Вирт. мир</span>
            <input class="field-input" type="number" min="0" value="${z.virtualWorld ?? 0}"
              onchange="zones[${i}].virtualWorld=parseInt(this.value)||0" onclick="event.stopPropagation()">
          </div>
          <div class="gz-checkboxes">
            <label class="gz-check-label">
              <input type="checkbox" ${z.noCollision ? 'checked' : ''} onchange="zones[${i}].noCollision=this.checked?1:0" onclick="event.stopPropagation()">
              Нет коллизии
            </label>
            <label class="gz-check-label">
              <input type="checkbox" ${z.noKnife ? 'checked' : ''} onchange="zones[${i}].noKnife=this.checked?1:0" onclick="event.stopPropagation()">
              Нет ножа
            </label>
            <label class="gz-check-label">
              <input type="checkbox" ${z.isActive ? 'checked' : ''} onchange="zones[${i}].isActive=this.checked?1:0" onclick="event.stopPropagation()">
              Активна
            </label>
          </div>
        </div>`;
    }

    const canEdit = !z.isGreenZone;
    const persistFn = z.isParkingZone ? 'saveParkingZones()' : z.isTerritoryZone ? 'saveTerritoryZones()' : 'saveUserZones()';
    const swatches = canEdit && !z.isTerritoryZone ? ZONE_COLORS.map(c =>
      `<div class="color-swatch ${z.color === c ? 'active' : ''}" style="background:${c}"
         onclick="zones[${i}].color='${c}';${persistFn};renderZoneList();draw()"></div>`
    ).join('') : '';

    const removeBtn = canEdit
      ? `<button class="btn-remove" onclick="event.stopPropagation();removeZone(${i})">✕</button>`
      : '';

    const nameInput = canEdit
      ? `<input class="field-input" type="text" value="${escapeHtmlAttr(z.name)}"
        onchange="zones[${i}].name=this.value; ${persistFn}; renderZoneList();"
        onclick="event.stopPropagation()">`
      : '';

    let extraFields = '';
    if (z.isTerritoryZone) {
      const kind = z.territoryKind === TERRITORY_KIND_ZONE ? 'zone' : 'city';
      const types = kind === 'zone' ? TERRITORY_ZONE_TYPES : TERRITORY_CITY_TYPES;
      const typeOpts = types.map(t =>
        `<option value="${t}" ${z.territoryType === t ? 'selected' : ''}>${t}</option>`
      ).join('');
      extraFields = `
        <div class="tl-card-row">
          <div class="field">
            <span class="field-label">Тип зоны</span>
            <select class="field-input" onchange="setTerritoryKind(${i}, this.value)" onclick="event.stopPropagation()">
              <option value="${TERRITORY_KIND_CITY}" ${kind === 'city' ? 'selected' : ''}>Город</option>
              <option value="${TERRITORY_KIND_ZONE}" ${kind === 'zone' ? 'selected' : ''}>Улица / район</option>
            </select>
          </div>
          <div class="field">
            <span class="field-label">Константа</span>
            <select class="field-input" onchange="setTerritoryType(${i}, this.value)" onclick="event.stopPropagation()">
              ${typeOpts}
            </select>
          </div>
        </div>
        <button class="zone-export-btn" onclick="event.stopPropagation();focusZone(${i})">На карте</button>`;
    }

    const exportBtns = z.isParkingZone
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportZone(${i},'poly')">Poly</button>
        <button class="zone-export-btn" onclick="exportZone(${i},'rect')">AABB</button>
      </div>`
      : z.isTerritoryZone
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportSingleTerritory(${i})">zones.txt</button>
      </div>`
      : `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportZone(${i},'rect')">AABB</button>
        <button class="zone-export-btn" onclick="exportZone(${i},'poly')">Poly</button>
        <button class="zone-export-btn btn-green" onclick="exportGreenZoneSQL(${i})">SQL INSERT</button>
      </div>`;

    const kindBadge = z.isTerritoryZone
      ? `<span class="territory-kind-badge ${z.territoryKind === TERRITORY_KIND_ZONE ? 'zone' : 'city'}">${
          z.territoryKind === TERRITORY_KIND_ZONE ? 'район' : 'город'
        }</span>`
      : '';

    const bounds = hasPts
      ? `<div class="zone-card-meta">X: ${xmin} .. ${xmax}</div>
         <div class="zone-card-meta">Y: ${ymin} .. ${ymax}</div>`
      : `<div class="zone-card-meta">Нет точек — нарисуй полигон</div>`;

    card.innerHTML = `
      <div class="zone-card-header">
        <div class="zone-card-title">
          <div class="zone-color-dot" style="background:${z.color}"></div>
          <span>${escapeHtmlAttr(z.name)}</span>
          ${kindBadge}
        </div>
        ${removeBtn}
      </div>
      <div class="zone-card-meta">${z.type === 'rect' ? 'Прямоугольник' : `Полигон · ${ptCount} вершин`}</div>
      ${gzExtra}
      ${bounds}
      ${nameInput}
      ${extraFields}
      ${swatches ? `<div class="color-swatch-row">${swatches}</div>` : ''}
      ${exportBtns}`;

    card.addEventListener('mousedown', e => {
      const tag = e.target.tagName;
      if (!['INPUT','BUTTON','SELECT'].includes(tag)) {
        selectedZoneIdx = i;
        renderZoneList();
        scrollToZone(i);
        draw();
      }
    });
    card.addEventListener('dblclick', e => {
      const tag = e.target.tagName;
      if (!['INPUT','BUTTON','SELECT'].includes(tag)) {
        focusZone(i);
      }
    });

    el.appendChild(card);
  });

  if (!el.children.length) {
    const empty = document.createElement('div');
    empty.className = 'zone-card-meta';
    empty.style.padding = '8px';
    empty.textContent = showParking
      ? (parkingZonesLoaded ? 'Нет зон парковщика — нарисуй полигон' : 'Нажми «Показать на карте»')
      : showTerritory
      ? (territoryZonesLoaded ? 'Нет территорий — нарисуй полигон или сбрось к исходным' : 'Нажми «Показать на карте»')
      : 'Нет своих зон — нарисуй полигон или прямоугольник';
    el.appendChild(empty);
  }
}

function scrollToZone(i) {
  const cards = document.getElementById('zone-list').querySelectorAll('.zone-card');
  for (const card of cards) {
    if (Number(card.dataset.zoneIdx) === i) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
  }
}

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Hit testing ---
function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function hitTestZone(wx, wy) {
  const hitOne = (predicate) => {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (predicate && !predicate(z)) continue;
      const pts = z.points;
      if (pts.length === 0) continue;
      if (z.type === 'rect' && pts.length >= 2) {
        const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
        const y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y);
        if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) return i;
      } else if (pointInPolygon(wx, wy, pts)) {
        return i;
      }
    }
    return -1;
  };
  const primary = hitOne(z => zoneBelongsToSubTab(z, zonesSubTab));
  if (primary >= 0) return primary;
  return hitOne(null);
}

// --- Canvas drawing ---
function drawZones() {
  zones.forEach((z, i) => {
    const pts = z.points;
    if (pts.length === 0) return;
    const sel = i === selectedZoneIdx;
    const col = z.color;

    ctx.save();
    ctx.globalAlpha = sel ? 0.22 : 0.12;
    ctx.fillStyle   = col;
    ctx.beginPath();

    if (z.type === 'rect' && pts.length >= 2) {
      const sA = worldToScreen(pts[0].x, pts[0].y);
      const sB = worldToScreen(pts[1].x, pts[1].y);
      ctx.rect(
        Math.min(sA.x, sB.x), Math.min(sA.y, sB.y),
        Math.abs(sB.x - sA.x), Math.abs(sB.y - sA.y)
      );
    } else {
      const s0 = worldToScreen(pts[0].x, pts[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let j = 1; j < pts.length; j++) {
        const s = worldToScreen(pts[j].x, pts[j].y);
        ctx.lineTo(s.x, s.y);
      }
      if (z.closed) ctx.closePath();
    }

    ctx.fill();
    ctx.globalAlpha  = sel ? 1 : 0.65;
    ctx.strokeStyle  = col;
    ctx.lineWidth    = sel ? 2 : 1.5;
    ctx.setLineDash(z.closed ? [] : [5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Vertex dots
    pts.forEach(p => {
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(s.x, s.y, sel ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    });

    // Label at centroid
    const showLabel = sel || !z.isTerritoryZone || viewScale >= 0.18;
    if (showLabel) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const sc = worldToScreen(cx, cy);
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillStyle   = '#fff';
      ctx.font        = `bold ${sel ? 12 : 10}px monospace`;
      ctx.fillText(z.name, sc.x + 4, sc.y - 4);
      ctx.shadowBlur  = 0;
    }
  });

  // In-progress zone preview
  if (drawingZone && drawingZone.points.length > 0) {
    const pts = drawingZone.points;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const s0 = worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(s0.x, s0.y);
    pts.slice(1).forEach(p => { const s = worldToScreen(p.x, p.y); ctx.lineTo(s.x, s.y); });
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(p => {
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }
}

// --- Green zones ---
function toggleGreenZones() {
  const btn = document.getElementById('btn-green-zones');
  if (greenZonesLoaded) {
    zones = zones.filter(z => !z.isGreenZone);
    greenZonesLoaded = false;
    btn.classList.remove('btn-green');
    showToast('GreenZones скрыты');
  } else {
    GREEN_ZONES_DATA.forEach(gz => {
      const pts = parseGreenZonePoints(gz.polygon_points);
      if (pts.length < 2) return;
      zones.push({
        type: 'poly', name: gz.name, color: '#3db76a',
        points: pts, closed: true, isGreenZone: true, dbId: gz.id,
        virtualWorld: gz.vw  ?? 0,
        noCollision:  gz.nc  ?? 0,
        noKnife:      gz.nk  ?? 1,
        isActive:     gz.act ?? 1,
      });
    });
    greenZonesLoaded = true;
    btn.classList.add('btn-green');
    showToast(`Загружено ${GREEN_ZONES_DATA.length} GreenZones`);
  }
  renderZoneList();
  draw();
}

function parseGreenZonePoints(raw) {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length < 2) return [];
    const coords = arr[1];
    const pts    = [];
    for (let i = 0; i < coords.length - 1; i += 2) {
      const x = parseFloat(coords[i]), y = parseFloat(coords[i + 1]);
      if (!isNaN(x) && !isNaN(y)) pts.push({ x, y });
    }
    return pts;
  } catch { return []; }
}

// --- Parking zones (non-parking / valet restriction polygons) ---
function flatCoordsToPoints(coords) {
  const pts = [];
  for (let i = 0; i < coords.length - 1; i += 2) {
    const x = coords[i], y = coords[i + 1];
    if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
      pts.push({ x, y });
    }
  }
  return pts;
}

function loadParkingZones() {
  if (parkingZonesLoaded) return;

  const saved = loadSavedParkingZones();
  const list = saved
    ? saved.map((z, idx) => ({
        type: z.type || 'poly',
        name: z.name || `Парковка ${idx + 1}`,
        color: z.color || '#ff9800',
        points: Array.isArray(z.points) ? z.points : [],
        closed: true,
        isParkingZone: true,
        parkingId: z.parkingId ?? `saved-${idx}`,
      })).filter(z => z.points.length >= 2)
    : parkingZonesFromBuiltin();

  list.forEach(z => zones.push(z));
  parkingZonesLoaded = true;

  // Persist builtin snapshot on first load so edits stick
  if (!saved) saveParkingZones();

  const btn = document.getElementById('btn-parking-zones');
  if (btn) {
    btn.classList.add('btn-green');
    btn.classList.remove('btn-yellow');
    btn.textContent = 'Скрыть с карты';
  }
}

function unloadParkingZones() {
  if (parkingZonesLoaded) saveParkingZones();
  zones = zones.filter(z => !z.isParkingZone);
  parkingZonesLoaded = false;
  if (selectedZoneIdx !== null && selectedZoneIdx >= zones.length) {
    selectedZoneIdx = zones.length ? zones.length - 1 : null;
  }
  const btn = document.getElementById('btn-parking-zones');
  if (btn) {
    btn.classList.remove('btn-green');
    btn.classList.add('btn-yellow');
    btn.textContent = 'Показать на карте';
  }
}

function toggleParkingZones() {
  if (parkingZonesLoaded) {
    unloadParkingZones();
    showToast('Зоны парковщика скрыты');
  } else {
    loadParkingZones();
    const n = zones.filter(z => z.isParkingZone).length;
    showToast(`Загружено ${n} зон парковщика`);
  }
  renderZoneList();
  draw();
}

function resetParkingZones() {
  showConfirm('Сбросить зоны парковщика к исходным из .pwn?', () => {
    try { localStorage.removeItem(STORAGE.PARKING); } catch {}
    zones = zones.filter(z => !z.isParkingZone);
    parkingZonesLoaded = false;
    loadParkingZones();
    renderZoneList();
    draw();
    showToast('Зоны парковщика сброшены');
  });
}

function saveTerritoryZones() {
  const toSave = zones
    .filter(z => z.isTerritoryZone)
    .map(z => ({
      territoryId: z.territoryId ?? null,
      name: z.name,
      color: z.color,
      type: z.type || 'poly',
      points: z.points,
      territoryKind: z.territoryKind || territoryKindFromType(z.territoryType),
      territoryType: z.territoryType || defaultTerritoryType(z.territoryKind),
      extra: z.extra || 0,
    }));
  try { localStorage.setItem(STORAGE.TERRITORY, JSON.stringify(toSave)); } catch {}
}

function loadSavedTerritoryZones() {
  try {
    const raw = localStorage.getItem(STORAGE.TERRITORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

function territoryZonesFromBuiltin() {
  const from = (list, kind) => (list || []).map((tz, idx) => ({
    type: 'poly',
    name: tz.name,
    color: territoryColorFor(kind),
    points: flatCoordsToPoints(tz.coords || []),
    closed: true,
    isTerritoryZone: true,
    territoryKind: kind,
    territoryType: tz.type || defaultTerritoryType(kind),
    territoryId: `builtin-${kind}-${idx}`,
    extra: 0,
  }));
  return [
    ...from(TERRITORY_ZONES_DATA.cities, TERRITORY_KIND_CITY),
    ...from(TERRITORY_ZONES_DATA.streets, TERRITORY_KIND_ZONE),
  ];
}

function hydrateTerritoryZone(z, idx) {
  const rawType = z.territoryType || z.typeName || z.type;
  const kind = z.territoryKind
    || territoryKindFromType(rawType)
    || TERRITORY_KIND_CITY;
  const geomType = (z.type === 'rect' || z.type === 'poly') ? z.type : 'poly';
  const typeName = (typeof rawType === 'string' && (rawType.startsWith('CITY_') || rawType.startsWith('ZONE_')))
    ? rawType
    : defaultTerritoryType(kind);
  return {
    type: geomType,
    name: z.name || `Территория ${idx + 1}`,
    color: z.color || territoryColorFor(kind),
    points: Array.isArray(z.points) ? z.points : flatCoordsToPoints(z.coords || []),
    closed: true,
    isTerritoryZone: true,
    territoryKind: kind === TERRITORY_KIND_ZONE ? TERRITORY_KIND_ZONE : TERRITORY_KIND_CITY,
    territoryType: typeName,
    territoryId: z.territoryId ?? `saved-${idx}`,
    extra: z.extra || 0,
  };
}

function loadTerritoryZones() {
  if (territoryZonesLoaded) return;

  const saved = loadSavedTerritoryZones();
  const list = saved
    ? saved.map(hydrateTerritoryZone)
    : territoryZonesFromBuiltin();

  list.forEach(z => zones.push(z));
  territoryZonesLoaded = true;

  if (!saved) saveTerritoryZones();

  const btn = document.getElementById('btn-territory-zones');
  if (btn) {
    btn.classList.add('btn-green');
    btn.classList.remove('btn-yellow');
    btn.textContent = 'Скрыть с карты';
  }
}

function unloadTerritoryZones() {
  if (territoryZonesLoaded) saveTerritoryZones();
  zones = zones.filter(z => !z.isTerritoryZone);
  territoryZonesLoaded = false;
  if (selectedZoneIdx !== null && selectedZoneIdx >= zones.length) {
    selectedZoneIdx = zones.length ? zones.length - 1 : null;
  }
  const btn = document.getElementById('btn-territory-zones');
  if (btn) {
    btn.classList.remove('btn-green');
    btn.classList.add('btn-yellow');
    btn.textContent = 'Показать на карте';
  }
}

function toggleTerritoryZones() {
  if (territoryZonesLoaded) {
    unloadTerritoryZones();
    showToast('Территории скрыты');
  } else {
    loadTerritoryZones();
    const n = zones.filter(z => z.isTerritoryZone).length;
    showToast(`Загружено ${n} территорий`);
  }
  renderZoneList();
  draw();
}

function resetTerritoryZones() {
  showConfirm('Сбросить территории к исходным из zones.txt?', () => {
    try { localStorage.removeItem(STORAGE.TERRITORY); } catch {}
    zones = zones.filter(z => !z.isTerritoryZone);
    territoryZonesLoaded = false;
    loadTerritoryZones();
    renderZoneList();
    draw();
    showToast('Территории сброшены');
  });
}

function setTerritoryKind(i, kind) {
  const z = zones[i];
  if (!z?.isTerritoryZone) return;
  z.territoryKind = kind === TERRITORY_KIND_ZONE ? TERRITORY_KIND_ZONE : TERRITORY_KIND_CITY;
  z.territoryType = defaultTerritoryType(z.territoryKind);
  z.color = territoryColorFor(z.territoryKind);
  saveTerritoryZones();
  renderZoneList();
  draw();
}

function setTerritoryType(i, type) {
  const z = zones[i];
  if (!z?.isTerritoryZone) return;
  z.territoryType = type;
  z.territoryKind = territoryKindFromType(type);
  z.color = territoryColorFor(z.territoryKind);
  saveTerritoryZones();
  renderZoneList();
  draw();
}

function focusZone(i) {
  const z = zones[i];
  if (!z?.points?.length) {
    selectedZoneIdx = i;
    renderZoneList();
    draw();
    return;
  }
  const xs = z.points.map(p => p.x);
  const ys = z.points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.18 || 400;
  const padY = (maxY - minY) * 0.18 || 400;
  const scaleX = canvas.width  / (maxX - minX + padX * 2);
  const scaleY = canvas.height / (maxY - minY + padY * 2);
  viewScale = Math.max(0.05, Math.min(20, Math.min(scaleX, scaleY)));
  viewX = (minX + maxX) / 2 - canvas.width  / 2 / viewScale;
  viewY = (minY + maxY) / 2 + canvas.height / 2 / viewScale;
  selectedZoneIdx = i;
  renderZoneList();
  scrollToZone(i);
  draw();
}

function collectTerritoryExportLists() {
  let list;
  if (territoryZonesLoaded) {
    list = zones.filter(z => z.isTerritoryZone);
  } else {
    const saved = loadSavedTerritoryZones();
    list = saved
      ? saved.map(hydrateTerritoryZone)
      : territoryZonesFromBuiltin();
  }
  const toEntry = z => ({
    type: z.territoryType || defaultTerritoryType(z.territoryKind),
    name: z.name,
    points: zonePointsAsPoly(z),
    extra: z.extra || 0,
    kind: z.territoryKind,
  });
  return {
    cities: list.filter(z => z.territoryKind !== TERRITORY_KIND_ZONE).map(toEntry),
    streets: list.filter(z => z.territoryKind === TERRITORY_KIND_ZONE).map(toEntry),
  };
}

function applyTerritoryImport(parsed) {
  const cities = (parsed.cities || []).map((z, idx) => hydrateTerritoryZone({
    ...z,
    territoryKind: TERRITORY_KIND_CITY,
    territoryType: z.type,
    territoryId: `import-city-${idx}`,
    color: territoryColorFor(TERRITORY_KIND_CITY),
  }, idx));
  const streets = (parsed.streets || []).map((z, idx) => hydrateTerritoryZone({
    ...z,
    territoryKind: TERRITORY_KIND_ZONE,
    territoryType: z.type,
    territoryId: `import-zone-${idx}`,
    color: territoryColorFor(TERRITORY_KIND_ZONE),
  }, idx));

  zones = zones.filter(z => !z.isTerritoryZone);
  [...cities, ...streets].forEach(z => zones.push(z));
  territoryZonesLoaded = true;
  saveTerritoryZones();

  const btn = document.getElementById('btn-territory-zones');
  if (btn) {
    btn.classList.add('btn-green');
    btn.classList.remove('btn-yellow');
    btn.textContent = 'Скрыть с карты';
  }

  selectedZoneIdx = zones.findIndex(z => z.isTerritoryZone);
  if (selectedZoneIdx < 0) selectedZoneIdx = null;
  switchZonesSubTab('territory');
}

function hitTestEditableZoneVertex(ex, ey, radius = 8) {
  if (activeContext !== 'zones') return null;
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.isGreenZone) continue;
    if (!zoneBelongsToSubTab(z, zonesSubTab)) continue;
    for (let j = 0; j < z.points.length; j++) {
      const s = worldToScreen(z.points[j].x, z.points[j].y);
      if (Math.hypot(ex - s.x, ey - s.y) <= radius) {
        return { zoneIdx: i, pointIdx: j };
      }
    }
  }
  return null;
}

// Green zones source data (assigned to state variable declared in state.js)
GREEN_ZONES_DATA = [
  {id:1,  name:'Порт Южный',            vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"-5\", \"30\"], [\"2814.0315\", \"-2312.2717\", \"2814.0491\", \"-2542.0476\", \"2829.7705\", \"-2550.9019\", \"2812.4851\", \"-2633.8582\", \"2893.9636\", \"-2631.9868\", \"2893.6890\", \"-2313.0100\"]]'},
  {id:2,  name:'Правительство',         vw:0,nc:0,nk:1,act:1, polygon_points:'[[ \"10\", \"90\"], [\"-2392.7529\", \"1740.5081\", \"-2383.9485\", \"1724.5370\", \"-2336.8997\", \"1639.4496\", \"-2270.7302\", \"1531.3129\", \"-2266.0366\", \"1510.6851\", \"-2616.6123\", \"1374.1699\", \"-2634.1245\", \"1376.0776\", \"-2722.2317\", \"1430.7474\", \"-2722.4084\", \"1449.4369\", \"-2715.7742\", \"1489.3845\", \"-2675.4429\", \"1668.8395\", \"-2648.6116\", \"1791.1567\", \"-2637.3691\", \"1845.1698\", \"-2627.4316\", \"1892.6213\", \"-2621.1663\", \"1894.4647\", \"-2609.4736\", \"1887.7561\", \"-2549.0442\", \"1851.4005\", \"-2525.6682\", \"1836.8550\", \"-2486.0266\", \"1811.2915\", \"-2443.5979\", \"1780.2185\", \"-2402.3245\", \"1749.9985\"]]'},
  {id:3,  name:'Б/У рынок средний',     vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"15\", \"70\"], [\"2779.7764\", \"-2403.9614\", \"2759.9512\", \"-2403.9382\", \"2759.9585\", \"-2399.8765\", \"2734.0532\", \"-2398.2805\", \"2670.1160\", \"-2397.8801\", \"2670.2400\", \"-2500.4834\", \"2780.4470\", \"-2500.5239\"]]'},
  {id:4,  name:'Аэропорт Южный',        vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"70\"], [\"2699.9805\", \"-1988.8275\", \"2700.0994\", \"-2132.2427\", \"2799.9482\", \"-2132.8921\", \"2808.6777\", \"-2131.8652\", \"2815.7690\", \"-2129.0454\", \"2825.2888\", \"-2121.6243\", \"2829.5259\", \"-2116.3022\", \"2832.5066\", \"-2109.0400\", \"2834.1660\", \"-2095.6987\", \"2834.1797\", \"-2060.6089\", \"2833.0107\", \"-1984.8599\"]]'},
  {id:5,  name:'Спил пружин',           vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"40\"], [\"2416.0330\", \"-2044.5814\", \"2415.5015\", \"-1999.7610\", \"2450.0044\", \"-1999.4169\", \"2449.8442\", \"-2044.3513\"]]'},
  {id:6,  name:'Контейнеры',            vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"-10\", \"50\"], [\"-2041.9690\", \"2950.3198\", \"-1698.7546\", \"2950.4072\", \"-1698.6796\", \"2925.9919\", \"-1663.9325\", \"2922.0479\", \"-1630.6311\", \"2923.1172\", \"-1630.6672\", \"2909.5354\", \"-1663.9163\", \"2908.5129\", \"-1698.8547\", \"2886.0239\", \"-1735.6268\", \"2852.1719\", \"-1793.3403\", \"2814.8718\", \"-1796.6349\", \"2812.7273\", \"-1842.1505\", \"2779.3279\", \"-1892.0358\", \"2773.3293\", \"-1989.6923\", \"2770.1401\", \"-2040.9653\", \"2758.7424\", \"-2120.3633\", \"2752.6665\", \"-2125.6238\", \"2772.8213\", \"-2136.4453\", \"2770.9541\", \"-2238.9685\", \"2809.1724\", \"-2239.9705\", \"2855.5320\", \"-2213.3564\", \"2886.6309\", \"-2112.7227\", \"2972.4529\", \"-2079.1599\", \"2984.1155\"]]'},
  {id:8,  name:'ТРК Ритм',              vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"15\", \"30\"], [\"2100.01\", \"-1928.76\", \"2105.28\", \"-1921.29\", \"2111.46\", \"-1914.43\", \"2118.48\", \"-1908.45\", \"2126.08\", \"-1903.46\", \"2134.10\", \"-1899.58\", \"2142.97\", \"-1896.59\", \"2151.77\", \"-1894.95\", \"2160.27\", \"-1894.34\", \"2168.67\", \"-1894.78\", \"2177.88\", \"-1896.27\", \"2186.48\", \"-1898.96\", \"2194.78\", \"-1902.76\", \"2202.42\", \"-1907.52\", \"2209.67\", \"-1913.49\", \"2215.78\", \"-1920.01\", \"2221.00\", \"-1927.40\", \"2225.44\", \"-1935.61\", \"2228.62\", \"-1943.74\", \"2230.79\", \"-1952.77\", \"2231.85\", \"-1962.07\", \"2231.68\", \"-1971.04\", \"2230.43\", \"-1979.96\", \"2227.89\", \"-1989.02\", \"2224.34\", \"-1997.42\", \"2219.71\", \"-2005.22\", \"2214.05\", \"-2012.49\", \"2207.70\", \"-2018.77\", \"2200.42\", \"-2024.42\", \"2192.37\", \"-2029.07\", \"2184.12\", \"-2032.53\", \"2175.05\", \"-2034.99\", \"2166.29\", \"-2036.23\", \"2157.12\", \"-2036.33\", \"2147.96\", \"-2035.27\", \"2139.09\", \"-2033.00\", \"2130.49\", \"-2029.60\", \"2122.63\", \"-2025.17\", \"2115.33\", \"-2019.92\", \"2108.56\", \"-2013.48\", \"2102.84\", \"-2006.35\", \"2097.96\", \"-1998.46\", \"2094.23\", \"-1989.92\", \"2091.79\", \"-1981.53\", \"2090.23\", \"-1972.53\", \"2089.84\", \"-1963.57\", \"2090.75\", \"-1954.40\", \"2092.60\", \"-1945.38\", \"2095.81\", \"-1936.76\"]]'},
  {id:9,  name:'СТО Южный',             vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"5\", \"50\"], [\"2195.0527\", \"-1859.9048\", \"2115.5823\", \"-1860.1373\", \"2115.7578\", \"-1767.9833\", \"2120.0188\", \"-1764.3969\", \"2167.9998\", \"-1764.1417\", \"2168.1938\", \"-1815.3088\", \"2195.3770\", \"-1815.3079\"]]'},
  {id:10, name:'Шахта',                 vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"15\", \"70\"], [\"-522.9742\", \"3265.4888\", \"-522.4121\", \"3367.4219\", \"-521.0449\", \"3370.7449\", \"-518.6544\", \"3373.3135\", \"-509.9706\", \"3375.0298\", \"-510.7637\", \"3424.8960\", \"-508.3861\", \"3439.4668\", \"-501.7440\", \"3459.5574\", \"-490.1945\", \"3471.8950\", \"-474.8000\", \"3478.2222\", \"-450.6331\", \"3483.5259\", \"-429.1187\", \"3481.3152\", \"-421.9447\", \"3480.0945\", \"-415.8596\", \"3477.4321\", \"-405.8070\", \"3468.1848\", \"-392.0000\", \"3446.7183\", \"-371.6076\", \"3425.8499\", \"-338.5894\", \"3403.3757\", \"-333.3502\", \"3376.0410\", \"-334.8993\", \"3255.1392\", \"-387.9969\", \"3252.7686\", \"-467.0186\", \"3260.3447\", \"-507.1653\", \"3264.6384\"]]'},
  {id:11, name:'Б/У рынок высокий',     vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"160\", \"210\"], [\"-1936.8258\", \"1851.8945\", \"-1853.5138\", \"1851.4159\", \"-1853.0630\", \"1950.9658\", \"-1920.6252\", \"1950.9634\", \"-1921.5146\", \"1913.3915\", \"-1927.4702\", \"1910.6274\", \"-1934.2220\", \"1905.1487\", \"-1936.7540\", \"1899.7399\", \"-1937.4728\", \"1891.4833\"]]'},
  {id:12, name:'Аукцион гос.',          vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"70\"], [\"2315.0559\", \"-2141.2986\", \"2245.7012\", \"-2140.9558\", \"2246.0771\", \"-2090.2651\", \"2246.7166\", \"-2084.6123\", \"2248.0859\", \"-2077.2883\", \"2251.0107\", \"-2066.2856\", \"2252.0203\", \"-2064.1011\", \"2315.0552\", \"-2063.6040\"]]'},
  {id:13, name:'Банк рубль Южный',      vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"40\"], [\"2352.0178\", \"-1886.3176\", \"2351.9978\", \"-1926.1860\", \"2397.4807\", \"-1925.6478\", \"2397.0334\", \"-1886.0271\"]]'},
  {id:14, name:'МЧС',                   vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"40\", \"80\"], [\"-2617.3938\", \"2107.5198\", \"-2602.1169\", \"2110.8550\", \"-2542.8472\", \"2110.7729\", \"-2542.2126\", \"2193.9172\", \"-2613.1360\", \"2194.1821\"]]'},
  {id:15, name:'Вокзал Южный',          vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"70\"], [\"2450.4841\", \"-1946.9349\", \"2584.3862\", \"-1946.8784\", \"2584.4543\", \"-2207.9751\", \"2505.6147\", \"-2207.6299\", \"2505.9375\", \"-2145.1616\", \"2450.2529\", \"-2144.1248\"]]'},
  {id:16, name:'СТО Лыткарино + ДЦ',   vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"-5\", \"30\"], [\"-2480.0647\", \"1161.9908\", \"-2493.3057\", \"1122.3856\", \"-2474.2168\", \"1111.0010\", \"-2487.1968\", \"1076.0392\", \"-2506.0303\", \"1078.5652\", \"-2525.0161\", \"1053.4374\", \"-2528.2444\", \"1052.0487\", \"-2563.7092\", \"1066.6682\", \"-2551.7012\", \"1102.7206\", \"-2564.6033\", \"1107.7179\", \"-2539.5356\", \"1184.0800\"]]'},
  {id:17, name:'Больница Южный',        vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"40\"], [\"2370.3472\", \"-2634.4397\", \"2405.6558\", \"-2634.1416\", \"2405.4214\", \"-2622.4495\", \"2433.3555\", \"-2622.0688\", \"2433.5784\", \"-2633.8708\", \"2440.2678\", \"-2634.0439\", \"2440.2917\", \"-2674.3718\", \"2369.8374\", \"-2674.0930\"]]'},
  {id:18, name:'Ж/Д депо Южный',       vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"1\", \"50\"], [\"2069.7290\", \"-2576.2209\", \"2069.8889\", \"-2675.1165\", \"1948.3903\", \"-2675.2393\", \"1947.7819\", \"-2615.1802\", \"1947.4178\", \"-2596.5305\", \"1960.4788\", \"-2596.0991\", \"1960.5614\", \"-2576.1296\"]]'},
  {id:19, name:'Вокзал Лыткарино',     vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"1\", \"50\"], [\"-2705.1594\", \"248.0854\", \"-2639.7327\", \"248.0827\", \"-2642.2700\", \"33.2245\", \"-2704.3892\", \"34.1262\"]]'},
  {id:20, name:'Мото-вело салон',       vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"50\"], [\"-2256.8530\", \"224.9767\", \"-2221.8218\", \"220.0905\", \"-2204.8958\", \"220.2931\", \"-2238.8264\", \"295.8535\", \"-2248.6606\", \"298.0597\"]]'},
  {id:21, name:'Лесопилка',             vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"70\"], [\"251.7881\", \"-2535.1204\", \"269.8453\", \"-2538.3669\", \"288.3864\", \"-2542.9951\", \"298.1043\", \"-2547.6814\", \"308.1919\", \"-2554.9036\", \"318.3210\", \"-2564.6807\", \"328.5292\", \"-2576.3474\", \"338.5833\", \"-2589.9067\", \"452.5799\", \"-2547.3752\", \"526.7233\", \"-2532.5383\", \"594.1588\", \"-2511.0935\", \"626.9564\", \"-2378.4854\", \"602.3503\", \"-2305.4785\", \"557.3418\", \"-2234.6455\", \"329.4354\", \"-2276.4316\", \"246.0983\", \"-2336.8513\"]]'},
  {id:22, name:'ТК Лыткарино',         vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"1\", \"50\"], [\"-2448.0186\", \"-113.6787\", \"-2480.9612\", \"-104.4696\", \"-2496.4619\", \"-100.8836\", \"-2511.5720\", \"-97.1228\", \"-2566.6641\", \"-84.9852\", \"-2539.2595\", \"39.1432\", \"-2417.6628\", \"11.3507\"]]'},
  {id:23, name:'Казино Лыткарино',     vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"10\", \"60\"], [\"-2226.1785\", \"-366.1205\", \"-2218.1047\", \"-367.9714\", \"-2150.0029\", \"-380.7805\", \"-2125.4685\", \"-260.5503\", \"-2245.7119\", \"-237.2057\", \"-2255.7478\", \"-242.4361\", \"-2262.9507\", \"-253.2647\", \"-2269.8352\", \"-266.3986\", \"-2280.2212\", \"-280.3176\", \"-2271.3425\", \"-309.4836\", \"-2265.6399\", \"-325.2711\", \"-2256.5667\", \"-342.8273\", \"-2248.6829\", \"-352.6756\", \"-2235.9976\", \"-362.2202\"]]'},
  {id:24, name:'Вокзал Бусаево',       vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"35\", \"60\"], [\"-424.2861\", \"-1625.8473\", \"-413.5081\", \"-1579.5734\", \"-330.6677\", \"-1597.3547\", \"-338.6523\", \"-1644.1552\"]]'},
  {id:25, name:'Свалка',               vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"-10\", \"70\"], [\"-2686.6743\", \"-1441.8846\", \"-2733.8179\", \"-1460.7689\", \"-2759.9504\", \"-1467.5776\", \"-2783.7595\", \"-1466.6644\", \"-2789.8921\", \"-1463.1622\", \"-2793.6746\", \"-1457.2567\", \"-2859.4529\", \"-1430.9719\", \"-2869.3911\", \"-1388.6134\", \"-2868.3872\", \"-1296.6339\", \"-2836.4143\", \"-1247.8116\", \"-2839.5332\", \"-1238.5479\", \"-2839.7097\", \"-1230.4760\", \"-2836.0513\", \"-1224.3999\", \"-2816.3772\", \"-1213.7510\", \"-2799.9290\", \"-1209.3970\", \"-2778.6199\", \"-1207.7360\", \"-2746.9885\", \"-1239.2622\", \"-2709.3887\", \"-1271.6841\", \"-2647.1069\", \"-1306.0992\", \"-2664.6377\", \"-1344.3823\", \"-2671.7002\", \"-1371.4281\", \"-2672.4971\", \"-1395.5571\", \"-2670.8364\", \"-1410.2827\", \"-2663.5256\", \"-1434.2965\"]]'},
  {id:53, name:'МВД',                  vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"5\", \"70\"], [\"286.4189\", \"1308.1681\", \"139.6908\", \"1334.2694\", \"164.8841\", \"1459.2072\", \"168.8723\", \"1462.3457\", \"298.3286\", \"1439.7601\"]]'},
  {id:57, name:'МГУ',                  vw:0,nc:0,nk:1,act:1, polygon_points:'[[\"1\", \"70\"], [\"-394.1451\", \"958.6591\", \"-454.8730\", \"958.1932\", \"-464.8858\", \"956.5681\", \"-484.3713\", \"950.4603\", \"-514.3404\", \"935.5814\", \"-529.0270\", \"926.3038\", \"-550.3430\", \"908.9161\", \"-580.9953\", \"878.7190\", \"-585.3035\", \"872.5998\", \"-591.6221\", \"860.1027\", \"-600.3128\", \"840.3896\", \"-602.5370\", \"833.1769\", \"-604.1050\", \"825.1536\", \"-604.7034\", \"817.2832\", \"-604.6069\", \"745.2744\", \"-603.6569\", \"729.4842\", \"-598.9410\", \"714.9366\", \"-595.2520\", \"707.6455\", \"-585.6808\", \"696.1052\", \"-571.1025\", \"683.2515\", \"-548.8177\", \"667.9250\", \"-529.7858\", \"657.1483\", \"-515.0722\", \"650.9133\", \"-489.9442\", \"643.7751\", \"-446.8277\", \"635.6053\", \"-410.5041\", \"629.0676\", \"-400.1750\", \"633.2591\", \"-393.9438\", \"649.8342\"]]'},
];

// Parking zones source data (g_non_parking_zones_polygons)
PARKING_ZONES_DATA = [
  { name: 'Авторынок Б/У Эконом', coords: [
    2242.6379, 2277.9790,
    2150.4001, 2278.9805,
    2156.3337, 2392.8704,
    2244.6858, 2392.0940
  ]},
  { name: 'Авторынок Б/У Средний', coords: [
    2783.6667, -2500.1704,
    2783.6670, -2400.7434,
    2669.4836, -2398.6404,
    2669.5388, -2500.4834
  ]},
  { name: 'Авторынок Б/У Высокий', coords: [
    -1937.0215, 1851.4623,
    -1938.1586, 1951.5461,
    -1852.0161, 1951.9148,
    -1850.7682, 1848.7898
  ]},
  { name: 'метро', coords: [
    -337.6263, 539.8821,
    -357.5138, 378.5102,
    -361.3528, 357.1685,
    -367.6477, 337.5071,
    -391.8593, 275.1174,
    -407.4734, 274.6549,
    -446.7741, 269.8144,
    -524.2680, 277.9562,
    -519.2934, 361.9388,
    -469.9326, 454.8492,
    -429.6274, 501.9769,
    -397.4389, 572.4329,
    -349.5918, 555.8160
  ]},
  { name: 'штрафстоянка Арзамас', coords: [
    -289.6605, 1144.3442,
    -255.9216, 1145.0795,
    -257.6350, 1058.3234,
    -291.8097, 1059.0660
  ]},
  { name: 'штрафстоянка Южный', coords: [
    2480.1741, -2340.5918,
    2521.7881, -2341.0635,
    2524.3726, -2343.5693,
    2556.5466, -2343.4460,
    2555.5981, -2373.3020,
    2480.3203, -2374.0142
  ]},
  { name: 'казино 1', coords: [
    -2226.1785, -366.1205,
    -2218.1047, -367.9714,
    -2150.0029, -380.7805,
    -2125.4685, -260.5503,
    -2245.7119, -237.2057,
    -2255.7478, -242.4361,
    -2262.9507, -253.2647,
    -2269.8352, -266.3986,
    -2280.2212, -280.3176,
    -2271.3425, -309.4836,
    -2265.6399, -325.2711,
    -2256.5667, -342.8273,
    -2248.6829, -352.6756,
    -2235.9976, -362.2202
  ]},
  { name: 'казино 2', coords: [
    1859.7693, -1955.6532,
    1954.3069, -2010.7458,
    2002.2424, -1937.6625,
    2008.8175, -1911.9038,
    2005.3776, -1893.9844,
    1903.9470, -1830.5428,
    1880.3049, -1868.4330,
    1900.8580, -1882.4064
  ]},
  { name: 'аукцион', coords: [
    2315.0559, -2141.2986,
    2245.7012, -2140.9558,
    2246.0771, -2090.2651,
    2246.7166, -2084.6123,
    2248.0859, -2077.2883,
    2251.0107, -2066.2856,
    2252.0203, -2064.1011,
    2315.0552, -2063.6040
  ]},
  { name: 'Торговый центр LAKA', coords: [
    3081.9617, -423.6501,
    3084.2944, -440.4438,
    3088.1357, -454.1054,
    3092.8938, -466.2269,
    3098.5632, -478.5918,
    3105.3906, -489.8092,
    3189.3364, -592.1854,
    3196.9412, -597.5005,
    3206.2542, -600.2491,
    3224.4497, -600.7014,
    3237.8267, -596.0013,
    3245.7473, -588.7659,
    3392.4727, -588.1243,
    3408.1650, -586.2593,
    3422.9744, -571.9846,
    3429.2878, -552.8539,
    3429.3701, -482.1421,
    3434.1577, -461.9891,
    3445.1106, -445.2748,
    3467.3745, -434.8493,
    3483.8164, -419.7426,
    3490.2859, -403.0190,
    3495.8137, -365.8937,
    3495.8557, -58.0489,
    3490.9844, -35.8739,
    3478.5535, -18.7979,
    3463.9019, -9.4079,
    3396.8647, 13.1992,
    3375.4797, 32.7571,
    3365.6077, 50.2111,
    3327.8562, 77.3572,
    3288.7710, 101.5955,
    3266.8408, 103.3412,
    3249.6970, 90.7497,
    3199.0964, -17.7697,
    3190.9238, -28.3651,
    3177.6365, -32.9854,
    3082.6409, -32.3592
  ]},
  { name: 'контейнеры', coords: [
    -2041.9690, 2950.3198,
    -1698.7546, 2950.4072,
    -1698.6796, 2925.9919,
    -1663.9325, 2922.0479,
    -1630.6311, 2923.1172,
    -1630.6672, 2909.5354,
    -1663.9163, 2908.5129,
    -1698.8547, 2886.0239,
    -1735.6268, 2852.1719,
    -1793.3403, 2814.8718,
    -1796.6349, 2812.7273,
    -1842.1505, 2779.3279,
    -1892.0358, 2773.3293,
    -1989.6923, 2770.1401,
    -2040.9653, 2758.7424,
    -2120.3633, 2752.6665,
    -2125.6238, 2772.8213,
    -2136.4453, 2770.9541,
    -2238.9685, 2809.1724,
    -2239.9705, 2855.5320,
    -2213.3564, 2886.6309,
    -2112.7227, 2972.4529,
    -2079.1599, 2984.1155
  ]},
  { name: 'свалка', coords: [
    -2642.6907, -1299.0508,
    -2662.6116, -1345.8445,
    -2666.7319, -1360.4161,
    -2669.5474, -1377.7845,
    -2669.2341, -1396.6670,
    -2666.4993, -1415.3308,
    -2658.5918, -1439.9241,
    -2653.3347, -1451.9879,
    -2793.9741, -1484.5455,
    -2859.8662, -1429.0936,
    -2878.0168, -1396.7058,
    -2869.5063, -1157.8546,
    -2781.6555, -1188.2118,
    -2738.5161, -1242.2664,
    -2718.0203, -1259.4401,
    -2696.7622, -1273.8009
  ]},
  { name: 'МВД', coords: [
    286.4189, 1308.1681,
    139.6908, 1334.2694,
    164.8841, 1459.2072,
    168.8723, 1462.3457,
    298.3286, 1439.7601
  ]},
  { name: 'АТП', coords: [
    741.9332, 724.9286,
    783.0435, 832.3724,
    854.8361, 803.9562,
    814.2949, 697.1718
  ]},
  { name: 'Салон лодок', coords: [
    2614.7971, -3400.4941,
    2641.4326, -3376.2053,
    2664.9661, -3354.8040,
    2676.0100, -3349.2937,
    2713.0000, -3446.3997,
    2625.0967, -3475.6758
  ]},
  { name: 'Автосалон Эконом', coords: [
    2535.4063, -672.6910,
    2535.3516, -584.2025,
    2608.4736, -583.5535,
    2611.7117, -671.5554
  ]},
  { name: 'Автосалон Средний', coords: [
    452.6597, 831.8651,
    425.1724, 755.9537,
    403.9298, 763.8171,
    395.9128, 740.8690,
    343.5440, 761.0326,
    379.3584, 858.7601
  ]},
  { name: 'Автосалон Высокий', coords: [
    1821.8701, 2787.2754,
    1821.6909, 2852.2820,
    1863.4722, 2853.0269,
    1842.5575, 2933.1653,
    1921.5298, 2932.2246,
    1900.4943, 2851.9700,
    1921.1272, 2852.1409,
    1920.8914, 2786.8467
  ]},
  { name: 'дорожные службы', coords: [
    289.3134, 457.9608,
    319.5355, 446.4451,
    296.6149, 380.8919,
    264.0455, 392.1270
  ]},
  { name: 'СТО Южного (египт сила)', coords: [
    2195.0527, -1859.9048,
    2115.5823, -1860.1373,
    2115.7578, -1767.9833,
    2120.0188, -1764.3969,
    2167.9998, -1764.1417,
    2168.1938, -1815.3088,
    2195.3770, -1815.3079
  ]},
  { name: 'Локация DBD', coords: [
    3377.7817, 2097.5825,
    3467.1062, 2098.6001,
    3547.0598, 2181.5962,
    3591.1138, 2342.0808,
    3606.1907, 2458.0750,
    3426.4890, 2478.2417,
    3410.8281, 2467.9480,
    3338.4270, 2306.5640,
    3284.1553, 2137.1804,
    3291.0947, 2097.9626
  ]},
  { name: 'зимняя дрифт трасса', coords: [
    -2554.0271, 2936.8708,
    -2552.2043, 2957.8650,
    -2559.1660, 2968.8188,
    -2683.4993, 3004.2061,
    -2447.8398, 3307.9265,
    -2240.9819, 3315.4209,
    -2205.8462, 3272.7781,
    -2230.1926, 3106.9656,
    -2369.7124, 2968.1272,
    -2533.8721, 2968.4653,
    -2537.8816, 2937.4768
  ]},
  { name: 'жк возле кремля', coords: [
    -2516.0820, 1894.3020,
    -2503.1431, 1891.2393,
    -2296.3628, 1893.4298,
    -2285.2324, 1894.6040,
    -2275.0605, 1898.3528,
    -2265.1143, 1904.0168,
    -2256.8223, 1911.0205,
    -2228.5903, 1942.8820,
    -2220.5759, 1955.8369,
    -2213.6501, 1973.4946,
    -2210.5500, 1990.1765,
    -2205.2517, 2106.9143,
    -2206.6472, 2119.7393,
    -2210.4746, 2133.0981,
    -2216.3423, 2145.0266,
    -2232.5361, 2166.3511,
    -2240.4656, 2195.0237,
    -2244.3865, 2202.6987,
    -2249.9573, 2209.2004,
    -2390.1614, 2335.1611,
    -2419.0652, 2331.1477,
    -2523.0786, 2215.9290,
    -2531.4668, 2200.9717,
    -2534.0532, 2189.7600,
    -2534.7195, 1922.3329,
    -2532.0664, 1910.6688,
    -2547.2073, 1889.4771,
    -2528.6628, 1876.9220
  ]},
  { name: 'ЖК возле МГУ с паркингами', coords: [
    -464.3831, 571.9395,
    -458.8052, 584.3615,
    -458.3477, 596.8936,
    -445.6187, 591.8521,
    -452.7186, 574.6255,
    -455.9468, 575.2947,
    -457.5635, 572.3038
  ]},
  { name: 'территория ВЧ', coords: [
    1294.1644, 3207.1104,
    1168.7590, 3207.1182,
    1148.3492, 3203.9824,
    1106.2762, 3201.3232,
    1035.9845, 3200.1934,
    1024.9871, 3200.8467,
    1024.9863, 3216.0847,
    1026.9922, 3232.0259,
    1027.8988, 3260.9795,
    1044.9802, 3261.1394,
    1046.0677, 3265.6169,
    1050.2550, 3265.8401,
    1050.1066, 3284.5610,
    1046.0876, 3285.8796,
    1046.0876, 3405.8892,
    1048.2733, 3408.0735,
    1293.0231, 3408.0706,
    1307.4708, 3399.2666,
    1306.4552, 3302.0781,
    1295.4594, 3286.0161,
    1286.4310, 3285.2949,
    1286.2239, 3264.1506,
    1294.5188, 3263.7705
  ]},
  { name: 'КПП возле ВЧ', coords: [
    1295.0204, 3207.1970,
    1295.3342, 3264.7659,
    1287.0801, 3264.8608,
    1287.0800, 3284.5308,
    1295.9655, 3285.2649,
    1307.2358, 3301.7163,
    1308.3167, 3399.4434,
    1325.6804, 3398.9888,
    1326.3228, 3366.1069,
    1337.4030, 3348.5549,
    1391.2838, 3347.9260,
    1392.9408, 3304.7629,
    1401.7880, 3275.7678,
    1423.7903, 3257.7224,
    1422.6218, 3245.0122,
    1382.5746, 3249.5144,
    1372.3979, 3246.9868,
    1374.4751, 3207.1970
  ]},
  { name: 'особняк Лыткарино', coords: [
    -3180.6641, 776.8323,
    -3180.7200, 861.4794,
    -3230.7246, 910.8880,
    -3343.7512, 901.7947,
    -3327.8018, 774.6332
  ]},
  { name: 'особняк Гарель', coords: [
    1895.2853, -47.2447,
    1981.0829, -49.4508,
    2028.5505, -2.0941,
    2028.9979, 80.1185,
    1972.1670, 122.5470,
    1892.4935, 121.3759
  ]},
  { name: 'особняк Барвиха', coords: [
    3976.2988, 3809.7249,
    4053.3398, 3728.9778,
    4162.4116, 3785.4929,
    4115.8423, 3876.1523,
    4009.1309, 3884.8323
  ]},
  { name: 'особняк Пэла', coords: [
    2274.8733, 1450.2456,
    2418.7107, 1450.4846,
    2417.6895, 1577.8999,
    2277.8469, 1576.8868
  ]},
  { name: 'парк с аттракционами', coords: [
    157.1068, 1998.4791,
    156.5673, 1806.2550,
    -57.4168, 1787.7615,
    -61.9918, 1966.5096
  ]},
  { name: 'Электрик парковщик', coords: [
    1796.6589, 2466.2786,
    1772.2852, 2500.2814,
    1782.8170, 2507.2024,
    1778.8049, 2512.9197,
    1762.6560, 2501.2845,
    1751.6227, 2521.1446,
    1751.7230, 2529.7706,
    1754.1302, 2533.9834,
    1782.9173, 2552.5395,
    1792.2456, 2557.8556,
    1812.7075, 2527.5640,
    1831.0630, 2540.9043,
    1856.2392, 2506.3999
  ]},
];
