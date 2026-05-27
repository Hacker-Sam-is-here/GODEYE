// ============================================================
//  GODEYE — Layer: Day/Night Terminator (SunCalc)
// ============================================================
const LayerDayNight = (() => {
  const SRC   = 'wv-daynight';
  const LAYER = 'wv-daynight-layer';
  let _interval = null;

  // Generate terminator polygon using SunCalc
  function _buildTerminator() {
    const now = new Date();
    const points = [];
    for (let lng = -180; lng <= 180; lng += 2) {
      const pos = SunCalc.getPosition(now, 0, lng);
      // Find the latitude where the sun is at the horizon (altitude=0)
      // Binary search for the terminator latitude at each longitude
      let lo = -90, hi = 90;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const alt = SunCalc.getPosition(now, mid, lng).altitude;
        if (alt > 0) lo = mid; else hi = mid;
      }
      points.push([lng, (lo + hi) / 2]);
    }

    // Determine which side is night
    const sunPos = SunCalc.getPosition(now, 0, 0);
    const nightIsNorth = sunPos.altitude < 0;

    // Build a polygon covering the night side
    const termLats = points.map(p => p[1]);
    const ring = [
      ...points,
      [180, nightIsNorth ? 90 : -90],
      [-180, nightIsNorth ? 90 : -90],
      points[0],
    ];

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {}
      }]
    };
  }

  function _render2D() {
    const gj = _buildTerminator();
    MAP2D.setSource(SRC, gj);
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER, type: 'fill', source: SRC,
          paint: {
            'fill-color': '#000033',
            'fill-opacity': 0.35,
          }
        }, 'wv-aircraft-icons'); // insert below aircraft so planes stay visible
      }
    });
    STATE.setLayerOnline('day_night', true);
  }

  function _update() {
    if (!STATE.layers.day_night.active) return;
    const gj = _buildTerminator();
    MAP2D.setSource(SRC, gj);
  }

  return {
    init() {
      if (typeof SunCalc === 'undefined') {
        console.warn('[DayNight] SunCalc not loaded — layer unavailable');
        return;
      }
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.day_night.active) _render2D();
      });
    },
    toggle(active) {
      if (active) {
        _render2D();
        _interval = setInterval(_update, 60000); // update every minute
      } else {
        MAP2D.removeLayer(LAYER);
        MAP2D.clearSource(SRC);
        if (_interval) { clearInterval(_interval); _interval = null; }
        STATE.setLayerOnline('day_night', false);
      }
    },
  };
})();

