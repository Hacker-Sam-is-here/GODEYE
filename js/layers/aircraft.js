// ============================================================
//  GODEYE — Layer 1: Live Air Traffic (OpenSky Network)
// ============================================================
const LayerAircraft = (() => {
  const SRC = 'wv-aircraft';
  const LAYER_ICONS = 'wv-aircraft-icons';
  const LAYER_CLUSTERS = 'wv-aircraft-clusters';
  let _lastFetch = 0;
  const _flightPaths = {}; // icao24 -> array of [lng, lat, alt]

  async function _fetch() {
    try {
      // Always use MAP2D bounds (unified 3D MapLibre engine)
      const bounds    = MAP2D.getBounds() || { south: -60, north: 60, west: -180, east: 180 };
      const centerLat = (bounds.south + bounds.north) / 2;
      const centerLon = (bounds.west  + bounds.east)  / 2;
      const radius    = 350;

      // Source 1 — adsb.lol (primary, high rate-limit)
      let data = null;
      try {
        data = await CORS.fetchJSON(
          `https://api.adsb.lol/v2/lat/${centerLat.toFixed(3)}/lon/${centerLon.toFixed(3)}/dist/${radius}`
        );
      } catch(e) {}

      // Source 2 — OpenSky Network (fallback, free anonymous)
      if (!data?.ac?.length) {
        try {
          const b   = bounds;
          const res = await fetch(
            `https://opensky-network.org/api/states/all?lamin=${b.south.toFixed(2)}&lomin=${b.west.toFixed(2)}&lamax=${b.north.toFixed(2)}&lomax=${b.east.toFixed(2)}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const os = await res.json();
          if (os?.states) {
            data = {
              ac: os.states.filter(s => s[6] && s[5]).map(s => ({
                hex: s[0], flight: (s[1] || '').trim(), lat: s[6], lon: s[5],
                alt_baro: s[7] ? s[7] / 0.3048 : 0,
                gs: s[9] ? s[9] * 1.944 : 0,
                track: s[10] || 0, baro_rate: s[11] || 0, _src: 'opensky'
              }))
            };
          }
        } catch(e) {}
      }

      if (!data?.ac) throw new Error('No aircraft states from any source');

      const features = [];
      const currentIcaos = new Set();

      data.ac.forEach(s => {
        if (!s.lat || !s.lon) return;

        const icao24 = s.hex || '000000';
        const callsign = (s.flight || s.r || icao24).trim();
        const lat = s.lat;
        const lng = s.lon;
        const altBaro = (s.alt_baro || 0) * 0.3048; // ft to meters
        const velocity = s.gs || 0;
        const heading = s.track || 0;
        const vertRate = s.baro_rate || 0;
        const onGround = altBaro < 10;
        const isMil = (s.dbFlags !== undefined && s.dbFlags > 0) || (s.category && s.category.includes('A5'));
        const color = isMil ? '#ff0000' : GEO.altitudeColor(altBaro);

        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            icao24, callsign, country: '',
            alt: Math.round(altBaro),
            speed: Math.round(velocity),
            heading: Math.round(heading),
            vertRate: Math.round(vertRate),
            onGround, color
          }
        });

        currentIcaos.add(icao24);

        // Rolling cache of recent coordinates for 3D trajectory path
        if (!_flightPaths[icao24]) _flightPaths[icao24] = [];
        _flightPaths[icao24].push([lng, lat, Math.max(50, altBaro)]);
        if (_flightPaths[icao24].length > 15) _flightPaths[icao24].shift();
      });

      // Clear paths for planes that left radar coverage
      Object.keys(_flightPaths).forEach(key => {
        if (!currentIcaos.has(key)) delete _flightPaths[key];
      });

      STATE.data.aircraft = features;
      STATE.setLayerCount('aircraft', features.length);
      STATE.setLayerOnline('aircraft', true);

      // Always render via MapLibre (unified 2D+3D engine)
      _render2D(features);

      EventBus.emit('sigint:log', {
        cat: 'ADS-B',
        msg: `TRACKING ${features.length} AIRCRAFT IN VIEW`,
      });
      _lastFetch = Date.now();
    } catch(e) {
      STATE.setLayerOnline('aircraft', false);
      console.warn('[Aircraft] fetch failed:', e.message);
    }
  }

  function _render2D(features) {
    const geojson = { type: 'FeatureCollection', features };
    MAP2D.setSource(SRC, geojson);

    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;

      if (!m.getLayer(LAYER_ICONS)) {
        m.addLayer({
          id: LAYER_ICONS,
          type: 'symbol',
          source: SRC,
          layout: {
            'icon-image': 'icon-plane',
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              1, 0.35,
              6, 0.6,
              12, 0.95
            ],
            'icon-rotate': ['get', 'heading'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': ['get', 'color']
          }
        });
        MAP2D.onClick(LAYER_ICONS, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng, _popup(p));
          AUDIO.aircraftPing();
        });
      }
    });
  }

  function _render3D(features) {
    MAP3D.removeAllWithPrefix('ac-');
    features.slice(0, 300).forEach(f => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const altM = Math.max(100, p.alt || 1000);
      const isMil = p.color === '#ff0000';
      const color = isMil ? '#ff3300' : '#ff8800';

      // Glowing radar blip at actual altitude
      MAP3D.addBillboard(`ac-${p.icao24}`, lat, lng, altM, {
        type: 'plane',
        color,
        scale: 1.2,
        heading: p.heading,
        label: `${(p.callsign || p.icao24).toUpperCase()} (${Math.round(altM)}m)`,
        popup: _popup(p)
      });

      // Project a 5-minute flight path ahead based on heading + speed
      if (p.heading != null && p.speed > 0) {
        const speedMs = p.speed * 0.514444; // knots to m/s
        const dist5min = speedMs * 300; // 5 min in meters
        const distDeg = dist5min / 111320;
        const headRad = (p.heading * Math.PI) / 180;
        const dLat = distDeg * Math.cos(headRad);
        const dLng = distDeg * Math.sin(headRad) / Math.cos(lat * Math.PI / 180);

        const projPath = [
          [lng, lat, altM],
          [lng + dLng * 0.25, lat + dLat * 0.25, altM],
          [lng + dLng * 0.5,  lat + dLat * 0.5,  altM],
          [lng + dLng * 0.75, lat + dLat * 0.75, altM],
          [lng + dLng,        lat + dLat,         altM],
        ];
        MAP3D.addDashedPolyline(`ac-path-${p.icao24}`, projPath, color, 2, false);
      }

      // Also append to historical path cache
      if (!_flightPaths[p.icao24]) _flightPaths[p.icao24] = [];
    });
  }

  function _popup(p) {
    return `<div class="popup-title">✈ ${p.callsign || p.icao24}</div>
      <div class="popup-row"><span class="k">ICAO24</span><span class="v">${p.icao24}</span></div>
      <div class="popup-row"><span class="k">COUNTRY</span><span class="v">${p.country}</span></div>
      <div class="popup-row"><span class="k">ALTITUDE</span><span class="v">${p.alt ? p.alt+'m' : 'N/A'}</span></div>
      <div class="popup-row"><span class="k">SPEED</span><span class="v">${p.speed ? p.speed+' kts' : 'N/A'}</span></div>
      <div class="popup-row"><span class="k">HEADING</span><span class="v">${p.heading}°</span></div>
      <div class="popup-row"><span class="k">VERT RATE</span><span class="${p.vertRate > 0 ? 'v' : 'vr'}">${p.vertRate > 0 ? '▲' : '▼'} ${Math.abs(p.vertRate)} m/s</span></div>
      <div class="popup-row"><span class="k">STATUS</span><span class="${p.onGround ? 'va' : 'vb'}">${p.onGround ? 'ON GROUND' : 'AIRBORNE'}</span></div>`;
  }

  return {
    init() {
      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] });
        if (STATE.layers.aircraft.active) _fetch();
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.aircraft.active && STATE.data.aircraft.length)
          _render2D(STATE.data.aircraft);
      });
      API.schedule('aircraft', _fetch, CONFIG.REFRESH_MS.FLIGHTS, STAGGER.next(500));
    },

    toggle(active) {
      if (active) {
        _fetch();
        API.schedule('aircraft', _fetch, CONFIG.REFRESH_MS.FLIGHTS, 0);
      } else {
        API.cancel('aircraft');
        if (STATE.mapMode === '2d') {
          MAP2D.removeLayer(LAYER_ICONS);
          MAP2D.removeLayer(LAYER_CLUSTERS);
          MAP2D.clearSource(SRC);
        } else {
          MAP3D.removeAllWithPrefix('ac-');
        }
        STATE.setLayerCount('aircraft', 0);
      }
    },

    refresh: _fetch,
  };
})();
