// ============================================================
// IMPORT / EXPORT — .pwn import, .pwn export, SQL export
// ============================================================

// --- Import modal ---
function openImport() {
  document.getElementById('import-overlay').classList.add('open');
  document.getElementById('import-result').textContent = '';
}

function closeImport() {
  document.getElementById('import-overlay').classList.remove('open');
}

function doImport() {
  const src      = document.getElementById('import-textarea').value;
  const resultEl = document.getElementById('import-result');

  // Resolve #define constants
  const defines = {};
  for (const m of src.matchAll(/#define\s+(\w+)\s+([\d.+-]+)/g)) {
    defines[m[1]] = parseFloat(m[2]);
  }

  function resolveVal(s) {
    s = s.trim();
    return defines[s] !== undefined ? defines[s] : parseFloat(s);
  }

  const stripped = src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const bodyMatch = stripped.match(/g_traffic_lights_info\s*\[.*?\]\s*=\s*\{([\s\S]*)\}/);
  const body      = bodyMatch ? bodyMatch[1] : stripped;

  const imported = [];
  for (const rm of body.matchAll(/\{([^}]+)\}/g)) {
    const parts = rm[1].split(',').map(s => s.trim());
    if (parts.length < 14) continue;

    // Enum field order:
    // 0:MODEL_ID  1:START_STATUS  2:GREEN_TIME  3:RED_TIME
    // 4:POS_X  5:POS_Y  6:POS_Z  7:ROT_X  8:ROT_Y  9:ROT_Z
    // 10:AREA_X1  11:AREA_Y1  12:AREA_X2  13:AREA_Y2
    // 14:ANGLE_HALF  15:TURN_THRESHOLD
    const statusRaw = parts[1].replace(/TRAFFIC_LIGHT_STATUS\s*:\s*/, '').trim();
    const statusMap = { GREEN: 'GREEN', RED: 'RED', YELLOW: 'YELLOW', YELLOW_RED: 'YELLOW_RED' };
    const status    = statusMap[statusRaw] || 'RED';

    const ax1 = resolveVal(parts[10]);
    const ay1 = resolveVal(parts[11]);
    const ax2 = resolveVal(parts[12]);
    const ay2 = resolveVal(parts[13]);
    const px  = resolveVal(parts[4]);
    const py  = resolveVal(parts[5]);
    const hasZone = !(ax1 === 0 && ay1 === 0 && ax2 === 0 && ay2 === 0);

    imported.push({
      x: px, y: py,
      rotZ:          parseFloat(resolveVal(parts[9]).toFixed(6)),
      status,
      angleHalf:     parts[14] !== undefined ? resolveVal(parts[14]) : 115,
      turnThreshold: parts[15] !== undefined ? resolveVal(parts[15]) : 0,
      areaX1: hasZone ? ax1 : px - 15, areaY1: hasZone ? ay1 : py - 15,
      areaX2: hasZone ? ax2 : px + 15, areaY2: hasZone ? ay2 : py + 15,
      modelId:   parseInt(parts[0])          || 1351,
      greenTime: parseInt(parts[2])          || 15,
      redTime:   parseInt(parts[3])          || 15,
      posZ:      resolveVal(parts[6]),
      rotX:      resolveVal(parts[7]),
      rotY:      resolveVal(parts[8]),
    });
  }

  if (imported.length === 0) {
    resultEl.style.color = 'var(--red)';
    resultEl.textContent = 'Не найдено ни одной записи. Проверь формат .pwn.';
    return;
  }

  trafficLights = imported;
  trafficLights.forEach((_, i) => { carInZone[i] = false; });
  selectedIdx = 0;
  renderTLList();
  draw();
  saveTLState();

  resultEl.style.color = 'var(--green)';
  resultEl.textContent = `Импортировано ${imported.length} светофоров.`;
  setTimeout(closeImport, 900);
}

// --- Export .pwn ---
function exportTLPwn() {
  if (trafficLights.length === 0) { showToast('Нет светофоров для экспорта'); return; }

  const fmt = n => {
    const s = parseFloat(n.toFixed(6)).toString();
    return s.includes('.') ? s : s + '.0';
  };

  const lines = trafficLights.map((tl, i) => {
    const modelId   = tl.modelId   ?? 1351;
    const greenTime = tl.greenTime ?? 15;
    const redTime   = tl.redTime   ?? 15;
    const posZ      = tl.posZ      ?? 0;
    const rotX      = tl.rotX      ?? 0;
    const rotY      = tl.rotY      ?? 0;
    return `\t{${modelId}, ${tl.status}, ${greenTime}, ${redTime}, ${fmt(tl.x)}, ${fmt(tl.y)}, ${fmt(posZ)}, ${fmt(rotX)}, ${fmt(rotY)}, ${fmt(tl.rotZ)}, ${fmt(tl.areaX1)}, ${fmt(tl.areaY1)}, ${fmt(tl.areaX2)}, ${fmt(tl.areaY2)}, TRAFFIC_LIGHT_DEFAULT_ANGLE_HALF, TRAFFIC_LIGHT_DEFAULT_TURN_THRESHOLD}, // ${i}`;
  });

  const code = `new g_traffic_lights_info[TRAFFIC_LIGHTS_COUNT][E_TRAFFIC_LIGHT_INFO] =\n{\n${lines.join('\n')}\n};`;
  openExportModal('Экспорт светофоров (.pwn)', code);
}

// --- Zone exports ---
function exportZone(i, fmt) {
  const z    = zones[i];
  let   pts  = z.points;

  if (z.type === 'rect' && pts.length === 2) {
    const [a, b] = pts;
    pts = [
      { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    ];
  }

  const name = z.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const xs   = pts.map(p => p.x), ys = pts.map(p => p.y);
  let code   = '';

  if (fmt === 'rect') {
    const x1 = Math.min(...xs).toFixed(4), y1 = Math.min(...ys).toFixed(4);
    const x2 = Math.max(...xs).toFixed(4), y2 = Math.max(...ys).toFixed(4);
    code = `// ${z.name} — прямоугольник\n` +
      `#define ${name.toUpperCase()}_X1  ${x1}\n` +
      `#define ${name.toUpperCase()}_Y1  ${y1}\n` +
      `#define ${name.toUpperCase()}_X2  ${x2}\n` +
      `#define ${name.toUpperCase()}_Y2  ${y2}\n\n` +
      `// IsPlayerInArea(playerid, ${x1}, ${y1}, ${x2}, ${y2})`;
  } else {
    const verts = pts.map((p, j) => `    /* ${j} */ ${p.x.toFixed(4)}, ${p.y.toFixed(4)}`).join(',\n');
    code = `// ${z.name} — полигон (${pts.length} вершин)\n` +
      `new Float:${name}_verts[] = {\n${verts}\n};\n` +
      `#define ${name.toUpperCase()}_COUNT  ${pts.length}`;
  }

  openExportModal(`Экспорт: ${z.name}`, code);
}

function exportAllZones() {
  if (zones.length === 0) { showToast('Нет зон для экспорта'); return; }

  const code = zones.map(z => {
    let pts = z.points;
    if (z.type === 'rect' && pts.length === 2) {
      const [a, b] = pts;
      pts = [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }];
    }
    const name = z.name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    const xs   = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x1   = Math.min(...xs).toFixed(4), y1 = Math.min(...ys).toFixed(4);
    const x2   = Math.max(...xs).toFixed(4), y2 = Math.max(...ys).toFixed(4);
    const aabb = `#define ${name}_X1 ${x1}\n#define ${name}_Y1 ${y1}\n#define ${name}_X2 ${x2}\n#define ${name}_Y2 ${y2}`;
    const verts = pts.map(p => `    ${p.x.toFixed(4)}, ${p.y.toFixed(4)}`).join(',\n');
    const poly  = `new Float:${name.toLowerCase()}_verts[] = {\n${verts}\n};`;
    return `// ---- ${z.name} ----\n${aabb}\n${poly}`;
  }).join('\n\n');

  openExportModal('Экспорт всех зон', code);
}

function exportGreenZoneSQL(i) {
  const z   = zones[i];
  const pts = z.points;
  const vw  = z.virtualWorld ?? 0;
  const nc  = z.noCollision  ?? 0;
  const nk  = z.noKnife      ?? 1;
  const act = z.isActive     ?? 1;

  let minZ = '0', maxZ = '100';
  const gz = GREEN_ZONES_DATA.find(g => g.dbId === z.dbId);
  if (gz) {
    try { const arr = JSON.parse(gz.polygon_points); if (arr?.[0]) { minZ = arr[0][0]; maxZ = arr[0][1]; } } catch {}
  }

  const polyJson = JSON.stringify([[minZ, maxZ], pts.flatMap(p => [p.x.toFixed(4), p.y.toFixed(4)])]);
  const code =
    `INSERT INTO green_zones (name, min_x, max_x, min_y, max_y, is_use_polygon, polygon_points, virtual_world, is_no_collision, is_no_knife, is_active)\n` +
    `VALUES ('${z.name}', 0, 0, 0, 0, 1, '${polyJson}', ${vw}, ${nc}, ${nk}, ${act});`;

  openExportModal(`SQL: ${z.name}`, code);
}

// --- Export modal helper ---
function openExportModal(title, code) {
  document.getElementById('export-title').textContent   = title;
  document.getElementById('export-textarea').value      = code;
  document.getElementById('export-overlay').classList.add('open');
}

function closeExportModal() {
  document.getElementById('export-overlay').classList.remove('open');
}

function copyExport() {
  navigator.clipboard.writeText(document.getElementById('export-textarea').value)
    .then(() => showToast('Скопировано!'));
}
