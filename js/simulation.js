// ============================================================
// SIMULATION v2 — multi-car, real-time TL switching, braking
// ============================================================

// ---- Constants ----
const CAR_COLORS   = ['#4fc3f7','#ff8a65','#81c784','#ce93d8','#fff176','#f48fb1','#80cbc4','#ffb74d'];
const CAR_NAMES    = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];

// Speed is in world-units per second; default base = 60 wu/s ≈ ~120 km/h feels
const BASE_SPEED   = 60;
// How many world-units ahead to check for a red TL zone before braking
const BRAKE_DIST   = 80;
// Deceleration when braking (wu/s²)
const DECEL        = 120;
// Acceleration when resuming (wu/s²)
const ACCEL        = 80;

// TL cycle: GREEN → YELLOW → RED → YELLOW_RED → GREEN
// Duration of each phase in seconds. YELLOW phases are brief.
const PHASE_NEXT   = { GREEN: 'YELLOW', YELLOW: 'RED', RED: 'YELLOW_RED', YELLOW_RED: 'GREEN' };
const PHASE_DUR    = (tl, status) => {
  if (status === 'GREEN')       return tl.greenTime  || 15;
  if (status === 'RED')         return tl.redTime    || 15;
  if (status === 'YELLOW')      return Math.max(2, (tl.greenTime || 15) * 0.15);
  if (status === 'YELLOW_RED')  return Math.max(1.5, (tl.redTime || 15) * 0.10);
  return 5;
};

// ---- Helpers ----
function norm(a) { return ((a % 360) + 360) % 360; }

function checkFine(tl, angle) {
  const diff    = norm(angle - tl.rotZ);
  const ownLane = diff >= 180 - tl.angleHalf && diff <= 180 + tl.angleHalf;
  let blocked   = false;
  if (tl.turnThreshold > 0 && ownLane)
    blocked = !(diff >= 180 - tl.turnThreshold && diff <= 180 + tl.turnThreshold);
  const isRed = tl.status === 'RED' || tl.status === 'YELLOW_RED';
  const fine  = ownLane && !blocked && isRed;
  const dir   = ownLane ? (blocked ? 'поворот' : 'своя полоса') : 'не своя полоса';
  return { fine, dir, isRed, inAngle: ownLane, blocked };
}

function lerpPos(pts, seg, t) {
  const A = pts[seg], B = pts[seg + 1];
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}

function segAngle(pts, seg) {
  const A = pts[seg], B = pts[seg + 1];
  return norm(Math.atan2(B.x - A.x, B.y - A.y) * 180 / Math.PI);
}

// Lookahead: scan ~BRAKE_DIST wu ahead along path for red TL zones.
// Returns the effective TL phase status for the upcoming zone, or null.
function lookAheadTL(car, pts) {
  if (!pts || pts.length < 2) return null;
  let remaining = BRAKE_DIST;
  let seg = car.seg, t = car.t;

  while (seg < pts.length - 1 && remaining > 0) {
    const A = pts[seg], B = pts[seg + 1];
    const dx = B.x - A.x, dy = B.y - A.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const distInSeg = segLen * (1 - t);

    // Sample positions along this segment portion
    const steps = Math.max(1, Math.ceil(distInSeg / 8));
    for (let s = 1; s <= steps; s++) {
      const tt  = t + (1 - t) * (s / steps);
      const px  = A.x + (B.x - A.x) * tt;
      const py  = A.y + (B.y - A.y) * tt;
      const ang = segAngle(pts, seg);
      for (let i = 0; i < trafficLights.length; i++) {
        const tl      = trafficLights[i];
        const phase   = tlPhase[i];
        const status  = phase ? phase.status : tl.status;
        if (pointInZone(px, py, tl)) {
          const r = checkFine({ ...tl, status }, ang);
          if (r.inAngle && (status === 'RED' || status === 'YELLOW_RED' || status === 'YELLOW'))
            return { tlIdx: i, status };
        }
      }
    }
    remaining -= distInSeg;
    seg++;
    t = 0;
  }
  return null;
}

// ---- Log ----
function addLog(type, msg) {
  logEntries.push({ type, msg });
  renderLog();
}
function renderLog() {
  const el = document.getElementById('log-panel');
  if (!el) return;
  el.innerHTML = logEntries
    .map(e => `<div class="log-entry log-${e.type}">${e.msg}</div>`)
    .join('');
  el.scrollTop = el.scrollHeight;
}
function clearLog() { logEntries = []; renderLog(); }

// ---- Path management ----
function clearPath() {
  pathPoints = [];
  stopSimulation();
  cars      = [];
  carPos    = null;
  carInZone = {};
  draw();
}

// ---- TL phase init / update ----
function initTLPhases() {
  tlPhase = trafficLights.map(tl => ({
    status: tl.status,
    timer:  PHASE_DUR(tl, tl.status),
  }));
}

function updateTLPhases(dt) {
  tlPhase.forEach((ph, i) => {
    ph.timer -= dt;
    if (ph.timer <= 0) {
      ph.status = PHASE_NEXT[ph.status] || 'GREEN';
      ph.timer  = PHASE_DUR(trafficLights[i], ph.status);
      addLog('info', `🚦 TL#${i} → ${STATUS_LABEL[ph.status]}`);
    }
    // Mirror back so drawTL sees live status
    trafficLights[i].status = ph.status;
  });
}

// ---- Car factory ----
function spawnCar(pathId, startSeg, startT) {
  const idx  = cars.length % CAR_COLORS.length;
  const pts  = getPathPoints(pathId);
  if (!pts || pts.length < 2) return null;

  const car = {
    id:      nextCarId++,
    pathId,
    seg:     Math.min(startSeg, pts.length - 2),
    t:       startT,
    pos:     lerpPos(pts, Math.min(startSeg, pts.length - 2), startT),
    angle:   segAngle(pts, Math.min(startSeg, pts.length - 2)),
    speed:   BASE_SPEED,
    state:   'running',   // 'running' | 'waiting' | 'done'
    inZone:  {},          // tlIdx → bool
    color:   CAR_COLORS[idx],
    name:    CAR_NAMES[idx] || `Car ${nextCarId}`,
    fines:   0,
    braking: false,
    waitTimer: 0,
  };
  trafficLights.forEach((_, i) => { car.inZone[i] = false; });
  return car;
}

// ---- Path resolution ----
// pathId = 'main' uses legacy pathPoints; future extension: named paths
function getPathPoints(pathId) {
  if (pathId === 'main') return pathPoints;
  const p = paths.find(p => p.id === pathId);
  return p ? p.points : null;
}

// ---- Simulation control ----
function runSimulation() {
  if (pathPoints.length < 2 && paths.every(p => p.points.length < 2)) {
    addLog('info', 'Нарисуй путь из минимум 2 точек');
    switchTab('log');
    return;
  }
  stopSimulation();
  initTLPhases();
  addLog('info', '── Симуляция начата ──');

  // If no cars placed yet, spawn one at start of main path
  if (cars.length === 0 && pathPoints.length >= 2) {
    const car = spawnCar('main', 0, 0);
    if (car) cars.push(car);
    updateSimStats();
  }

  simRunning  = true;
  simLastTime = performance.now();
  switchTab('log');
  requestAnimationFrame(simLoop);
}

function stopSimulation() {
  simRunning = false;
}

function resetSimulation() {
  stopSimulation();
  cars      = [];
  carPos    = null;
  carInZone = {};
  tlPhase   = [];
  // Restore original TL statuses
  trafficLights.forEach(tl => {
    const saved = loadSavedTLState();
    if (saved) {
      const orig = saved.find(s => s.x === tl.x && s.y === tl.y);
      if (orig) tl.status = orig.status;
    }
  });
  updateSimStats();
  clearLog();
  draw();
}

// Spawn a car at the clicked position on the path
function spawnCarAtCursor(wx, wy) {
  if (pathPoints.length < 2) return;
  // Find nearest point on path
  let bestSeg = 0, bestT = 0, bestDist = Infinity;
  for (let seg = 0; seg < pathPoints.length - 1; seg++) {
    const A = pathPoints[seg], B = pathPoints[seg + 1];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.001) continue;
    const t = Math.max(0, Math.min(1, ((wx - A.x) * dx + (wy - A.y) * dy) / len2));
    const px = A.x + dx * t, py = A.y + dy * t;
    const d  = Math.hypot(wx - px, wy - py);
    if (d < bestDist) { bestDist = d; bestSeg = seg; bestT = t; }
  }
  if (bestDist > 200) return; // too far from path

  const car = spawnCar('main', bestSeg, bestT);
  if (!car) return;
  // Stagger initial speed slightly so cars don't overlap
  car.speed = BASE_SPEED * (0.85 + Math.random() * 0.3);
  cars.push(car);
  updateSimStats();
  showToast(`Машина ${car.name} добавлена`);

  // Auto-start sim if not running
  if (!simRunning && pathPoints.length >= 2) {
    if (tlPhase.length === 0) initTLPhases();
    simRunning  = true;
    simLastTime = performance.now();
    requestAnimationFrame(simLoop);
  }
}

function removeLastCar() {
  if (cars.length === 0) return;
  const car = cars.pop();
  showToast(`Машина ${car.name} удалена`);
  updateSimStats();
  draw();
}

// ---- Main loop ----
function simLoop(now) {
  if (!simRunning) return;

  const dt = Math.min((now - simLastTime) / 1000, 0.1); // cap at 100ms
  simLastTime = now;

  updateTLPhases(dt);
  cars.forEach(car => updateCar(car, dt));

  // Remove done cars
  const doneCars = cars.filter(c => c.state === 'done');
  doneCars.forEach(c => {
    addLog('info', `🏁 ${c.name} завершил маршрут | штрафов: ${c.fines}`);
  });
  cars = cars.filter(c => c.state !== 'done');

  // Sync legacy single-car vars for drawCar
  if (cars.length > 0) {
    carPos   = cars[0].pos;
    carAngle = cars[0].angle;
  } else {
    carPos = null;
  }

  updateSimStats();
  draw();

  if (simRunning) requestAnimationFrame(simLoop);
}

// ---- Per-car update ----
function updateCar(car, dt) {
  const pts = getPathPoints(car.pathId);
  if (!pts || pts.length < 2) { car.state = 'done'; return; }

  // ---- Braking logic: look ahead for red TL ----
  const ahead = lookAheadTL(car, pts);
  if (ahead && (ahead.status === 'RED' || ahead.status === 'YELLOW_RED')) {
    car.braking = true;
    car.speed   = Math.max(0, car.speed - DECEL * dt);
    if (car.speed < 2) { car.state = 'waiting'; car.speed = 0; return; }
  } else if (ahead && ahead.status === 'YELLOW') {
    car.braking = true;
    car.speed   = Math.max(BASE_SPEED * 0.4, car.speed - DECEL * 0.5 * dt);
  } else {
    car.braking = false;
    const targetSpeed = parseFloat(document.getElementById('car-speed')?.value || 2) * BASE_SPEED / 2;
    car.speed = Math.min(targetSpeed, car.speed + ACCEL * dt);
  }

  // If was waiting, check if we can go now
  if (car.state === 'waiting') {
    const still = lookAheadTL(car, pts);
    if (!still || (still.status !== 'RED' && still.status !== 'YELLOW_RED')) {
      car.state  = 'running';
      car.speed  = BASE_SPEED * 0.3;
      car.braking = false;
    } else {
      return; // stay stopped
    }
  }

  // ---- Advance position ----
  const speedWu = car.speed; // world-units per second
  let   distLeft = speedWu * dt;

  while (distLeft > 0 && car.seg < pts.length - 1) {
    const A = pts[car.seg], B = pts[car.seg + 1];
    const dx = B.x - A.x, dy = B.y - A.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen < 0.001) { car.seg++; continue; }

    const distToEnd = segLen * (1 - car.t);
    if (distLeft >= distToEnd) {
      distLeft -= distToEnd;
      car.seg++;
      car.t = 0;
    } else {
      car.t += distLeft / segLen;
      distLeft = 0;
    }
  }

  if (car.seg >= pts.length - 1) { car.state = 'done'; return; }

  car.pos   = lerpPos(pts, car.seg, car.t);
  car.angle = segAngle(pts, car.seg);

  // ---- TL zone enter/exit ----
  trafficLights.forEach((tl, i) => {
    const ph     = tlPhase[i];
    const status = ph ? ph.status : tl.status;
    const inside = pointInZone(car.pos.x, car.pos.y, tl);

    if (inside && !car.inZone[i]) {
      car.inZone[i] = true;
      addLog('enter', `→ [${car.name}] въезд TL#${i} (${STATUS_LABEL[status]}) | ${car.angle.toFixed(0)}°`);
    }
    if (!inside && car.inZone[i]) {
      car.inZone[i] = false;
      const r = checkFine({ ...tl, status }, car.angle);
      if (r.fine) {
        car.fines++;
        addLog('fine', `🚨 [${car.name}] ШТРАФ — TL#${i} | ${STATUS_LABEL[status]} | ${r.dir} | ${car.angle.toFixed(0)}°`);
      } else {
        const why = !r.isRed ? 'зелёный' : !r.inAngle ? 'угол не подходит' : r.blocked ? 'поворот' : 'ок';
        addLog('ok', `✓ [${car.name}] чисто — TL#${i} | ${r.dir} | ${why}`);
      }
    }
  });
}

// ---- Stats panel update ----
function updateSimStats() {
  const el = document.getElementById('sim-stats');
  if (!el) return;
  const totalFines = cars.reduce((s, c) => s + c.fines, 0);
  el.textContent = `Машин: ${cars.length} | Штрафов: ${totalFines}`;
}

// ---- Canvas drawing ----

// Draw all cars
function drawAllCars() {
  cars.forEach(car => drawSingleCar(car));
}

function drawSingleCar(car) {
  const pts = getPathPoints(car.pathId);
  if (!pts || pts.length < 2 || !car.pos) return;
  const s = worldToScreen(car.pos.x, car.pos.y);

  // Canvas rotation from screen-space movement vector
  const seg  = Math.min(car.seg, pts.length - 2);
  const sA   = worldToScreen(pts[seg].x,     pts[seg].y);
  const sB   = worldToScreen(pts[seg+1].x,   pts[seg+1].y);
  const ang  = Math.atan2(sB.y - sA.y, sB.x - sA.x) + Math.PI / 2;
  const W = 9, L = 16;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(ang);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(2, 2, W, L, 0, 0, Math.PI * 2); ctx.fill();

  // Body
  ctx.fillStyle   = car.braking ? shadeColor(car.color, -40) : car.color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.roundRect(-W, -L, W * 2, L * 2, 4); ctx.fill(); ctx.stroke();

  // Windshield
  ctx.fillStyle = 'rgba(13,71,161,0.45)';
  ctx.fillRect(-W * 0.7, -L * 0.8, W * 1.4, L * 0.45);

  // Brake lights (red glow at rear when braking)
  if (car.braking || car.state === 'waiting') {
    ctx.fillStyle = 'rgba(255,60,60,0.85)';
    ctx.beginPath(); ctx.roundRect(-W, L - 4, W * 0.7, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(W * 0.3, L - 4, W * 0.7, 4, 2); ctx.fill();
  }

  // Direction arrow
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -L + 2); ctx.lineTo(0, -L - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -L - 4); ctx.lineTo(0, -L - 11); ctx.lineTo(4, -L - 4); ctx.stroke();

  ctx.restore();

  // Label above car
  ctx.save();
  ctx.font      = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = car.color;
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText(car.name, s.x + 12, s.y - 10);
  if (car.fines > 0) {
    ctx.fillStyle = '#d95555';
    ctx.fillText(`⚠${car.fines}`, s.x + 12, s.y);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // Waiting indicator
  if (car.state === 'waiting') {
    ctx.save();
    ctx.fillStyle = 'rgba(217,85,85,0.9)';
    ctx.font      = '14px sans-serif';
    ctx.fillText('✋', s.x - 7, s.y - 22);
    ctx.restore();
  }
}

// Helper: darken/lighten a hex color
function shadeColor(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + pct));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
  const b = Math.min(255, Math.max(0, (n & 0xff) + pct));
  return `rgb(${r},${g},${b})`;
}

// Draw path (same as before, kept here)
function drawPath() {
  if (pathPoints.length === 0) return;
  const pts = pathPoints.map(p => worldToScreen(p.x, p.y));

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = 5;
  ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach((s, i) => i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(79,195,247,0.8)';
  ctx.lineWidth   = 2.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  pts.forEach((s, i) => i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y));
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < pts.length - 1; i++) {
    const mx    = (pts[i].x + pts[i+1].x) / 2;
    const my    = (pts[i].y + pts[i+1].y) / 2;
    const angle = Math.atan2(pts[i+1].y - pts[i].y, pts[i+1].x - pts[i].x);
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(angle);
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(-3,-4); ctx.lineTo(-3,4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  pts.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#3db76a' : i === pts.length - 1 ? '#d95555' : 'rgba(79,195,247,0.5)';
    ctx.beginPath(); ctx.arc(s.x, s.y, (i === 0 || i === pts.length - 1) ? 5 : 3, 0, Math.PI * 2); ctx.fill();
  });
}

// Legacy single-car stub — replaced by drawAllCars in draw()
function drawCar() { /* unused — draw() calls drawAllCars() */ }
