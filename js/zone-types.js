// ============================================================
// ZONE TYPES — registry so a new map-zone kind is one registerZoneType()
// ============================================================
//
// To add a type later:
//   1. registerZoneType({ id, label, matches, load, unload, save, create, ... })
//   2. Optionally add a data file and STORAGE key
// The tabs, footer, search, exclusive map loading and drawing all pick it up.

const ZONE_TYPES = Object.create(null);
const ZONE_TYPE_ORDER = [];

function registerZoneType(def) {
  if (!def?.id) throw new Error('registerZoneType: id required');
  ZONE_TYPES[def.id] = def;
  if (!ZONE_TYPE_ORDER.includes(def.id)) ZONE_TYPE_ORDER.push(def.id);
}

function getZoneType(id) {
  return ZONE_TYPES[id] || null;
}

function allZoneTypes() {
  return ZONE_TYPE_ORDER.map(id => ZONE_TYPES[id]).filter(Boolean);
}

function zoneKindOf(z) {
  if (!z) return 'user';
  if (z.kind && ZONE_TYPES[z.kind]) return z.kind;
  if (z.isGreenZone) return 'green';
  if (z.isParkingZone) return 'parking';
  if (z.isTerritoryZone) return 'territory';
  return 'user';
}

function zoneTypeOf(z) {
  return getZoneType(zoneKindOf(z));
}

function zoneMatchesType(z, id) {
  const t = getZoneType(id);
  if (t?.matches) return !!t.matches(z);
  return zoneKindOf(z) === id;
}

function currentZoneType() {
  return getZoneType(zonesSubTab) || getZoneType('user');
}

function tagZoneKind(z, id) {
  z.kind = id;
  return z;
}

function drawingPointsForType(drawing, asPoly) {
  let points = drawing.points || [];
  let type = drawing.type;
  if (asPoly && type === 'rect' && points.length >= 2) {
    points = zonePointsAsPoly({ type: 'rect', points });
    type = 'poly';
  }
  return { points, type };
}

function initZoneTypes() {
  ZONE_TYPE_ORDER.length = 0;
  for (const k of Object.keys(ZONE_TYPES)) delete ZONE_TYPES[k];

  registerZoneType({
    id: 'user',
    label: 'Свои',
    canDraw: true,
    canEdit: true,
    canDelete: true,
    showSwatches: true,
    matches: z => zoneKindOf(z) === 'user',
    loaded: () => userZonesLoaded,
    load: loadUserZonesOntoMap,
    unload: unloadUserZones,
    save: saveUserZones,
    create(drawing) {
      const n = zones.filter(isUserZone).length;
      const { points, type } = drawingPointsForType(drawing, false);
      return tagZoneKind({
        type, name: `Зона ${n + 1}`, color: zoneColorFor(n),
        points, closed: true,
      }, 'user');
    },
    createdToast: () => 'Зона создана',
    emptyText: () => 'Нет своих зон — нарисуй полигон или прямоугольник',
    footer() {
      return `
        <button class="btn btn-green" onclick="startZonePoly()">+ Полигон</button>
        <button class="btn btn-green" onclick="startZoneRect()">+ Rect</button>
        <button class="btn btn-blue" onclick="exportAllZones()">Экспорт всех</button>
        <button class="btn btn-blue" onclick="exportAllZonesPwn()">Экспорт .pwn</button>`;
    },
    exportButtons: i => `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportZone(${i},'rect')">AABB</button>
        <button class="zone-export-btn" onclick="exportZone(${i},'poly')">Poly</button>
      </div>`,
  });

  registerZoneType({
    id: 'green',
    label: 'GreenZones',
    canDraw: true,
    canEdit: true,
    canDelete: true,
    showSwatches: false,
    matches: z => zoneKindOf(z) === 'green',
    loaded: () => greenZonesLoaded,
    load: loadGreenZones,
    unload: unloadGreenZones,
    save: saveGreenZones,
    reset: resetGreenZones,
    create(drawing) {
      const n = zones.filter(z => zoneKindOf(z) === 'green').length;
      const { points, type } = drawingPointsForType(drawing, true);
      return tagZoneKind({
        type, name: `GreenZone ${n + 1}`, color: '#3db76a',
        points, closed: true, isGreenZone: true,
        virtualWorld: 0, noCollision: 0, noKnife: 1, isActive: 1,
        dbId: null, minZ: '0', maxZ: '100',
      }, 'green');
    },
    createdToast: () => 'GreenZone создана',
    confirmDelete: z => `Удалить GreenZone «${z.name}»?`,
    emptyText: () => 'Нет GreenZones — нарисуй полигон или сбрось к исходным',
    footer() {
      return `
        <button class="btn btn-green" onclick="startZonePoly()">+ Полигон</button>
        <button class="btn btn-green" onclick="startZoneRect()">+ Rect</button>
        <button class="btn btn-blue" onclick="exportAllGreenZonesSQL()">Экспорт SQL</button>
        <button class="btn btn-red" onclick="resetGreenZones()">↺ Сброс</button>`;
    },
    cardExtra: greenZoneCardExtra,
    exportButtons: i => `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn btn-green" onclick="exportGreenZoneSQL(${i})">SQL INSERT</button>
      </div>`,
  });

  registerZoneType({
    id: 'parking',
    label: 'Парковщик',
    canDraw: true,
    canEdit: true,
    canDelete: true,
    showSwatches: true,
    matches: z => zoneKindOf(z) === 'parking',
    loaded: () => parkingZonesLoaded,
    load: loadParkingZones,
    unload: unloadParkingZones,
    save: saveParkingZones,
    reset: resetParkingZones,
    create(drawing) {
      const n = zones.filter(z => zoneKindOf(z) === 'parking').length;
      const { points, type } = drawingPointsForType(drawing, false);
      return tagZoneKind({
        type, name: `Парковка ${n + 1}`, color: '#ff9800',
        points, closed: true, isParkingZone: true,
        parkingId: `custom-${Date.now()}`,
      }, 'parking');
    },
    createdToast: () => 'Зона парковщика создана',
    emptyText: () => 'Нет зон парковщика — нарисуй полигон',
    footer() {
      return `
        <button class="btn btn-green" onclick="startZonePoly()">+ Полигон</button>
        <button class="btn btn-green" onclick="startZoneRect()">+ Rect</button>
        <button class="btn btn-blue" onclick="exportParkingZonesPwn()">Экспорт .pwn</button>
        <button class="btn btn-red" onclick="resetParkingZones()">↺ Сброс</button>`;
    },
    exportButtons: i => `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportZone(${i},'poly')">Poly</button>
        <button class="zone-export-btn" onclick="exportZone(${i},'rect')">AABB</button>
      </div>`,
  });

  registerZoneType({
    id: 'territory',
    label: 'Территории',
    canDraw: true,
    canEdit: true,
    canDelete: true,
    showSwatches: false,
    matches: z => zoneKindOf(z) === 'territory',
    loaded: () => territoryZonesLoaded,
    load: loadTerritoryZones,
    unload: unloadTerritoryZones,
    save: saveTerritoryZones,
    reset: resetTerritoryZones,
    create(drawing) {
      const kind = territoryFilter === 'zone' ? TERRITORY_KIND_ZONE : TERRITORY_KIND_CITY;
      const n = zones.filter(z => zoneKindOf(z) === 'territory' && z.territoryKind === kind).length;
      const { points, type } = drawingPointsForType(drawing, true);
      return tagZoneKind({
        type,
        name: kind === TERRITORY_KIND_ZONE ? `Район ${n + 1}` : `Город ${n + 1}`,
        color: territoryColorFor(kind),
        points, closed: true,
        isTerritoryZone: true,
        territoryKind: kind,
        territoryType: defaultTerritoryType(kind),
        territoryId: `custom-${Date.now()}`,
        extra: 0,
      }, 'territory');
    },
    createdToast: z => z.territoryKind === TERRITORY_KIND_ZONE ? 'Район создан' : 'Город создан',
    confirmDelete: z => `Удалить территорию «${z.name}»?`,
    emptyText: () => {
      const q = (zoneSearch || '').trim();
      return q ? `Ничего не найдено по «${q}»` : 'Нет территорий — нарисуй полигон или сбрось к исходным';
    },
    extraToolbar: territoryToolbarHTML,
    filter: territoryCardVisible,
    badge: z => `<span class="territory-kind-badge ${z.territoryKind === TERRITORY_KIND_ZONE ? 'zone' : 'city'}">${
      z.territoryKind === TERRITORY_KIND_ZONE ? 'район' : 'город'
    }</span>`,
    cardExtra: territoryCardExtra,
    footer() {
      return `
        <button class="btn btn-green" onclick="startZonePoly()">+ Полигон</button>
        <button class="btn btn-green" onclick="startZoneRect()">+ Rect</button>
        <button class="btn btn-blue" onclick="exportTerritoryZonesPwn()">Экспорт zones.txt</button>
        <button class="btn btn-purple" onclick="openTerritoryImport()">⬆ Импорт</button>
        <button class="btn btn-red" onclick="resetTerritoryZones()">↺ Сброс</button>`;
    },
    exportButtons: i => `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportSingleTerritory(${i})">zones.txt</button>
      </div>`,
  });

  renderZoneTypeChrome();
}

function territoryToolbarHTML() {
  return `
    <div class="territory-filters">
      <button class="territory-filter-btn ${territoryFilter === 'all' ? 'active' : ''}" onclick="setTerritoryFilter('all')">Все</button>
      <button class="territory-filter-btn ${territoryFilter === 'city' ? 'active' : ''}" onclick="setTerritoryFilter('city')">Города</button>
      <button class="territory-filter-btn ${territoryFilter === 'zone' ? 'active' : ''}" onclick="setTerritoryFilter('zone')">Районы</button>
    </div>`;
}

function territoryCardExtra(z, i) {
  const kind = z.territoryKind === TERRITORY_KIND_ZONE ? 'zone' : 'city';
  const types = kind === 'zone' ? TERRITORY_ZONE_TYPES : TERRITORY_CITY_TYPES;
  const typeOpts = types.map(t =>
    `<option value="${t}" ${z.territoryType === t ? 'selected' : ''}>${t}</option>`
  ).join('');
  return `
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
    </div>`;
}

function greenZoneCardExtra(z, i) {
  const gz = GREEN_ZONES_DATA.find(g => g.dbId === z.dbId || g.id === z.dbId);
  let zRange = '';
  if (gz) {
    try { const arr = JSON.parse(gz.polygon_points); if (arr?.[0]) zRange = `Z: ${arr[0][0]}..${arr[0][1]} | `; } catch {}
  } else if (z.minZ != null) {
    zRange = `Z: ${z.minZ}..${z.maxZ} | `;
  }
  const idLabel = z.dbId != null ? `ID: ${z.dbId}` : 'новая';
  return `
    <div class="zone-card-meta" style="color:#88cc88">${zRange}${idLabel}</div>
    <div class="gz-fields">
      <div class="field">
        <span class="field-label">Вирт. мир</span>
        <input class="field-input" type="number" min="0" value="${z.virtualWorld ?? 0}"
          onchange="zones[${i}].virtualWorld=parseInt(this.value)||0;saveGreenZones()" onclick="event.stopPropagation()">
      </div>
      <div class="gz-checkboxes">
        <label class="gz-check-label">
          <input type="checkbox" ${z.noCollision ? 'checked' : ''} onchange="zones[${i}].noCollision=this.checked?1:0;saveGreenZones()" onclick="event.stopPropagation()">
          Нет коллизии
        </label>
        <label class="gz-check-label">
          <input type="checkbox" ${z.noKnife ? 'checked' : ''} onchange="zones[${i}].noKnife=this.checked?1:0;saveGreenZones()" onclick="event.stopPropagation()">
          Нет ножа
        </label>
        <label class="gz-check-label">
          <input type="checkbox" ${z.isActive ? 'checked' : ''} onchange="zones[${i}].isActive=this.checked?1:0;saveGreenZones()" onclick="event.stopPropagation()">
          Активна
        </label>
      </div>
    </div>`;
}

function renderZoneTypeChrome() {
  const tabs = document.getElementById('zones-subtabs');
  if (tabs) {
    tabs.innerHTML = allZoneTypes().map(t =>
      `<button class="zones-subtab ${t.id === zonesSubTab ? 'active' : ''}" onclick="switchZonesSubTab('${t.id}')">${t.label}</button>`
    ).join('');
  }
  const extra = document.getElementById('zone-type-extra');
  const type = currentZoneType();
  if (extra) extra.innerHTML = type?.extraToolbar ? type.extraToolbar() : '';
  const footer = document.getElementById('zones-footer');
  if (footer) footer.innerHTML = type?.footer ? type.footer() : '';
}

function setZoneSearch(q) {
  zoneSearch = q;
  renderZoneList();
}

function zonePassesSearch(z) {
  const q = (zoneSearch || '').trim().toLowerCase();
  if (!q) return true;
  return String(z.name || '').toLowerCase().includes(q);
}

function territoryCardVisible(z) {
  if (zoneKindOf(z) !== 'territory') return true;
  if (territoryFilter !== 'all' && z.territoryKind !== territoryFilter) return false;
  return zonePassesSearch(z);
}

function zoneListVisible(z) {
  const type = currentZoneType();
  if (!type || !zoneMatchesType(z, type.id)) return false;
  if (type.filter) return type.filter(z);
  return zonePassesSearch(z);
}

function switchZonesSubTab(tab) {
  const next = getZoneType(tab);
  if (!next) return;

  if (tab !== zonesSubTab) {
    for (const t of allZoneTypes()) {
      if (t.id !== tab && t.loaded?.()) t.unload?.();
    }
    zonesSubTab = tab;
    if (!next.loaded?.()) next.load?.();
  } else if (!next.loaded?.()) {
    next.load?.();
  }

  const visible = zones.map((z, i) => ({ z, i })).filter(({ z }) => zoneListVisible(z));
  if (visible.length && (selectedZoneIdx === null || !visible.some(v => v.i === selectedZoneIdx))) {
    selectedZoneIdx = visible[0].i;
  } else if (!visible.length) {
    selectedZoneIdx = null;
  }

  renderZoneTypeChrome();
  renderZoneList();
  draw();
}

function persistEditedZone(z) {
  const t = zoneTypeOf(z);
  if (t?.save) t.save();
}

function startZonePoly() { startZoneDraw('poly'); }
function startZoneRect() { startZoneDraw('rect'); }
function startParkingZonePoly() { startZoneDraw('poly', 'parking'); }
function startParkingZoneRect() { startZoneDraw('rect', 'parking'); }
function startTerritoryZonePoly() { startZoneDraw('poly', 'territory'); }
function startTerritoryZoneRect() { startZoneDraw('rect', 'territory'); }

function startZoneDraw(type, target) {
  const dest = target || zonesSubTab || 'user';
  setMode(type === 'rect' ? 'zone-rect' : 'zone-poly');
  drawingZone = { type, points: [], target: dest };
  switchTab('zones');
  if (zonesSubTab !== dest) switchZonesSubTab(dest);
  const t = getZoneType(dest);
  if (t && !t.loaded?.()) t.load?.();
  setInfo(type === 'rect'
    ? 'Прямоугольник: зажми ЛКМ и тяни'
    : 'Полигон: ЛКМ — точка, ПКМ или двойной клик — замкнуть');
}

function finishZone() {
  if (!drawingZone) return;
  const drawing = drawingZone;
  drawingZone = null;
  if (drawing.type === 'poly' && drawing.points.length < 3) { setMode('pan'); draw(); return; }
  if (drawing.type === 'rect' && drawing.points.length < 2) { setMode('pan'); draw(); return; }

  const type = getZoneType(drawing.target || zonesSubTab) || currentZoneType();
  if (!type?.create) { setMode('pan'); draw(); return; }
  const zone = type.create(drawing);
  zones.push(zone);
  selectedZoneIdx = zones.length - 1;
  setMode('pan');
  type.save?.();
  renderZoneList();
  draw();
  const toast = typeof type.createdToast === 'function' ? type.createdToast(zone) : (type.createdToast || 'Зона создана');
  showToast(toast);
}

function removeZone(i) {
  const z = zones[i];
  if (!z) return;
  const type = zoneTypeOf(z);
  if (type && type.canDelete === false) return;

  const doRemove = () => {
    const idx = zones.indexOf(z);
    if (idx < 0) return;
    zones.splice(idx, 1);
    if (selectedZoneIdx >= zones.length) selectedZoneIdx = zones.length ? zones.length - 1 : null;
    type?.save?.();
    renderZoneList();
    draw();
  };

  const msg = type?.confirmDelete ? type.confirmDelete(z) : null;
  if (msg) showConfirm(msg, doRemove);
  else doRemove();
}

function renderZoneList() {
  const el = document.getElementById('zone-list');
  if (!el) return;
  el.innerHTML = '';
  const type = currentZoneType();

  zones.forEach((z, i) => {
    if (!zoneListVisible(z)) return;

    const card = document.createElement('div');
    card.className = 'zone-card' + (i === selectedZoneIdx ? ' selected' : '');
    card.dataset.zoneIdx = String(i);

    const pts = z.points || [];
    const hasPts = pts.length > 0;
    const xs = hasPts ? pts.map(p => p.x) : [0];
    const ys = hasPts ? pts.map(p => p.y) : [0];
    const xmin = Math.min(...xs).toFixed(2), xmax = Math.max(...xs).toFixed(2);
    const ymin = Math.min(...ys).toFixed(2), ymax = Math.max(...ys).toFixed(2);
    const ptCount = z.type === 'rect' ? 4 : pts.length;
    const canEdit = type?.canEdit !== false;
    const persistFn = type?.save ? `${type.save.name}()` : '';

    const swatches = canEdit && type?.showSwatches ? ZONE_COLORS.map(c =>
      `<div class="color-swatch ${z.color === c ? 'active' : ''}" style="background:${c}"
         onclick="zones[${i}].color='${c}';${persistFn};renderZoneList();draw()"></div>`
    ).join('') : '';

    const removeBtn = type?.canDelete === false
      ? ''
      : `<button class="btn-remove" onclick="event.stopPropagation();removeZone(${i})">✕</button>`;

    const nameInput = canEdit
      ? `<input class="field-input" type="text" value="${escapeHtmlAttr(z.name)}"
          onchange="zones[${i}].name=this.value;${persistFn};renderZoneList();"
          onclick="event.stopPropagation()">`
      : '';

    const extra = type?.cardExtra ? type.cardExtra(z, i) : '';
    const exportBtns = type?.exportButtons ? type.exportButtons(i) : '';
    const badge = type?.badge ? type.badge(z) : '';
    const bounds = hasPts
      ? `<div class="zone-card-meta">X: ${xmin} .. ${xmax}</div>
         <div class="zone-card-meta">Y: ${ymin} .. ${ymax}</div>`
      : `<div class="zone-card-meta">Нет точек — нарисуй полигон</div>`;

    card.innerHTML = `
      <div class="zone-card-header">
        <div class="zone-card-title">
          <div class="zone-color-dot" style="background:${z.color}"></div>
          <span>${escapeHtmlAttr(z.name)}</span>
          ${badge}
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="zone-export-btn" onclick="event.stopPropagation();focusZone(${i})">На карте</button>
          ${removeBtn}
        </div>
      </div>
      <div class="zone-card-meta">${z.type === 'rect' ? 'Прямоугольник' : `Полигон · ${ptCount} вершин`}</div>
      ${extra}
      ${bounds}
      ${nameInput}
      ${swatches ? `<div class="color-swatch-row">${swatches}</div>` : ''}
      ${exportBtns}`;

    card.addEventListener('mousedown', e => {
      if (!['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) {
        selectedZoneIdx = i;
        renderZoneList();
        scrollToZone(i);
        draw();
      }
    });
    card.addEventListener('dblclick', e => {
      if (!['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) focusZone(i);
    });
    el.appendChild(card);
  });

  if (!el.querySelector('.zone-card')) {
    const empty = document.createElement('div');
    empty.className = 'zone-card-meta';
    empty.style.padding = '8px';
    const q = (zoneSearch || '').trim();
    empty.textContent = q && type?.id !== 'territory'
      ? `Ничего не найдено по «${q}»`
      : (type?.emptyText ? type.emptyText() : 'Нет зон');
    el.appendChild(empty);
  }

  const countEl = document.getElementById('zone-count');
  if (countEl && type) {
    const total = zones.filter(z => zoneMatchesType(z, type.id)).length;
    const shown = zones.filter(zoneListVisible).length;
    const q = (zoneSearch || '').trim();
    countEl.textContent = q ? `Найдено ${shown} из ${total}` : `${shown} зон`;
  }
}

function applyFeatureFlags() {
  if (!FEATURES.ROUTES_TAB) {
    document.getElementById('tab-btn-routes')?.style.setProperty('display', 'none');
    const panel = document.getElementById('tab-routes');
    if (panel) panel.style.display = 'none';
  }
}
