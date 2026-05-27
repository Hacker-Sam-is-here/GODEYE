// ============================================================
//  GODEYE — Layer: Critical Infrastructure (Nuclear, Chokepoints)
// ============================================================
const LayerInfrastructure = (() => {
  const SRC   = 'wv-infra';
  const LAYER = 'wv-infra-layer';
  const LAYER_LABELS = 'wv-infra-labels';

  const TYPE_COLOR = {
    nuclear:    '#76ff03',
    energy:     '#ff9100',
    chokepoint: '#00e5ff',
  };
  const TYPE_ICON = {
    nuclear:    'â˜¢',
    energy:     '⚡',
    chokepoint: 'âš“',
  };

  function _render2D() {
    const features = INFRASTRUCTURE_SITES.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        ...s,
        color: TYPE_COLOR[s.type] || '#aaa',
        icon: TYPE_ICON[s.type] || 'â—',
      }
    }));
    const geojson = { type: 'FeatureCollection', features };
    MAP2D.setSource(SRC, geojson);

    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER, type: 'symbol', source: SRC,
          layout: {
            'icon-image': 'icon-infra',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.32, 6, 0.55, 12, 0.80],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': ['get', 'color'],
          }
        });
        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          const statusColor = {
            OPERATIONAL: 'vb', ACTIVE: 'vb', OCCUPIED: 'vr',
            DAMAGED: 'vr', 'HIGH RISK': 'va', CRITICAL: 'va', MONITORED: 'v',
          }[p.status] || 'v';
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">${p.icon} ${p.name.toUpperCase()}</div>
             <div class="popup-row"><span class="k">TYPE</span><span class="va">${p.type.toUpperCase()}</span></div>
             <div class="popup-row"><span class="k">COUNTRY</span><span class="v">${p.country}</span></div>
             <div class="popup-row"><span class="k">STATUS</span><span class="${statusColor}">${p.status}</span></div>
             <div class="popup-row"><span class="k">COORDS</span><span class="vb">${parseFloat(p.lat).toFixed(3)}, ${parseFloat(p.lng).toFixed(3)}</span></div>`
          );
          EventBus.emit('sigint:log', { cat: 'INFRA', msg: `FACILITY QUERIED: ${p.name} [${p.status}]` });
        });
      }
      if (!m.getLayer(LAYER_LABELS)) {
        m.addLayer({
          id: LAYER_LABELS, type: 'symbol', source: SRC,
          layout: {
            'text-field': ['concat', ['get', 'icon'], ' ', ['get', 'name']],
            'text-size': 9,
            'text-offset': [0, 1.3],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': '#000',
            'text-halo-width': 1.5,
          }
        });
      }
    });

    STATE.setLayerCount('infrastructure', INFRASTRUCTURE_SITES.length);
    STATE.setLayerOnline('infrastructure', true);
  }

  return {
    init() {
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.infrastructure.active) _render2D();
      });
    },
    toggle(active) {
      if (active) {
        _render2D();
      } else {
        MAP2D.removeLayer(LAYER);
        MAP2D.removeLayer(LAYER_LABELS);
        MAP2D.clearSource(SRC);
        STATE.setLayerCount('infrastructure', 0);
      }
    },
  };
})();

