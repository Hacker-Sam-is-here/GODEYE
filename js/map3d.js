// ============================================================
//  GODEYE — MAP3D Shim
//  Implements the MAP3D API surface using MapLibre GL markers
//  and GeoJSON sources — no Cesium required.
// ============================================================
const MAP3D = (() => {
  // All markers keyed by id
  const _markers = {};
  // All dynamic source/layer ids keyed by id
  const _layers  = {};

  // ── Lifecycle ──────────────────────────────────────────────
  async function init() {
    // 3D mode is now just MapLibre with pitch + buildings
    MAP2D.whenReady(() => MAP2D.enable3D());
    return Promise.resolve();
  }

  function whenReady(fn) {
    // Since there's no separate async viewer, execute immediately
    MAP2D.whenReady(fn);
  }

  function syncFromMap2D() {
    // No-op — same MapLibre instance
  }

  function applyFilterMode(mode) {
    MAP2D.applyFilterMode(mode);
  }

  // ── Billboard (aircraft, ships, satellites) ────────────────
  // In 3D mode, these are rendered as styled HTML markers on the map
  function addBillboard(id, lat, lng, altM, opts = {}) {
    // Remove existing marker with this id
    if (_markers[id]) { _markers[id].remove(); delete _markers[id]; }

    const { type, color = '#00ff41', scale = 1, heading = 0, label = '', popup = '' } = opts;

    const el = document.createElement('div');
    el.style.cssText = `
      position: relative;
      width: ${18 * scale}px;
      height: ${18 * scale}px;
      cursor: pointer;
    `;

    // Icon canvas
    const canvas = document.createElement('canvas');
    canvas.width  = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 2;

    if (type === 'plane') {
      ctx.save();
      ctx.translate(12, 12);
      ctx.rotate((heading * Math.PI) / 180);
      ctx.translate(-12, -12);
      ctx.beginPath();
      ctx.moveTo(12, 2); ctx.lineTo(15, 14); ctx.lineTo(12, 11.5); ctx.lineTo(9, 14);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (type === 'ship') {
      ctx.fillRect(8, 10, 8, 4);
      ctx.strokeRect(8, 8, 8, 8);
    } else {
      ctx.beginPath();
      ctx.arc(12, 12, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.style.cssText = `width:100%;height:100%;display:block;`;
    el.appendChild(canvas);

    // Altitude pulse ring for aircraft
    if (type === 'plane') {
      const ring = document.createElement('div');
      const sz = Math.min(30, 8 + altM / 1500);
      ring.style.cssText = `
        position:absolute; top:50%; left:50%;
        transform:translate(-50%,-50%);
        width:${sz}px; height:${sz}px;
        border-radius:50%;
        border:1px solid ${color};
        opacity:0.4;
        pointer-events:none;
      `;
      el.appendChild(ring);
    }

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(MAP2D.map);

    if (popup) {
      el.addEventListener('click', () => {
        MAP2D.showPopup(lat, lng, popup);
      });
    }

    _markers[id] = marker;
  }

  // ── Dashed Polyline ────────────────────────────────────────
  function addDashedPolyline(id, positions, color = '#00ff41', width = 2) {
    if (!MAP2D.map) return;
    // positions = [[lng, lat, alt], ...]
    const coords = positions.map(p => [p[0], p[1]]);
    const srcId = `wv-3d-line-${id}`;
    const lyrId = `wv-3d-line-lyr-${id}`;

    MAP2D.setSource(srcId, {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }]
    });

    MAP2D.whenReady(() => {
      if (!MAP2D.map || MAP2D.map.getLayer(lyrId)) return;
      try {
        MAP2D.map.addLayer({
          id: lyrId, type: 'line', source: srcId,
          paint: {
            'line-color': color,
            'line-width': width,
            'line-opacity': 0.6,
            'line-dasharray': [3, 2],
          }
        });
      } catch(e) {}
    });

    _layers[id] = { srcId, lyrId };
  }

  // ── Cleanup ────────────────────────────────────────────────
  function removeAllWithPrefix(prefix) {
    // Remove markers
    Object.keys(_markers).filter(k => k.startsWith(prefix)).forEach(k => {
      try { _markers[k].remove(); } catch(e) {}
      delete _markers[k];
    });
    // Remove dynamic line layers/sources
    Object.keys(_layers).filter(k => k.startsWith(prefix)).forEach(k => {
      try { MAP2D.removeLayer(_layers[k].lyrId); } catch(e) {}
      try { MAP2D.removeSource(_layers[k].srcId); } catch(e) {}
      delete _layers[k];
    });
  }

  return {
    init,
    whenReady,
    syncFromMap2D,
    applyFilterMode,
    addBillboard,
    addDashedPolyline,
    removeAllWithPrefix,
    // Compat: no Cesium viewer
    get viewer() { return null; },
    get isReady() { return MAP2D.isReady; },
  };
})();
