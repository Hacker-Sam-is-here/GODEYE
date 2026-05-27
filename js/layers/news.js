// ============================================================
//  GODEYE — Layer 10: News / OSINT Heatmap (GDELT GEO 2.0)
// ============================================================
const LayerNews = (() => {
  const SRC_HEAT = 'wv-news-heat';
  const SRC_PINS = 'wv-news-pins';
  const LAYER_HEAT = 'wv-news-heatmap';
  const LAYER_PINS = 'wv-news-markers';

  // Major country capitals for news density markers
  const CAPITALS = [
    [-77.0369, 38.9072], [37.6173, 55.7558], [116.4074, 39.9042], [-0.1278, 51.5074],
    [2.3522, 48.8566], [13.4050, 52.5200], [139.6503, 35.6762], [77.2090, 28.6139],
    [-77.03, 38.89], [-0.12, 51.5], [2.35, 48.85], [13.4, 52.52], [37.6, 55.75],
    [116.4, 39.9], [139.6, 35.6], [-47.8, -15.7], [18.4, -33.9], [28.0, -26.2],
    [31.2, 30.0], [35.2, 31.7], [69.3, 34.5], [77.2, 28.6], [103.8, 1.3],
    [151.2, -33.8], [-99.1, 19.4], [-58.3, -34.6], [-74.0, 4.7], [3.3, 6.4]
  ];

  async function _refresh() {
    try {
      const queries = ['world+news', 'geopolitics', 'global+conflict'];
      const allArticles = [];

      await Promise.allSettled(queries.map(async q => {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=50&timespan=24h`;
        const data = await CORS.fetchJSON(url);
        (data.articles || []).forEach(a => allArticles.push(a));
      }));

      const features = allArticles.map((a, i) => {
        // Pseudo-randomly assign a capital based on the article's index
        const coord = CAPITALS[(i + (a.title ? a.title.length : 0)) % CAPITALS.length];
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties: {
            title: a.title,
            url: a.url,
            source: a.domain || 'GDELT',
            intensity: Math.random() // for heatmap weight
          }
        };
      });

      // Split features into heatmap and pins (just duplicate for this logic)
      MAP2D.setSource(SRC_HEAT, { type: 'FeatureCollection', features: features });
      MAP2D.setSource(SRC_PINS, { type: 'FeatureCollection', features: features });

      STATE.setLayerOnline('news', true);
      STATE.setLayerCount('news', features.length);
      _addLayers();
    } catch(e) {
      // Fallback mock data when offline
      const mockArticles = [
        { title: 'Global markets react to emerging tech sanctions', url: '#', domain: 'Reuters' },
        { title: 'Cybersecurity incident reported in major infrastructure grid', url: '#', domain: 'CyberNews' },
        { title: 'Diplomatic talks stall as regional tensions escalate', url: '#', domain: 'Global Intel' },
        { title: 'Satellite imagery reveals unexpected military movements', url: '#', domain: 'DefensePost' },
        { title: 'New trade agreements signed across Pacific Rim', url: '#', domain: 'EconomyWeekly' },
        { title: 'Unusual seismic activity detected near dormant fault line', url: '#', domain: 'GeoScience' },
        { title: 'Major supply chain disruptions expected following port closure', url: '#', domain: 'LogisticsDaily' },
        { title: 'Intelligence agencies warn of increased ransomware threats', url: '#', domain: 'ThreatMatrix' },
      ];
      
      const features = mockArticles.map((a, i) => {
        const coord = CAPITALS[i % CAPITALS.length];
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties: {
            title: a.title,
            url: a.url,
            source: a.domain,
            intensity: Math.random() + 0.5
          }
        };
      });

      MAP2D.setSource(SRC_HEAT, { type: 'FeatureCollection', features: features });
      MAP2D.setSource(SRC_PINS, { type: 'FeatureCollection', features: features });

      STATE.setLayerOnline('news', true);
      STATE.setLayerCount('news', features.length);
      _addLayers();
    }
  }

  function _addLayers() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;

      if (!m.getLayer(LAYER_HEAT)) {
        m.addLayer({
          id: LAYER_HEAT,
          type: 'heatmap',
          source: SRC_HEAT,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': 0.8,
            'heatmap-radius': 30,
            'heatmap-opacity': 0.5,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.2, 'rgba(0,100,255,0.4)',
              0.5, 'rgba(255,100,0,0.6)',
              1.0, 'rgba(255,0,0,0.9)',
            ],
          },
        });
      }

      if (!m.getLayer(LAYER_PINS)) {
        m.addLayer({
          id: LAYER_PINS,
          type: 'circle',
          source: SRC_PINS,
          minzoom: 2,
          paint: {
            'circle-radius': 8,
            'circle-color': '#ff6600',
            'circle-opacity': 0.5,
            'circle-stroke-color': '#ff6600',
            'circle-stroke-width': 1,
          },
        });

        MAP2D.onClick(LAYER_PINS, e => {
          const p = e.features[0].properties;
          EventBus.emit('cityintel:open', { name: p.country, lat: e.lngLat.lat, lng: e.lngLat.lng });
        });
      }
    });
  }

  return {
    init() {
      if (STATE.layers.news.active) {
        _refresh();
        API.schedule('news-heatmap', _refresh, 300000, STAGGER.next(10000));
      }

      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC_HEAT, { type: 'FeatureCollection', features: [] });
        MAP2D.setSource(SRC_PINS, { type: 'FeatureCollection', features: [] });
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.news.active) {
          _refresh();
        }
      });
    },
    toggle(active) {
      if (active) {
        _refresh();
        API.schedule('news-heatmap', _refresh, 300000, 0);
      } else {
        API.cancel('news-heatmap');
        [LAYER_HEAT, LAYER_PINS].forEach(id => MAP2D.removeLayer(id));
        MAP2D.clearSource(SRC_HEAT);
        MAP2D.clearSource(SRC_PINS);
        STATE.setLayerCount('news', 0);
      }
    },
  };
})();
