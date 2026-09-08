// ============================================================
// TERRITORY FORMAT — parse / serialize zones.txt (pawn E_ZONES_STRUCT)
// ============================================================

const TERRITORY_MAX_POINTS = 30; // Float coords[60] — 30 x,y pairs
const TERRITORY_CITY_TYPES = ['CITY_OTHER', 'CITY_RUBLEVKA', 'CITY_MIAMI'];
const TERRITORY_ZONE_TYPES = ['ZONE_OTHER'];

const TERRITORY_KIND_CITY = 'city';
const TERRITORY_KIND_ZONE = 'zone';

function defaultTerritoryType(kind) {
  return kind === TERRITORY_KIND_ZONE ? 'ZONE_OTHER' : 'CITY_OTHER';
}

function territoryKindFromType(type) {
  return String(type || '').startsWith('ZONE_') ? TERRITORY_KIND_ZONE : TERRITORY_KIND_CITY;
}

function fmtTerritoryCoord(n) {
  const s = parseFloat(Number(n).toFixed(4)).toString();
  return s.includes('.') ? s : s + '.0';
}

function parseTerritoryCoords(inner) {
  const nums = String(inner).split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x === 0 && y === 0) break;
    pts.push({ x, y });
  }
  return pts;
}

function padTerritoryCoords(points) {
  const out = [];
  const pts = Array.isArray(points) ? points.slice(0, TERRITORY_MAX_POINTS) : [];
  for (let i = 0; i < TERRITORY_MAX_POINTS; i++) {
    if (i < pts.length) {
      out.push(fmtTerritoryCoord(pts[i].x), fmtTerritoryCoord(pts[i].y));
    } else {
      out.push('0.0', '0.0');
    }
  }
  return out;
}

function zonePointsAsPoly(z) {
  const pts = Array.isArray(z?.points) ? z.points : [];
  if (z?.type === 'rect' && pts.length >= 2) {
    const a = pts[0], b = pts[1];
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ];
  }
  return pts;
}

function extractPawnArrayBody(src, name) {
  const re = new RegExp(name + '\\s*\\[[^\\]]*\\](?:\\s*\\[[^\\]]*\\])?\\s*=\\s*\\{');
  const m = src.match(re);
  if (!m) return '';
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
  }
  return src.slice(start);
}

function parseTerritoryEntries(body, fallbackKind) {
  const re = /\{\s*(CITY_\w+|ZONE_\w+)\s*,\s*"([^"]*)"\s*,\s*\{([^}]*)\}\s*,\s*(-?\d+)\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(body))) {
    const type = m[1];
    out.push({
      type,
      name: m[2],
      kind: territoryKindFromType(type) || fallbackKind,
      points: parseTerritoryCoords(m[3]),
      extra: parseInt(m[4], 10) || 0,
    });
  }
  return out;
}

function parseTerritoryPwn(src) {
  const stripped = String(src)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const cities = parseTerritoryEntries(extractPawnArrayBody(stripped, 'g_city'), TERRITORY_KIND_CITY)
    .map(z => ({ ...z, kind: TERRITORY_KIND_CITY }));
  const streets = parseTerritoryEntries(extractPawnArrayBody(stripped, 'g_zone'), TERRITORY_KIND_ZONE)
    .map(z => ({ ...z, kind: TERRITORY_KIND_ZONE, type: z.type.startsWith('ZONE_') ? z.type : 'ZONE_OTHER' }));

  return { cities, streets };
}

function formatTerritoryEntry(z) {
  const type = z.type || defaultTerritoryType(z.kind);
  const name = String(z.name ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const coords = padTerritoryCoords(z.points).join(', ');
  const extra = Number.isFinite(z.extra) ? z.extra : 0;
  return `\t{${type}, "${name}",\t\t{${coords}}, ${extra}}`;
}

function formatTerritoryPwn(cities, streets) {
  const cityList = Array.isArray(cities) ? cities : [];
  const zoneList = Array.isArray(streets) ? streets : [];
  const cityCount = Math.max(cityList.length, 1);
  const zoneCount = Math.max(zoneList.length, 1);

  const cityRows = (cityList.length ? cityList : [{
    type: 'CITY_OTHER', name: 'Нижегородская обл.', points: [], extra: 0,
  }]).map(formatTerritoryEntry);

  const zoneRows = (zoneList.length ? zoneList : [{
    type: 'ZONE_OTHER', name: '[нет данных]', points: [], extra: 0,
  }]).map(formatTerritoryEntry);

  return [
    'new // Города',
    `\tg_city[${cityCount}][E_ZONES_STRUCT] = `,
    '{',
    cityRows.join(',\n'),
    '};',
    '',
    `#define MAX_ZONES ${zoneCount}`,
    'new // Улицы, районы',
    '\tg_zone[MAX_ZONES][E_ZONES_STRUCT] = ',
    '{',
    zoneRows.join(',\n'),
    '};',
    '',
  ].join('\n');
}
