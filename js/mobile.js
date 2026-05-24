// ============================================================
// MOBILE — bottom sheet panel, drag-to-dismiss, sync with sidebar
// ============================================================

(function () {
  const BREAKPOINT = 768;

  let panelOpen = false;
  let dragState  = null; // { startY, startTranslate }

  function isMobile() {
    return window.innerWidth <= BREAKPOINT;
  }

  // ---- Open / close ----

  window.toggleMobilePanel = function () {
    if (!isMobile()) return;
    panelOpen ? closeMobilePanel() : openMobilePanel();
  };

  window.openMobilePanel = function () {
    if (!isMobile()) return;
    syncPanelContent();
    document.getElementById('mobile-panel').classList.add('open');
    document.getElementById('mobile-backdrop').classList.add('visible');
    document.getElementById('topbar-menu-btn').classList.add('active');
    panelOpen = true;
  };

  window.closeMobilePanel = function () {
    document.getElementById('mobile-panel').classList.remove('open');
    document.getElementById('mobile-backdrop').classList.remove('visible');
    document.getElementById('topbar-menu-btn').classList.remove('active');
    panelOpen = false;
  };

  // ---- Sync sidebar content into mobile panel ----
  // We move the sidebar's children into the panel so all JS bindings stay intact.
  // On resize back to desktop we move them back.

  function syncPanelContent() {
    const sidebar = document.getElementById('sidebar');
    const inner   = document.getElementById('mobile-panel-inner');

    if (inner.children.length > 0) return; // already moved

    // Move all sidebar children into panel
    while (sidebar.firstChild) {
      inner.appendChild(sidebar.firstChild);
    }
  }

  function restoreSidebarContent() {
    const sidebar = document.getElementById('sidebar');
    const inner   = document.getElementById('mobile-panel-inner');

    while (inner.firstChild) {
      sidebar.appendChild(inner.firstChild);
    }
  }

  // ---- Drag handle ----

  const handle = document.getElementById('mobile-panel-handle');

  handle.addEventListener('touchstart', onDragStart, { passive: true });
  handle.addEventListener('mousedown',  onDragStart);

  function onDragStart(e) {
    const panel = document.getElementById('mobile-panel');
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState = { startY: clientY, startTranslate: 0 };
    panel.style.transition = 'none';

    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchend',  onDragEnd);
    document.addEventListener('mouseup',   onDragEnd);
  }

  function onDragMove(e) {
    if (!dragState) return;
    e.preventDefault();
    const clientY   = e.touches ? e.touches[0].clientY : e.clientY;
    const delta     = clientY - dragState.startY;
    const translate = Math.max(0, delta); // only allow dragging down
    document.getElementById('mobile-panel').style.transform = `translateY(${translate}px)`;
  }

  function onDragEnd(e) {
    if (!dragState) return;
    const panel    = document.getElementById('mobile-panel');
    const clientY  = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const delta    = clientY - dragState.startY;

    panel.style.transition = '';
    panel.style.transform  = '';

    if (delta > 80) {
      closeMobilePanel();
    }

    dragState = null;
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchend',  onDragEnd);
    document.removeEventListener('mouseup',   onDragEnd);
  }

  // ---- Resize: restore content to sidebar when going back to desktop ----

  let lastWasMobile = isMobile();

  window.addEventListener('resize', () => {
    const nowMobile = isMobile();
    if (lastWasMobile && !nowMobile) {
      closeMobilePanel();
      restoreSidebarContent();
    }
    lastWasMobile = nowMobile;
  });

  // ---- Close on Escape ----

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panelOpen) closeMobilePanel();
  });

  // ---- Touch pan/pinch on canvas (prevent default scroll) ----

  const canvas = document.getElementById('canvas');
  let lastTouchDist = null;
  let lastTouchMid  = null;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      lastTouchDist = getTouchDist(e.touches);
      lastTouchMid  = getTouchMid(e.touches);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      // Simulate mousedown for pan
      isPanning = true;
      panStart  = { x: t.clientX - canvas.getBoundingClientRect().left,
                    y: t.clientY - canvas.getBoundingClientRect().top,
                    vx: viewX, vy: viewY };
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom
      const dist = getTouchDist(e.touches);
      const mid  = getTouchMid(e.touches);
      if (lastTouchDist && lastTouchMid) {
        const ratio = dist / lastTouchDist;
        const w     = screenToWorld(mid.x, mid.y);
        viewScale  *= ratio;
        viewScale   = Math.max(0.05, Math.min(20, viewScale));
        viewX = w.x - mid.x / viewScale;
        viewY = w.y + mid.y / viewScale;
        draw();
      }
      lastTouchDist = dist;
      lastTouchMid  = mid;
      isPanning = false;
    } else if (e.touches.length === 1 && isPanning && panStart) {
      const t  = e.touches[0];
      const ox = t.clientX - canvas.getBoundingClientRect().left;
      const oy = t.clientY - canvas.getBoundingClientRect().top;
      viewX = panStart.vx - (ox - panStart.x) / viewScale;
      viewY = panStart.vy + (oy - panStart.y) / viewScale;
      draw();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    lastTouchDist = null;
    lastTouchMid  = null;
    if (e.touches.length === 0) {
      isPanning = false;
    }
  }, { passive: false });

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getTouchMid(touches) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }

})();
