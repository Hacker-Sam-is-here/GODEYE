// ============================================================
//  GODEYE — Layer 5: Earthquakes & Natural Disasters
// ============================================================
const LayerEarthquakes = (() => {
  const SRC_EQ  = 'wv-earthquakes';
  const SRC_NAT = 'wv-natural';
  const LAYER_EQ   = 'wv-eq-circles';
  const LAYER_NAT  = 'wv-nat-icons';

  const USGS_DAY      = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
  const USGS_MONTH    = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';
  const NASA_EONET    = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';

  function _magToRadius(mag) {
    return Math.max(4, Math.pow(2, mag) * 1.5);
  }

  function _depthColor(depth) {
    if (depth < 10)  return '#ff0000';
    if (depth < 70)  return '#ff6600';
    return '#00aaff';
  }

  async function _fetchEarthquakes() {
    try {
      const data = await CORS.fetchJSON(USGS_DAY);
      if (!data || !data.features) return;

      const features = data.features.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          mag:   f.properties.mag,
          place: f.properties.place,
          time:  f.properties.time,
          url:   f.properties.url,
          depth: f.geometry.coordinates[2],
          radius: _magToRadius(f.properties.mag),
          color:  _depthColor(f.geometry.coordinates[2]),
        },
      })).filter(f => f.properties.mag > 0);

      STATE.data.earthquakes = features;
      STATE.setLayerCount('earthquakes', features.length);
      STATE.setLayerOnline('earthquakes', true);

      // M6.0+ alert
      const big = features.filter(f => f.properties.mag >= 6.0);
      if (big.length) {
        const f = big[0];
        EventBus.emit('alert:show', `🌍 M${f.properties.mag} EARTHQUAKE — ${f.properties.place}`);
        AUDIO.earthquakeRumble();
        EventBus.emit('sigint:log', {
          cat: 'SEISMIC',
          msg: `M${f.properties.mag} — DEPTH ${f.properties.depth}km — ${f.properties.place}`,
          level: 'danger',
        });
      }

      // Log all M4+
      features.filter(f => f.properties.mag >= 4.0).slice(0, 5).forEach(f => {
        EventBus.emit('sigint:log', {
          cat: 'SEISMIC',
          msg: `M${f.properties.mag} — DEPTH ${f.properties.depth}km — ${f.properties.place}`,
        });
      });

      MAP2D.setSource(SRC_EQ, { type: 'FeatureCollection', features });
      _addEQLayer();
      // 3D removed — uses unified MapLibre
      STATE.updateThreatLevel();
    } catch(e) {
      STATE.setLayerOnline('earthquakes', false);
      console.warn('[Earthquakes]', e.message);
    }
  }

  async function _fetchEONET() {
    try {
      const data = await CORS.fetchJSON(NASA_EONET);
      if (!data || !data.events) return;

      const features = [];
      data.events.forEach(ev => {
        const geo = ev.geometry?.[ev.geometry.length - 1];
        if (!geo || geo.type !== 'Point') return;
        const [lng, lat] = geo.coordinates;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id:       ev.id,
            title:    ev.title,
            category: ev.categories?.[0]?.title || 'Event',
            date:     geo.date,
            icon:     _eonetIcon(ev.categories?.[0]?.id),
          },
        });
      });

      MAP2D.setSource(SRC_NAT, { type: 'FeatureCollection', features });
      _addNatLayer();
    } catch(e) { console.warn('[EONET]', e.message); }
  }

  function _eonetIcon(categoryId) {
    const icons = {
      wildfires: '🔥',
      volcanoes: '🌋',
      severeStorms: '🌪',
      seaLakeIce: '🧊',
      floods: '🌊',
      landslides: '⛰',
      manmade: '⚠',
    };
    return icons[categoryId] || '⚡';
  }

  function _addEQLayer() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;

      if (!m.getLayer(LAYER_EQ)) {
        m.addLayer({
          id: LAYER_EQ,
          type: 'symbol',
          source: SRC_EQ,
          layout: {
            'icon-image': 'icon-earthquake',
            'icon-size': [
              'interpolate', ['linear'], ['get', 'mag'],
              3, 0.4,
              7, 1.2
            ],
            'icon-allow-overlap': true,
          },
        });
        MAP2D.onClick(LAYER_EQ, e => {
          const p = e.features[0].properties;
          const d = new Date(p.time);
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
            `<div class="popup-title">🌍 M${p.mag} EARTHQUAKE</div>
             <div class="popup-row"><span class="k">LOCATION</span><span class="v">${p.place}</span></div>
             <div class="popup-row"><span class="k">MAGNITUDE</span><span class="${p.mag >= 6 ? 'vr' : p.mag >= 5 ? 'va' : 'v'}">${p.mag}</span></div>
             <div class="popup-row"><span class="k">DEPTH</span><span class="v">${p.depth} km</span></div>
             <div class="popup-row"><span class="k">TIME</span><span class="v">${d.toUTCString()}</span></div>
             <div class="popup-row"><span class="k">SOURCE</span><span class="vb"><a href="${p.url}" target="_blank" style="color:var(--blue)">USGS →</a></span></div>`
          );
        });
      }
    });
  }

  function _render3D(features) {
    MAP3D.removeAllWithPrefix('eq-');
    features.forEach((f, i) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const mag = parseFloat(p.mag) || 1;
      // Radius scales with magnitude: M3=5km, M5=50km, M7=300km
      const radiusM = Math.pow(3, mag) * 300;
      const color = mag >= 6 ? '#ff0000' : mag >= 5 ? '#ff6600' : mag >= 4 ? '#ffaa00' : '#ffff00';
      MAP3D.addCircle(`eq-${i}`, lat, lng, radiusM, {
        color,
        fillAlpha: 0.1,
        outlineAlpha: 0.85,
        outlineWidth: 2,
        label: `M${mag} ${p.place ? p.place.substring(0,20) : ''}`,
      });
    });
  }

  function _addNatLayer() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m || m.getLayer(LAYER_NAT)) return;
      m.addLayer({
        id: LAYER_NAT,
        type: 'symbol',
        source: SRC_NAT,
        layout: {
          'text-field': ['get', 'icon'],
          'text-size': 18,
          'text-allow-overlap': true,
        },
      });
      MAP2D.onClick(LAYER_NAT, e => {
        const p = e.features[0].properties;
        MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
          `<div class="popup-title">${p.icon} ${p.category}</div>
           <div class="popup-row"><span class="k">EVENT</span><span class="v">${p.title}</span></div>
           <div class="popup-row"><span class="k">DATE</span><span class="v">${GEO.timeAgo(p.date)}</span></div>
           <div class="popup-row"><span class="k">SOURCE</span><span class="vb">NASA EONET</span></div>`
        );
      });
    });
  }

  function _refresh() {
    _fetchEarthquakes();
    _fetchEONET();
  }

  return {
    init() {
      if (STATE.layers.earthquakes.active) {
        _refresh();
        API.schedule('earthquakes', _refresh, CONFIG.REFRESH_MS.EARTHQUAKES, STAGGER.next(3000));
      }

      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC_EQ,  { type: 'FeatureCollection', features: [] });
        MAP2D.setSource(SRC_NAT, { type: 'FeatureCollection', features: [] });
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.earthquakes.active) {
          _refresh();
        }
      });
    },

    toggle(active) {
      if (active) {
        _refresh();
        API.schedule('earthquakes', _refresh, CONFIG.REFRESH_MS.EARTHQUAKES, 0);
      } else {
        API.cancel('earthquakes');
        ['wv-eq-pulse', LAYER_EQ, LAYER_NAT].forEach(id => MAP2D.removeLayer(id)); MAP2D.clearSource(SRC);;
        MAP3D.removeAllWithPrefix('eq-');
        STATE.setLayerCount('earthquakes', 0);
      }
    },
  };
})();


