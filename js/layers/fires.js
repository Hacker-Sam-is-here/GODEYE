// ============================================================
//  GODEYE — Layer: Active Wildfires (NASA FIRMS)
// ============================================================
const LayerFires = (() => {
  const SRC   = 'wv-fires';
  const LAYER = 'wv-fires-layer';
  const HEAT  = 'wv-fires-heat';

  async function _fetch() {
    try {
      // NASA FIRMS public CSV (VIIRS 24h, no key needed for public area endpoint)
      const url = CONFIG.FIRMS_API_KEY
        ? `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${CONFIG.FIRMS_API_KEY}/VIIRS_SNPP_NRT/-180,-90,180,90/1`
        : 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';

      const res  = await fetch(url);
      if (!res.ok) throw new Error('FIRMS fetch failed');
      const text = await res.text();
      const lines = text.trim().split('\n').slice(1); // skip header

      const features = [];
      lines.forEach(line => {
        const cols = line.split(',');
        const lat  = parseFloat(cols[0]);
        const lng  = parseFloat(cols[1]);
        const frp  = parseFloat(cols[12] || cols[10] || 0); // fire radiative power
        const conf = cols[8] || 'n';
        if (isNaN(lat) || isNaN(lng)) return;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { frp: frp || 1, confidence: conf, lat, lng }
        });
      });

      STATE.data.fires = features;
      STATE.setLayerCount('fires', features.length);
      STATE.setLayerOnline('fires', true);
      _render2D(features);
      EventBus.emit('alerts:add', {
        type: 'fire', icon: '🔥', level: 'high',
        msg: `NASA FIRMS: ${features.length} active fire hotspots detected globally.`,
        ts: Date.now()
      });
    } catch(e) {
      STATE.setLayerOnline('fires', false);
      console.warn('[Fires] fetch failed:', e.message);
    }
  }

  function _render2D(features) {
    const geojson = { type: 'FeatureCollection', features };
    MAP2D.setSource(SRC, geojson);
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      // Heatmap
      if (!m.getLayer(HEAT)) {
        m.addLayer({
          id: HEAT,
          type: 'heatmap',
          source: SRC,
          maxzoom: 9,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0, 100, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(255,200,0,0)',
              0.2, 'rgba(255,120,0,0.5)',
              0.5, 'rgba(255,60,0,0.8)',
              0.8, 'rgba(200,0,0,0.9)',
              1,   'rgba(255,0,0,1)'
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 18],
            'heatmap-opacity': 0.8,
          }
        });
      }
      // Dot layer at high zoom
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER,
          type: 'circle',
          source: SRC,
          minzoom: 7,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 4, 200, 12],
            'circle-color': '#ff4400',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffaa00',
          }
        });
        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">🔥 ACTIVE FIRE</div>
             <div class="popup-row"><span class="k">COORDS</span><span class="v">${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}</span></div>
             <div class="popup-row"><span class="k">FRP</span><span class="va">${p.frp} MW</span></div>
             <div class="popup-row"><span class="k">CONFIDENCE</span><span class="v">${p.confidence}</span></div>
             <div class="popup-row"><span class="k">SOURCE</span><span class="vb">NASA FIRMS / VIIRS</span></div>`
          );
        });
      }
    });
  }

  return {
    init() {
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.fires.active && STATE.data.fires.length) _render2D(STATE.data.fires);
      });
    },
    toggle(active) {
      if (active) {
        _fetch();
        API.schedule('fires', _fetch, CONFIG.REFRESH_MS.FIRES, 0);
      } else {
        API.cancel('fires');
        MAP2D.removeLayer(LAYER);
        MAP2D.removeLayer(HEAT);
        MAP2D.clearSource(SRC);
        STATE.setLayerCount('fires', 0);
      }
    },
    refresh: _fetch,
  };
})();



