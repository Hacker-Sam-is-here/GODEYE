// ============================================================
//  GODEYE — Layer: GPS Jamming Zones
// ============================================================
const LayerGPSJamming = (() => {
  const SRC_FILL   = 'wv-gps-jam-fill';
  const SRC_POINTS = 'wv-gps-jam-pts';
  const LAYER_FILL = 'wv-gps-jam-fill-layer';
  const LAYER_LINE = 'wv-gps-jam-line-layer';
  const LAYER_PTS  = 'wv-gps-jam-pts-layer';

  const SEV_COLOR = { severe: '#ff1744', moderate: '#ff9100', low: '#ffd600' };

  function _circlePolygon(lat, lng, radiusKm, steps = 48) {
    const ring = Array.from({ length: steps + 1 }, (_, i) => {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat  = (radiusKm / 111.32) * Math.sin(angle);
      const dLng  = (radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.cos(angle);
      return [lng + dLng, lat + dLat];
    });
    return [ring];
  }

  function _buildGeoJSON() {
    const fillFeatures  = GPS_JAM_ZONES.map(z => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: _circlePolygon(z.lat, z.lng, z.radius) },
      properties: { ...z, color: SEV_COLOR[z.severity] || '#aaa' }
    }));
    const ptFeatures = GPS_JAM_ZONES.map(z => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [z.lng, z.lat] },
      properties: { ...z, color: SEV_COLOR[z.severity] || '#aaa' }
    }));
    return {
      fill: { type: 'FeatureCollection', features: fillFeatures },
      pts:  { type: 'FeatureCollection', features: ptFeatures },
    };
  }

  function _render2D() {
    const gj = _buildGeoJSON();
    MAP2D.setSource(SRC_FILL,   gj.fill);
    MAP2D.setSource(SRC_POINTS, gj.pts);

    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER_FILL)) {
        m.addLayer({
          id: LAYER_FILL, type: 'fill', source: SRC_FILL,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.08,
          }
        });
      }
      if (!m.getLayer(LAYER_LINE)) {
        m.addLayer({
          id: LAYER_LINE, type: 'line', source: SRC_FILL,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 1.5,
            'line-opacity': 0.7,
            'line-dasharray': [4, 3],
          }
        });
      }
      if (!m.getLayer(LAYER_PTS)) {
        m.addLayer({
          id: LAYER_PTS, type: 'circle', source: SRC_POINTS,
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#000',
          }
        });
        MAP2D.onClick(LAYER_PTS, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">📡 GPS JAMMING — ${p.name.toUpperCase()}</div>
             <div class="popup-row"><span class="k">SEVERITY</span><span class="vr">${p.severity.toUpperCase()}</span></div>
             <div class="popup-row"><span class="k">RADIUS</span><span class="va">${p.radius} km</span></div>
             <div class="popup-row"><span class="k">INTEL</span><span class="v">${p.note}</span></div>
             <div class="popup-row"><span class="k">SOURCE</span><span class="vb">GPSJam.org / OSINT</span></div>`
          );
        });
      }
    });
    STATE.setLayerCount('gps_jamming', GPS_JAM_ZONES.length);
    STATE.setLayerOnline('gps_jamming', true);
  }

  return {
    init() {
      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC_FILL,   { type: 'FeatureCollection', features: [] });
        MAP2D.setSource(SRC_POINTS, { type: 'FeatureCollection', features: [] });
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.gps_jamming.active) _render2D();
      });
    },
    toggle(active) {
      if (active) {
        _render2D();
      } else {
        [LAYER_FILL, LAYER_LINE, LAYER_PTS].forEach(l => MAP2D.removeLayer(l)); MAP2D.clearSource(SRC_CIRCLES); MAP2D.clearSource(SRC_POINTS);;
        STATE.setLayerCount('gps_jamming', 0);
      }
    },
  };
})();

