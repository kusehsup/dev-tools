// ============================================================
// ZONES — CRUD, drawing, green zones, persistence
// ============================================================

function zoneColorFor(i) { return ZONE_COLORS[i % ZONE_COLORS.length]; }

// --- Drawing mode entry points (called from topbar buttons) ---
function startZonePoly() {
  setMode('zone-poly');
  drawingZone = { type: 'poly', points: [] };
  switchTab('zones');
  setInfo('Полигон: ЛКМ — точка, ПКМ или двойной клик — замкнуть');
}

function startZoneRect() {
  setMode('zone-rect');
  drawingZone = { type: 'rect', points: [] };
  switchTab('zones');
  setInfo('Прямоугольник: зажми ЛКМ и тяни');
}

function finishZone() {
  if (!drawingZone) return;
  const z = drawingZone;
  drawingZone = null;
  if (z.type === 'poly' && z.points.length < 3) { setMode('pan'); draw(); return; }
  if (z.type === 'rect' && z.points.length < 2) { setMode('pan'); draw(); return; }
  zones.push({
    type:   z.type,
    name:   `Зона ${zones.length + 1}`,
    color:  zoneColorFor(zones.length),
    points: z.points,
    closed: true,
  });
  selectedZoneIdx = zones.length - 1;
  setMode('pan');
  saveUserZones();
  renderZoneList();
  draw();
}

function removeZone(i) {
  zones.splice(i, 1);
  if (selectedZoneIdx >= zones.length) selectedZoneIdx = zones.length - 1;
  saveUserZones();
  renderZoneList();
  draw();
}

// --- Persistence ---
function saveUserZones() {
  const toSave = zones.filter(z => !z.isGreenZone);
  try { localStorage.setItem(STORAGE.ZONES, JSON.stringify(toSave)); } catch {}
}

function loadUserZones() {
  try {
    const raw = localStorage.getItem(STORAGE.ZONES);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

// --- Sidebar list ---
function renderZoneList() {
  const el = document.getElementById('zone-list');
  el.innerHTML = '';

  zones.forEach((z, i) => {
    const card    = document.createElement('div');
    card.className = 'zone-card' + (i === selectedZoneIdx ? ' selected' : '');

    const pts  = z.points;
    const xs   = pts.map(p => p.x), ys = pts.map(p => p.y);
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

    const swatches = ZONE_COLORS.map(c =>
      `<div class="color-swatch ${z.color === c ? 'active' : ''}" style="background:${c}"
         onclick="zones[${i}].color='${c}';saveUserZones();renderZoneList();draw()"></div>`
    ).join('');

    card.innerHTML = `
      <div class="zone-card-header">
        <div class="zone-card-title">
          <div class="zone-color-dot" style="background:${z.color}"></div>
          <span>${z.name}</span>
        </div>
        <button class="btn-remove" onclick="event.stopPropagation();removeZone(${i})">✕</button>
      </div>
      <div class="zone-card-meta">${z.type === 'rect' ? 'Прямоугольник' : `Полигон · ${ptCount} вершин`}</div>
      ${gzExtra}
      <div class="zone-card-meta">X: ${xmin} .. ${xmax}</div>
      <div class="zone-card-meta">Y: ${ymin} .. ${ymax}</div>
      <input class="field-input" type="text" value="${z.name}"
        onchange="zones[${i}].name=this.value; saveUserZones(); renderZoneList();"
        onclick="event.stopPropagation()">
      <div class="color-swatch-row">${swatches}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="zone-export-btn" onclick="exportZone(${i},'rect')">AABB</button>
        <button class="zone-export-btn" onclick="exportZone(${i},'poly')">Poly</button>
        <button class="zone-export-btn btn-green" onclick="exportGreenZoneSQL(${i})">SQL INSERT</button>
      </div>`;

    card.addEventListener('mousedown', e => {
      const tag = e.target.tagName;
      if (!['INPUT','BUTTON','SELECT'].includes(tag)) {
        selectedZoneIdx = i;
        renderZoneList();
        scrollToZone(i);
        draw();
      }
    });

    el.appendChild(card);
  });
}

function scrollToZone(i) {
  const cards = document.getElementById('zone-list').querySelectorAll('.zone-card');
  cards[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
  for (let i = zones.length - 1; i >= 0; i--) {
    const z   = zones[i];
    const pts = z.points;
    if (pts.length === 0) continue;
    if (z.type === 'rect' && pts.length >= 2) {
      const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y);
      if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) return i;
    } else {
      if (pointInPolygon(wx, wy, pts)) return i;
    }
  }
  return -1;
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
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const sc = worldToScreen(cx, cy);
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${sel ? 12 : 10}px monospace`;
    ctx.fillText(z.name, sc.x + 4, sc.y - 4);
    ctx.shadowBlur  = 0;
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
