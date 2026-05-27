// ============================================================
//  GODEYE — Layer: War / Active Conflict Alert Zones
// ============================================================
const LayerWarAlerts = (() => {
  const SRC_POINTS   = 'wv-war-points';
  const SRC_CIRCLES  = 'wv-war-circles';
  const LAYER_POINTS = 'wv-war-points-layer';
  const LAYER_FILL   = 'wv-war-fill';
  const LAYER_BORDER = 'wv-war-border';
  const LAYER_LABELS = 'wv-war-labels';

  const SEVERITY_COLOR = {
    ACTIVE_WAR:   '#ff1744',
    HIGH_TENSION: '#ff9100',
    ELEVATED:     '#ffd600',
  };
  const SEVERITY_OPACITY = {
    ACTIVE_WAR:   0.15,
    HIGH_TENSION: 0.10,
    ELEVATED:     0.06,
  };

  function _buildGeoJSON() {
    const features = WAR_ZONES.map((z, i) => {
      // Create a circle polygon approximation (32 pts)
      const radiusDeg = 2.5; // ~280km radius for display
      const steps = 32;
      const ring = Array.from({ length: steps + 1 }, (_, j) => {
        const angle = (j / steps) * 2 * Math.PI;
        return [
          z.lng + radiusDeg * 1.5 * Math.cos(angle),
          z.lat + radiusDeg * Math.sin(angle),
        ];
      });
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { ...z, index: i }
      };
    });
    return { type: 'FeatureCollection', features };
  }

  function _buildPointsGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: WAR_ZONES.map((z, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [z.lng, z.lat] },
        properties: { ...z, index: i }
      }))
    };
  }

  function _render2D() {
    const circlesGJ = _buildGeoJSON();
    const pointsGJ  = _buildPointsGeoJSON();
    MAP2D.setSource(SRC_CIRCLES, circlesGJ);
    MAP2D.setSource(SRC_POINTS, pointsGJ);

    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;

      if (!m.getLayer(LAYER_FILL)) {
        m.addLayer({
          id: LAYER_FILL, type: 'fill', source: SRC_CIRCLES,
          paint: {
            'fill-color': ['match', ['get', 'severity'],
              'ACTIVE_WAR',   '#ff1744',
              'HIGH_TENSION', '#ff9100',
              'ELEVATED',     '#ffd600',
              '#888'],
            'fill-opacity': ['match', ['get', 'severity'],
              'ACTIVE_WAR',   0.14,
              'HIGH_TENSION', 0.09,
              'ELEVATED',     0.05,
              0.05],
          }
        }, LAYER_POINTS); // insert below points
      }
      if (!m.getLayer(LAYER_BORDER)) {
        m.addLayer({
          id: LAYER_BORDER, type: 'line', source: SRC_CIRCLES,
          paint: {
            'line-color': ['match', ['get', 'severity'],
              'ACTIVE_WAR',   '#ff1744',
              'HIGH_TENSION', '#ff9100',
              'ELEVATED',     '#ffd600',
              '#888'],
            'line-width': 1.5,
            'line-opacity': 0.7,
            'line-dasharray': [3, 2],
          }
        });
      }
      if (!m.getLayer(LAYER_POINTS)) {
        m.addLayer({
          id: LAYER_POINTS, type: 'circle', source: SRC_POINTS,
          paint: {
            'circle-radius': 7,
            'circle-color': ['match', ['get', 'severity'],
              'ACTIVE_WAR',   '#ff1744',
              'HIGH_TENSION', '#ff9100',
              'ELEVATED',     '#ffd600',
              '#aaa'],
            'circle-opacity': 0.95,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 0.6,
          }
        });
        MAP2D.onClick(LAYER_POINTS, e => {
          const p = e.features[0].properties;
          const sevLabel = {
            ACTIVE_WAR: '🔴 ACTIVE WAR',
            HIGH_TENSION: 'ðŸŸ  HIGH TENSION',
            ELEVATED: 'ðŸŸ¡ ELEVATED',
          }[p.severity] || p.severity;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">💥 ${p.name.toUpperCase()}</div>
             <div class="popup-row"><span class="k">STATUS</span><span class="vr">${sevLabel}</span></div>
             <div class="popup-row"><span class="k">INTEL</span><span class="v" style="white-space:normal;line-height:1.4;">${p.description}</span></div>
             <div class="popup-row"><span class="k">COORDS</span><span class="vb">${parseFloat(p.lat).toFixed(2)}°, ${parseFloat(p.lng).toFixed(2)}°</span></div>`
          );
          AUDIO.alert?.();
          EventBus.emit('sigint:log', { cat: 'WAR', msg: `ZONE SELECTED: ${p.name} — ${p.severity}` });
        });
      }
      if (!m.getLayer(LAYER_LABELS)) {
        m.addLayer({
          id: LAYER_LABELS, type: 'symbol', source: SRC_POINTS,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 9,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#ffcccc',
            'text-halo-color': '#000',
            'text-halo-width': 1.5,
          }
        });
      }
    });

    STATE.setLayerCount('war_alerts', WAR_ZONES.length);
    STATE.setLayerOnline('war_alerts', true);
    // Fire alerts for active wars
    WAR_ZONES.filter(z => z.severity === 'ACTIVE_WAR').forEach(z => {
      EventBus.emit('alerts:add', {
        type: 'conflict', icon: '💥', level: 'critical',
        msg: `ACTIVE WAR: ${z.name} — ${z.description.slice(0, 80)}`,
        lat: z.lat, lng: z.lng, ts: Date.now()
      });
    });
  }

  return {
    init() {
      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC_CIRCLES, { type: 'FeatureCollection', features: [] });
        MAP2D.setSource(SRC_POINTS,  { type: 'FeatureCollection', features: [] });
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.war_alerts.active) _render2D();
      });
    },
    toggle(active) {
      if (active) {
        _render2D();
      } else {
        [LAYER_FILL, LAYER_BORDER, LAYER_POINTS, LAYER_LABELS].forEach(l => MAP2D.removeLayer(l)); MAP2D.clearSource(SRC_CIRCLES); MAP2D.clearSource(SRC_POINTS);
        STATE.setLayerCount('war_alerts', 0);
      }
    },
  };
})();


