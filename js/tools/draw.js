// ============================================================
//  GODEYE — Draw & Measure Tools
// ============================================================
const DrawTool = (() => {
  let _currentTool = 'none';
  let _draws = JSON.parse(localStorage.getItem('wv_draws') || '[]');
  let _drawPoints = [];
  let _drawMarkers = [];
  let _drawSources = {};

  function _activateTool(tool) {
    _currentTool = tool;
    STATE.currentTool = tool;
    document.querySelectorAll('.draw-btn[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    if (MAP2D.map) {
      MAP2D.map.getCanvas().style.cursor = tool === 'none' ? '' : 'crosshair';
    }
    if (tool === 'none') {
      _drawPoints = [];
      _clearTempMarkers();
    }
  }

  function _clearTempMarkers() {
    _drawMarkers.forEach(m => m.remove?.());
    _drawMarkers = [];
  }

  function _handleMapClick(e) {
    if (_currentTool === 'none') return;
    const { lat, lng } = e.lngLat;
    _drawPoints.push([lng, lat]);

    // Add temp dot
    const el = document.createElement('div');
    el.style.cssText = 'width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);';
    const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(MAP2D.map);
    _drawMarkers.push(marker);

    if (_currentTool === 'circle' && _drawPoints.length === 1) {
      // Need 2nd point for radius
      EventBus.emit('sigint:log', { cat: 'DRAW', msg: 'CIRCLE: CLICK SECOND POINT TO SET RADIUS' });
    }
    if (_currentTool === 'circle' && _drawPoints.length === 2) {
      const [c, r] = _drawPoints;
      const radiusKm = GEO.distanceKm(c[1], c[0], r[1], r[0]);
      _finishCircle(c[1], c[0], radiusKm);
    }
    if (_currentTool === 'line' && _drawPoints.length >= 2) {
      _updateMeasureLine();
    }
  }

  function _handleDblClick(e) {
    if (_currentTool === 'polygon' && _drawPoints.length >= 3) {
      _finishPolygon([..._drawPoints, _drawPoints[0]]);
    }
    if (_currentTool === 'line' && _drawPoints.length >= 2) {
      _finishLine(_drawPoints);
    }
  }

  function _finishCircle(lat, lng, radiusKm) {
    const id = 'draw-circle-' + Date.now();
    const geojson = GEO.circleGeoJSON(lat, lng, radiusKm);
    geojson.properties = { id, type: 'circle', label: `⊙ ${radiusKm.toFixed(1)} km`, radiusKm };

    _draws.push(geojson);
    _renderDraw(id, geojson);
    _clearTempMarkers();
    _drawPoints = [];
    _saveDrws();
    _activateTool('none');
    EventBus.emit('sigint:log', { cat: 'DRAW', msg: `CIRCLE: RADIUS ${radiusKm.toFixed(1)} km — CENTER ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }

  function _finishPolygon(points) {
    const id = 'draw-poly-' + Date.now();
    // Area calc (simple shoelace)
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
      area += points[i][0] * points[i+1][1] - points[i+1][0] * points[i][1];
    }
    area = Math.abs(area) / 2 * 12365.1613; // rough km²

    const geojson = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [points] },
      properties: { id, type: 'polygon', label: `⬡ ${area.toFixed(0)} km²`, area },
    };
    _draws.push(geojson);
    _renderDraw(id, geojson);
    _clearTempMarkers();
    _drawPoints = [];
    _saveDrws();
    _activateTool('none');
    EventBus.emit('sigint:log', { cat: 'DRAW', msg: `POLYGON: AREA ~${area.toFixed(0)} km²` });
  }

  function _updateMeasureLine() {
    const id = 'draw-line-temp';
    MAP2D.setSource(id, { type: 'FeatureCollection', features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: _drawPoints },
      properties: {},
    }]});
    MAP2D.whenReady(() => {
      if (!MAP2D.map.getLayer(id)) {
        MAP2D.map.addLayer({
          id, type: 'line', source: id,
          paint: { 'line-color': '#ffff00', 'line-width': 2, 'line-dasharray': [3,2] },
        });
      }
    });
  }

  function _finishLine(points) {
    let totalKm = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalKm += GEO.distanceKm(points[i][1], points[i][0], points[i+1][1], points[i+1][0]);
    }
    const id = 'draw-line-' + Date.now();
    const geojson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points },
      properties: { id, type: 'line', label: `↔ ${totalKm.toFixed(1)} km`, km: totalKm },
    };
    _draws.push(geojson);
    _renderDraw(id, geojson);
    // Remove temp
    MAP2D.removeLayer('draw-line-temp');
    MAP2D.removeSource('draw-line-temp');
    _clearTempMarkers();
    _drawPoints = [];
    _saveDrws();
    _activateTool('none');
    EventBus.emit('sigint:log', { cat: 'DRAW', msg: `LINE: DISTANCE ${totalKm.toFixed(1)} km (${(totalKm * 0.621371).toFixed(1)} mi)` });
  }

  function _renderDraw(id, geojson) {
    MAP2D.setSource(id, { type: 'FeatureCollection', features: [geojson] });
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      const isLine = geojson.geometry.type === 'LineString';
      const isPoly = geojson.geometry.type === 'Polygon';

      if (isPoly) {
        m.addLayer({ id: `${id}-fill`, type: 'fill', source: id,
          paint: { 'fill-color': '#00ff41', 'fill-opacity': 0.08 } });
        m.addLayer({ id: `${id}-line`, type: 'line', source: id,
          paint: { 'line-color': '#00ff41', 'line-width': 1.5, 'line-dasharray': [3,2] } });
      }
      if (isLine) {
        m.addLayer({ id: `${id}-line`, type: 'line', source: id,
          paint: { 'line-color': '#ffff00', 'line-width': 2 } });
      }
      // Label
      m.addLayer({ id: `${id}-label`, type: 'symbol', source: id,
        layout: { 'text-field': geojson.properties.label || '', 'text-size': 11 },
        paint: { 'text-color': '#00ff41', 'text-halo-color': '#000', 'text-halo-width': 1.5 } });

      // Right-click delete
      m.on('contextmenu', `${id}-line`, () => _deleteDraw(id));
      m.on('contextmenu', `${id}-fill`, () => _deleteDraw(id));
    });
    _drawSources[id] = geojson;
  }

  function _deleteDraw(id) {
    ['fill','line','label'].forEach(suffix => MAP2D.removeLayer(`${id}-${suffix}`));
    MAP2D.removeSource(id);
    delete _drawSources[id];
    _draws = _draws.filter(d => d.properties.id !== id);
    _saveDrws();
  }

  function _clearAll() {
    Object.keys(_drawSources).forEach(id => _deleteDraw(id));
    _draws = [];
    _saveDrws();
    _drawPoints = [];
    _clearTempMarkers();
  }

  function _exportGeoJSON() {
    const fc = { type: 'FeatureCollection', features: _draws };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GODEYE-draws-${Date.now()}.geojson`;
    a.click();
  }

  function _saveDrws() {
    try { localStorage.setItem('wv_draws', JSON.stringify(_draws)); } catch(e) {}
  }

  function _restoreDraws() {
    _draws.forEach(d => _renderDraw(d.properties.id, d));
  }

  return {
    init() {
      document.querySelectorAll('.draw-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => _activateTool(btn.dataset.tool));
      });

      document.getElementById('btn-clear-draws')?.addEventListener('click', _clearAll);
      document.getElementById('btn-export-draws')?.addEventListener('click', _exportGeoJSON);

      EventBus.on('map2d:ready', () => {
        MAP2D.map.on('click', _handleMapClick);
        MAP2D.map.on('dblclick', _handleDblClick);
        // Prevent map zoom on dblclick when drawing
        MAP2D.map.on('dblclick', e => { if (_currentTool !== 'none') e.preventDefault(); });
        _restoreDraws();
      });
    },
  };
})();
