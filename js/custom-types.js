// ============================================================
// CUSTOM ZONE TYPES — create/edit types + export templates in UI
// ============================================================

const CUSTOM_TYPE_STORAGE = 'tl_custom_zone_types';
const CUSTOM_ZONE_DATA_PREFIX = 'tl_custom_zones_';

const EXPORT_PRESETS = {
  poly: {
    label: 'Полигон (.pwn блок)',
    entry: '{\t// {{name}}\n{{points_lines}}\n\t}',
    join: ',\n',
    file: '{{entries}}',
  },
  aabb: {
    label: 'AABB (x1, y1, x2, y2)',
    entry: '{{x1}}, {{y1}}, {{x2}}, {{y2}} // {{name}}',
    join: '\n',
    file: '{{entries}}',
  },
  pawn_array: {
    label: 'Массив полигонов',
    entry: '\t{\t// {{name}}\n{{points_lines}}\n\t}',
    join: ',\n',
    file: 'new Float:zones[][] = {\n{{entries}}\n};',
  },
  defines: {
    label: '#define AABB + verts',
    entry: '// ---- {{name}} ----\n#define {{name_id}}_X1 {{x1}}\n#define {{name_id}}_Y1 {{y1}}\n#define {{name_id}}_X2 {{x2}}\n#define {{name_id}}_Y2 {{y2}}\nnew Float:{{name_id_lower}}_verts[] = {\n{{points_csv_indent}}\n};',
    join: '\n\n',
    file: '{{entries}}',
  },
  custom: {
    label: 'Свой шаблон',
    entry: '{\t// {{name}}\n{{points_lines}}\n\t}',
    join: ',\n',
    file: '{{entries}}',
  },
};

const customTypeLoaded = Object.create(null);

function loadCustomTypeDefs() {
  try {
    const raw = localStorage.getItem(CUSTOM_TYPE_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomTypeDefs(defs) {
  try { localStorage.setItem(CUSTOM_TYPE_STORAGE, JSON.stringify(defs)); } catch {}
}

function slugifyTypeId(label) {
  const base = String(label || 'type')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'type';
  return `custom-${base}-${Date.now().toString(36)}`;
}

function customZonesStorageKey(id) {
  return CUSTOM_ZONE_DATA_PREFIX + id;
}

function fmtExportCoord(n) {
  const s = parseFloat(Number(n).toFixed(4)).toString();
  return s.includes('.') ? s : s + '.0';
}

function zoneExportVars(z, index, total) {
  const pts = zonePointsAsPoly(z);
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const x1 = pts.length ? Math.min(...xs) : 0;
  const y1 = pts.length ? Math.min(...ys) : 0;
  const x2 = pts.length ? Math.max(...xs) : 0;
  const y2 = pts.length ? Math.max(...ys) : 0;
  const nameId = String(z.name || 'ZONE').replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || 'ZONE';
  return {
    name: z.name || '',
    name_id: nameId,
    name_id_lower: nameId.toLowerCase(),
    color: z.color || '#4caf50',
    index: String(index),
    count: String(total),
    points_count: String(pts.length),
    x1: fmtExportCoord(x1),
    y1: fmtExportCoord(y1),
    x2: fmtExportCoord(x2),
    y2: fmtExportCoord(y2),
    points_csv: pts.map(p => `${fmtExportCoord(p.x)}, ${fmtExportCoord(p.y)}`).join(', '),
    points_csv_indent: pts.map(p => `    ${fmtExportCoord(p.x)}, ${fmtExportCoord(p.y)}`).join(',\n'),
    points_lines: pts.map(p => `\t\t${fmtExportCoord(p.x)}, ${fmtExportCoord(p.y)}`).join(',\n'),
    points: pts.map(p => `${fmtExportCoord(p.x)}, ${fmtExportCoord(p.y)}`).join(', '),
  };
}

function applyExportTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (
    vars[key] !== undefined ? vars[key] : `{{${key}}}`
  ));
}

function resolveExportConfig(def) {
  const preset = EXPORT_PRESETS[def.exportPreset] || EXPORT_PRESETS.poly;
  if (def.exportPreset === 'custom') {
    return {
      entry: def.entryTemplate || preset.entry,
      join: def.joinTemplate ?? preset.join,
      file: def.fileTemplate || preset.file,
    };
  }
  return {
    entry: preset.entry,
    join: preset.join,
    file: preset.file,
  };
}

function exportZonesWithConfig(list, def) {
  const cfg = resolveExportConfig(def);
  const entries = list.map((z, i) => applyExportTemplate(cfg.entry, zoneExportVars(z, i, list.length)));
  return applyExportTemplate(cfg.file, {
    entries: entries.join(cfg.join),
    count: String(list.length),
    type_label: def.label || '',
    type_id: def.id || '',
  });
}

function exportCustomTypeZones(typeId) {
  const def = loadCustomTypeDefs().find(d => d.id === typeId);
  if (!def) { showToast('Тип не найден'); return; }
  const list = zones.filter(z => z.kind === typeId);
  if (!list.length) { showToast('Нет зон этого типа'); return; }
  openExportModal(`Экспорт: ${def.label}`, exportZonesWithConfig(list, def));
}

function exportSingleCustomZone(i) {
  const z = zones[i];
  if (!z) return;
  const def = loadCustomTypeDefs().find(d => d.id === z.kind);
  if (!def) { showToast('Тип не найден'); return; }
  openExportModal(`Экспорт: ${z.name}`, exportZonesWithConfig([z], def));
}

function saveCustomTypeZones(typeId) {
  const toSave = zones
    .filter(z => z.kind === typeId)
    .map(z => ({
      kind: typeId,
      name: z.name,
      color: z.color,
      type: z.type || 'poly',
      points: z.points,
      closed: true,
    }));
  try { localStorage.setItem(customZonesStorageKey(typeId), JSON.stringify(toSave)); } catch {}
}

function loadCustomTypeZones(typeId) {
  if (customTypeLoaded[typeId]) return;
  let list = [];
  try {
    const raw = localStorage.getItem(customZonesStorageKey(typeId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {}
  list.forEach((z, idx) => {
    zones.push({
      kind: typeId,
      type: z.type || 'poly',
      name: z.name || `Зона ${idx + 1}`,
      color: z.color || '#4caf50',
      points: Array.isArray(z.points) ? z.points : [],
      closed: true,
      isCustomZone: true,
    });
  });
  customTypeLoaded[typeId] = true;
}

function unloadCustomTypeZones(typeId) {
  if (!customTypeLoaded[typeId]) return;
  saveCustomTypeZones(typeId);
  zones = zones.filter(z => z.kind !== typeId);
  customTypeLoaded[typeId] = false;
}

function registerCustomZoneType(def) {
  const id = def.id;
  registerZoneType({
    id,
    label: def.label,
    builtin: false,
    canDraw: true,
    canEdit: true,
    canDelete: true,
    showSwatches: true,
    matches: z => z.kind === id,
    loaded: () => !!customTypeLoaded[id],
    load: () => loadCustomTypeZones(id),
    unload: () => unloadCustomTypeZones(id),
    save: () => saveCustomTypeZones(id),
    create(drawing) {
      const n = zones.filter(z => z.kind === id).length;
      const { points, type } = drawingPointsForType(drawing, true);
      return tagZoneKind({
        type,
        name: `${def.namePrefix || def.label || 'Зона'} ${n + 1}`,
        color: def.color || zoneColorFor(n),
        points,
        closed: true,
        isCustomZone: true,
      }, id);
    },
    createdToast: () => `${def.label}: зона создана`,
    confirmDelete: z => `Удалить «${z.name}»?`,
    emptyText: () => `Нет зон типа «${def.label}» — нарисуй полигон`,
    footer() {
      return `
        <button class="ui-btn ui-btn-primary" onclick="startZonePoly()">+ Полигон</button>
        <button class="ui-btn" onclick="startZoneRect()">+ Rect</button>
        <button class="ui-btn ui-btn-accent" onclick="exportCustomTypeZones('${id}')">Экспорт</button>
        <button class="ui-btn ui-btn-danger" onclick="deleteCustomZoneType('${id}')">Удалить тип</button>`;
    },
    exportButtons: i => `
      <div class="flex flex-wrap gap-1.5">
        <button class="zone-export-btn" onclick="exportSingleCustomZone(${i})">Экспорт</button>
      </div>`,
  });
}

function registerAllCustomZoneTypes() {
  loadCustomTypeDefs().forEach((def) => {
    if (!def?.id || !def?.label) return;
    registerCustomZoneType(def);
  });
}

function upsertCustomTypeDef(def) {
  const defs = loadCustomTypeDefs();
  const idx = defs.findIndex(d => d.id === def.id);
  if (idx >= 0) defs[idx] = def;
  else defs.push(def);
  saveCustomTypeDefs(defs);
  initZoneTypes();
  switchZonesSubTab(def.id);
  showToast(idx >= 0 ? 'Тип обновлён' : 'Тип создан');
}

function deleteCustomZoneType(id) {
  const def = loadCustomTypeDefs().find(d => d.id === id);
  if (!def) return;
  showConfirm(`Удалить тип «${def.label}» и все его зоны?`, () => {
    if (customTypeLoaded[id]) unloadCustomTypeZones(id);
    try { localStorage.removeItem(customZonesStorageKey(id)); } catch {}
    saveCustomTypeDefs(loadCustomTypeDefs().filter(d => d.id !== id));
    delete customTypeLoaded[id];
    initZoneTypes();
    switchZonesSubTab('user');
    showToast('Тип удалён');
  });
}

// --- Type manager modal ---
let _editingTypeId = null;

function openTypeManager(editId = null) {
  _editingTypeId = editId;
  const overlay = document.getElementById('type-manager-overlay');
  const defs = loadCustomTypeDefs();
  const listEl = document.getElementById('type-manager-list');
  if (listEl) {
    const builtins = allZoneTypes().filter(t => t.builtin !== false && !String(t.id).startsWith('custom-'));
    listEl.innerHTML = `
      <div class="space-y-1 mb-3">
        <div class="text-[10px] uppercase tracking-wider text-zinc-500 px-1">Встроенные</div>
        ${builtins.map(t => `
          <div class="flex items-center justify-between rounded-lg px-3 py-2 bg-zinc-900/60 border border-white/5">
            <span class="text-sm text-zinc-200">${escapeHtmlAttr(t.label)}</span>
            <span class="text-[10px] text-zinc-500">системный</span>
          </div>`).join('')}
      </div>
      <div class="space-y-1">
        <div class="text-[10px] uppercase tracking-wider text-zinc-500 px-1">Свои типы</div>
        ${defs.length ? defs.map(d => `
          <button type="button" class="w-full flex items-center justify-between rounded-lg px-3 py-2 bg-zinc-900/60 border border-white/5 hover:border-white/15 text-left ${editId === d.id ? 'border-sky-500/40' : ''}"
            onclick="openTypeManager('${d.id}')">
            <span class="flex items-center gap-2 text-sm text-zinc-200">
              <span class="w-2.5 h-2.5 rounded-full" style="background:${d.color || '#4caf50'}"></span>
              ${escapeHtmlAttr(d.label)}
            </span>
            <span class="text-[10px] text-zinc-500">${EXPORT_PRESETS[d.exportPreset]?.label || d.exportPreset}</span>
          </button>`).join('') : '<div class="text-xs text-zinc-500 px-1 py-2">Пока нет — создай справа</div>'}
      </div>`;
  }

  const def = editId ? defs.find(d => d.id === editId) : null;
  document.getElementById('tm-title').textContent = def ? 'Изменить тип' : 'Новый тип зон';
  document.getElementById('tm-label').value = def?.label || '';
  document.getElementById('tm-prefix').value = def?.namePrefix || '';
  document.getElementById('tm-color').value = def?.color || '#38bdf8';
  document.getElementById('tm-preset').value = def?.exportPreset || 'poly';
  document.getElementById('tm-entry').value = def?.entryTemplate || EXPORT_PRESETS.custom.entry;
  document.getElementById('tm-join').value = def?.joinTemplate ?? ',\n';
  document.getElementById('tm-file').value = def?.fileTemplate || '{{entries}}';
  onTypePresetChange();
  overlay?.classList.add('open');
}

function closeTypeManager() {
  document.getElementById('type-manager-overlay')?.classList.remove('open');
  _editingTypeId = null;
}

function onTypePresetChange() {
  const preset = document.getElementById('tm-preset')?.value || 'poly';
  const custom = preset === 'custom';
  document.getElementById('tm-custom-fields')?.classList.toggle('hidden', !custom);
}

function saveTypeFromManager() {
  const label = document.getElementById('tm-label').value.trim();
  if (!label) { showToast('Укажи название типа'); return; }
  const exportPreset = document.getElementById('tm-preset').value;
  const def = {
    id: _editingTypeId || slugifyTypeId(label),
    label,
    namePrefix: document.getElementById('tm-prefix').value.trim() || label,
    color: document.getElementById('tm-color').value || '#38bdf8',
    exportPreset,
    entryTemplate: document.getElementById('tm-entry').value,
    joinTemplate: document.getElementById('tm-join').value,
    fileTemplate: document.getElementById('tm-file').value,
  };
  upsertCustomTypeDef(def);
  closeTypeManager();
}

function previewTypeExport() {
  const label = document.getElementById('tm-label').value.trim() || 'Демо';
  const def = {
    id: 'preview',
    label,
    exportPreset: document.getElementById('tm-preset').value,
    entryTemplate: document.getElementById('tm-entry').value,
    joinTemplate: document.getElementById('tm-join').value,
    fileTemplate: document.getElementById('tm-file').value,
  };
  const sample = [
    { name: `${label} 1`, points: [{ x: 100, y: 200 }, { x: 140, y: 200 }, { x: 140, y: 240 }, { x: 100, y: 240 }], type: 'poly' },
    { name: `${label} 2`, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], type: 'poly' },
  ];
  openExportModal('Превью экспорта', exportZonesWithConfig(sample, def));
}
