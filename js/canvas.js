// ============================================================
// CANVAS — resize, main draw loop, all mouse/wheel/context handlers
// ============================================================

// --- Resize ---
function resize() {
  const wrap    = document.getElementById('canvas-wrap');
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.addEventListener('resize', resize);

// --- Main draw ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (showMap && mapImg.complete && mapImg.naturalWidth > 0) {
    drawMap();
  } else {
    drawGrid();
  }

  if (mode === 'cal') drawCalPoints();

  drawZones();

  if (activeContext === 'tl') {
    trafficLights.forEach((tl, i) => drawTL(tl, i));
  }

  if (activeContext === 'routes') {
    drawBusRoutes();
  }
}

// --- Mouse handlers ---

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();

  if (mode === 'zone-poly' && drawingZone && drawingZone.points.length >= 3) {
    finishZone();
    return;
  }

  if (activeContext === 'tl') {
    trafficLights.forEach((tl, i) => {
      const s = worldToScreen(tl.x, tl.y);
      if (Math.hypot(e.offsetX - s.x, e.offsetY - s.y) < 14) {
        confirmRemoveTL(i);
      }
    });
  }
});

canvas.addEventListener('mousedown', e => {
  // Middle mouse — always pan
  if (e.button === 1) {
    isPanning = true;
    panStart  = { x: e.offsetX, y: e.offsetY, vx: viewX, vy: viewY };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  const w = screenToWorld(e.offsetX, e.offsetY);

  // Routes: add checkpoint on click
  if (activeContext === 'routes' && addingCheckpointMode) {
    if (selectedRouteIdx !== null && busRoutes[selectedRouteIdx]) {
      addCheckpoint(busRoutes[selectedRouteIdx].id, w.x, w.y);
      showToast('Чекпоинт добавлен');
    }
    cancelAddCheckpointMode();
    return;
  }

  // Routes: click on existing checkpoint to select
  if (activeContext === 'routes' && mode === 'pan') {
    // Only search within the selected route if one is active
    const searchRoutes = selectedRouteIdx !== null
      ? [busRoutes[selectedRouteIdx]].filter(Boolean)
      : busRoutes.filter(r => r.visible);
    let hitCp = null;
    for (const route of searchRoutes) {
      const cps = getRouteCheckpoints(route.id);
      for (const cp of cps) {
        const s = worldToScreen(cp.x, cp.y);
        if (Math.hypot(e.offsetX - s.x, e.offsetY - s.y) < 10) {
          hitCp = cp;
          break;
        }
      }
      if (hitCp) break;
    }
    if (hitCp) {
      selectCheckpoint(hitCp.id);
      return;
    }
  }

  // Editable zone vertex drag must win over pan selection
  if (showZones && activeContext === 'zones') {
    const vh = hitTestEditableZoneVertex(e.offsetX, e.offsetY);
    if (vh) {
      draggingZoneVertex = vh;
      selectedZoneIdx = vh.zoneIdx;
      renderZoneList();
      return;
    }
  }

  if (mode === 'pan') {
    if (activeContext === 'zones') {
      const hit = hitTestZone(w.x, w.y);
      if (hit >= 0) {
        const z = zones[hit];
        const wantTab = zoneSubTabOf(z);
        if (zonesSubTab !== wantTab) switchZonesSubTab(wantTab);
        selectedZoneIdx = hit;
        renderZoneList();
        scrollToZone(hit);
        draw();
      }
    }
    isPanning = true;
    panStart  = { x: e.offsetX, y: e.offsetY, vx: viewX, vy: viewY };
    return;
  }

  if (mode === 'cal') {
    addCalPoint(e.offsetX, e.offsetY, w.x, w.y);
    return;
  }

  if (mode === 'zone-poly') {
    if (!drawingZone) drawingZone = { type: 'poly', points: [] };
    drawingZone.points.push({ x: w.x, y: w.y });
    draw();
    return;
  }

  if (mode === 'zone-rect') {
    if (!drawingZone) drawingZone = { type: 'rect', points: [] };
    drawingZone.points = [{ x: w.x, y: w.y }, { x: w.x, y: w.y }];
    draw();
    return;
  }

  // Zone corner drag (traffic lights)
  if (showZones) {
    const ph = hitTestZonePoints(e.offsetX, e.offsetY);
    if (ph) {
      draggingPoint = ph;
      selectedIdx   = ph.tlIdx;
      renderTLList();
      return;
    }
  }

  if (mode === 'tl') {
    let hit = false;
    trafficLights.forEach((tl, i) => {
      const s = worldToScreen(tl.x, tl.y);
      if (Math.hypot(e.offsetX - s.x, e.offsetY - s.y) < 12) {
        draggingTL  = i;
        dragOff     = { dx: e.offsetX - s.x, dy: e.offsetY - s.y };
        selectedIdx = i;
        hit         = true;
        renderTLList();
        scrollToTL(i);
        draw();
      }
    });
    if (!hit) {
      trafficLights.push(makeTL(w.x, w.y));
      selectedIdx = trafficLights.length - 1;
      renderTLList();
      draw();
      saveTLState();
    }
    return;
  }
});

canvas.addEventListener('mousemove', e => {
  if (isPanning && panStart) {
    viewX = panStart.vx - (e.offsetX - panStart.x) / viewScale;
    viewY = panStart.vy + (e.offsetY - panStart.y) / viewScale;
    draw();
    return;
  }

  if (draggingZoneVertex !== null) {
    const w = screenToWorld(e.offsetX, e.offsetY);
    const z = zones[draggingZoneVertex.zoneIdx];
    if (z?.points?.[draggingZoneVertex.pointIdx]) {
      z.points[draggingZoneVertex.pointIdx] = { x: w.x, y: w.y };
      setInfo(`${z.name} · вершина ${draggingZoneVertex.pointIdx + 1}: ${w.x.toFixed(2)}, ${w.y.toFixed(2)}`);
      draw();
    }
    return;
  }

  if (draggingPoint !== null) {
    const w = screenToWorld(e.offsetX, e.offsetY);
    applyZonePointDrag(trafficLights[draggingPoint.tlIdx], draggingPoint.point, w.x, w.y);
    renderTLList();
    draw();
    return;
  }

  if (draggingTL !== null) {
    const w = screenToWorld(e.offsetX - dragOff.dx, e.offsetY - dragOff.dy);
    trafficLights[draggingTL].x = w.x;
    trafficLights[draggingTL].y = w.y;
    renderTLList();
    draw();
    return;
  }

  if (mode === 'zone-rect' && drawingZone && drawingZone.points.length === 2 && e.buttons === 1) {
    const w2 = screenToWorld(e.offsetX, e.offsetY);
    drawingZone.points[1] = { x: w2.x, y: w2.y };
    draw();
    return;
  }

  // Hover info
  let hovered = false;
  trafficLights.forEach((tl, i) => {
    const s = worldToScreen(tl.x, tl.y);
    if (Math.hypot(e.offsetX - s.x, e.offsetY - s.y) < 18) {
      setInfo(`TL#${i} | ROT_Z:${tl.rotZ}° | ${STATUS_LABEL[tl.status]} | Half:${tl.angleHalf}° | P1:(${tl.areaX1.toFixed(1)},${tl.areaY1.toFixed(1)}) P2:(${tl.areaX2.toFixed(1)},${tl.areaY2.toFixed(1)})`);
      hovered = true;
    }
  });

  if (!hovered) {
    const w = screenToWorld(e.offsetX, e.offsetY);
    const modeHints = {
      tl:  `Светофор · ЛКМ — добавить/перетащить · x:${w.x.toFixed(1)} y:${w.y.toFixed(1)}`,
      pan: `Панорама · x:${w.x.toFixed(1)} y:${w.y.toFixed(1)}`,
    };
    setInfo(modeHints[mode] ?? `x:${w.x.toFixed(1)} y:${w.y.toFixed(1)}`);
  }

  // Cursor for zone point handles
  if (!draggingTL && !isPanning && showZones) {
    if (activeContext === 'zones') {
      const vh = hitTestEditableZoneVertex(e.offsetX, e.offsetY);
      if (vh) {
        canvas.style.cursor = 'grab';
        setInfo(`Вершина ${vh.pointIdx + 1} — тяни чтобы изменить зону`);
        return;
      }
    }
    const ph = hitTestZonePoints(e.offsetX, e.offsetY);
    canvas.style.cursor = ph ? 'grab' : (mode === 'pan' ? 'grab' : mode === 'tl' ? 'cell' : 'crosshair');
    if (ph) setInfo(`P${ph.point} TL#${ph.tlIdx} — тяни чтобы изменить зону`);
  }
});

canvas.addEventListener('mouseup', e => {
  if (e.button === 1) { isPanning = false; return; }

  if (mode === 'zone-rect' && drawingZone && drawingZone.points.length === 2) {
    finishZone();
    return;
  }

  const wasDraggingTL    = draggingTL    !== null;
  const wasDraggingPoint = draggingPoint !== null;
  const wasDraggingVertex = draggingZoneVertex !== null;
  const draggedZone = wasDraggingVertex ? zones[draggingZoneVertex.zoneIdx] : null;

  isPanning     = false;
  draggingTL    = null;
  draggingPoint = null;
  draggingZoneVertex = null;

  if (wasDraggingTL || wasDraggingPoint) saveTLState();
  if (wasDraggingVertex && draggedZone) {
    persistEditedZone(draggedZone);
    renderZoneList();
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const w = screenToWorld(e.offsetX, e.offsetY);
  viewScale *= e.deltaY < 0 ? 1.12 : 0.9;
  viewScale  = Math.max(0.05, Math.min(20, viewScale));
  viewX = w.x - e.offsetX / viewScale;
  viewY = w.y + e.offsetY / viewScale;
  draw();
}, { passive: false });

// --- Init ---

// 1. Size the canvas first (no draw yet)
const wrap    = document.getElementById('canvas-wrap');
canvas.width  = wrap.clientWidth;
canvas.height = wrap.clientHeight;

// 2. Set viewport so the map is centred and zoomed out
viewScale = 0.12;
viewX     = -(canvas.width  / 2) / viewScale;
viewY     =  (canvas.height / 2) / viewScale;

// 3. Load data
const _saved = loadSavedTLState();
trafficLights = (_saved && _saved.length > 0) ? _saved : buildDefaultTLs();
selectedIdx = 0;
renderTLList();
updateTLButtons();

zones = [];
initZoneTypes();
applyFeatureFlags();
renderZoneList();

initRoutesData().then(() => { renderRouteList(); draw(); });

// 4. Hide zone-specific mode buttons (we start on TL tab)
['mode-zone-poly','mode-zone-rect'].forEach(id => {
  document.getElementById(id).style.display = 'none';
});

// 5. Wire up map image — onload must be set before src so cached images fire correctly
mapImg.onload = () => draw();
mapImg.src    = 'assets/Map.png';

// 6. Initial draw (renders grid + TLs while map may still be loading)
draw();
setInfo('1-светофор  2-панорама  M-карта');
