// ============================================================
//  GODEYE — Layer: Severe Weather (NASA EONET)
// ============================================================
const LayerWeather = (() => {
  const SRC   = 'wv-weather';
  const LAYER = 'wv-weather-layer';

  const CATEGORY_ICONS = {
    'Severe Storms':    '🌪',
    'Wildfires':        '🔥',
    'Floods':           '🌊',
    'Earthquakes':      '🌍',
    'Volcanoes':        '🌋',
    'Drought':          'â˜€',
    'Landslides':       '⛰',
    'Snow':             'â„',
    'Sea and Lake Ice': '🧊',
    'Temperature Extremes': 'ðŸŒ¡',
  };

  function _catColor(cat) {
    const map = {
      'Severe Storms': '#9b59b6',
      'Wildfires': '#e74c3c',
      'Floods': '#3498db',
      'Volcanoes': '#e67e22',
      'Snow': '#ecf0f1',
      'Earthquakes': '#f39c12',
    };
    return map[cat] || '#00aaff';
  }

  async function _fetch() {
    try {
      const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=150&days=14';
      const data = await CORS.fetchJSON(url);
      if (!data || !data.events) throw new Error('No EONET data');

      const features = [];
      data.events.forEach(ev => {
        const geo = ev.geometry && ev.geometry[0];
        if (!geo) return;
        const [lng, lat] = geo.coordinates;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const cat = ev.categories[0]?.title || 'Unknown';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id: ev.id,
            title: ev.title,
            category: cat,
            icon: CATEGORY_ICONS[cat] || '⚠',
            color: _catColor(cat),
            date: geo.date,
            link: ev.sources[0]?.url || '',
          }
        });
      });

      STATE.data.weather = features;
      STATE.setLayerCount('weather', features.length);
      STATE.setLayerOnline('weather', true);
      _render2D(features);

      // Push severe storms to alerts
      features.filter(f => f.properties.category === 'Severe Storms').slice(0, 3).forEach(f => {
        EventBus.emit('alerts:add', {
          type: 'weather', icon: '🌪', level: 'medium',
          msg: f.properties.title,
          lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
          ts: Date.now()
        });
      });
    } catch(e) {
      STATE.setLayerOnline('weather', false);
      console.warn('[Weather] fetch failed:', e.message);
    }
  }

  function _render2D(features) {
    const geojson = { type: 'FeatureCollection', features };
    MAP2D.setSource(SRC, geojson);
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 10, 12],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 0.5,
          }
        });
        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">${p.icon} ${p.category.toUpperCase()}</div>
             <div class="popup-row"><span class="k">EVENT</span><span class="v">${p.title}</span></div>
             <div class="popup-row"><span class="k">DATE</span><span class="va">${p.date ? p.date.slice(0,10) : 'N/A'}</span></div>
             <div class="popup-row"><span class="k">SOURCE</span><span class="vb">NASA EONET</span></div>
             ${p.link ? `<div class="popup-row"><span class="k">LINK</span><a href="${p.link}" target="_blank" style="color:var(--blue);font-size:0.65rem">VIEW DATA â†—</a></div>` : ''}`
          );
        });
      }
    });
  }

  return {
    init() {
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.weather.active && STATE.data.weather.length) _render2D(STATE.data.weather);
      });
    },
    toggle(active) {
      if (active) {
        _fetch();
        API.schedule('weather', _fetch, CONFIG.REFRESH_MS.WEATHER, 0);
      } else {
        API.cancel('weather');
        MAP2D.removeLayer(LAYER); MAP2D.clearSource(SRC);
        STATE.setLayerCount('weather', 0);
      }
    },
    refresh: _fetch,
  };
})();


