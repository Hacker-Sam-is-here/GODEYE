// ============================================================
//  GODEYE — Real-World Traffic Simulation Engine
//  ─ Road data: OpenStreetMap Overpass API
//  ─ Congestion: local time-aware rush-hour model per coordinate
//  ─ Road typing: speed limits by OSM highway class
//  ─ Particle density/speed/color driven by real congestion factor
//  ─ Optional: TomTom raster traffic tiles overlay
// ============================================================
const LayerOSMFlow = (() => {
  const SRC        = 'wv-osm-flow';
  const LAYER      = 'wv-osm-flow-particles';
  const TOMTOM_SRC = 'wv-tomtom-traffic';
  const TOMTOM_LYR = 'wv-tomtom-traffic-overlay';

  const ZOOM_THRESHOLD  = 12;   // auto-start at this zoom
  const MAX_PARTICLES   = 500;  // cap per frame

  // ── Road speed limits (kph) by OSM highway tag ─────────────
  const ROAD_SPEEDS = {
    motorway: 120, motorway_link: 80,
    trunk: 100,    trunk_link: 60,
    primary: 70,   primary_link: 50,
    secondary: 50, secondary_link: 40,
    tertiary: 40,  tertiary_link: 30,
    residential: 30, living_street: 10,
    service: 20, unclassified: 40,
  };

  // Particle counts per road type (density weighting)
  const ROAD_DENSITY = {
    motorway: 5, motorway_link: 3,
    trunk: 4,    trunk_link: 2,
    primary: 4,  primary_link: 2,
    secondary: 3, secondary_link: 1,
    tertiary: 2, residential: 2,
    service: 1, living_street: 1, unclassified: 1,
  };

  // ── Congestion model ────────────────────────────────────────
  // Returns 0.0 (free flow) → 1.0 (gridlock)
  function _getCongestionFactor(lat, lng) {
    // Estimate local hour from longitude (rough timezone proxy)
    const tzOffsetHours = Math.round(lng / 15);
    const utcHour       = new Date().getUTCHours();
    const localHour     = ((utcHour + tzOffsetHours) % 24 + 24) % 24;
    const localMin      = new Date().getUTCMinutes();
    const dayOfWeek     = new Date().getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend     = dayOfWeek === 0 || dayOfWeek === 6;
    const t = localHour + localMin / 60;

    if (t >= 23 || t < 5)    return 0.05;  // dead of night
    if (t >= 5  && t < 6.5)  return 0.15;  // early morning
    if (t >= 6.5 && t < 7)   return 0.40;  // pre-rush build-up

    if (!isWeekend) {
      if (t >= 7   && t < 9.5)  return 0.88; // AM rush hour
      if (t >= 9.5 && t < 11)   return 0.55; // post-rush settling
      if (t >= 11  && t < 13)   return 0.50; // midday moderate
      if (t >= 13  && t < 14)   return 0.65; // lunch peak
      if (t >= 14  && t < 16.5) return 0.45; // afternoon lull
      if (t >= 16.5 && t < 19.5) return 0.92; // PM rush (worst)
      if (t >= 19.5 && t < 21)  return 0.55; // evening wind-down
      if (t >= 21)               return 0.20; // late night
    } else {
      // Weekends: no sharp rush, broader midday peak
      if (t >= 6  && t < 10)   return 0.25;
      if (t >= 10 && t < 14)   return 0.60; // weekend midday
      if (t >= 14 && t < 18)   return 0.55;
      if (t >= 18 && t < 21)   return 0.40;
      if (t >= 21)              return 0.20;
    }
    return 0.35;
  }

  // Convert congestion factor → particle color (green→yellow→red)
  function _congestionColor(congestion) {
    if (congestion < 0.3)  return '#00e676'; // free — bright green
    if (congestion < 0.55) return '#aeea00'; // light — yellow-green
    if (congestion < 0.70) return '#ffd600'; // moderate — amber
    if (congestion < 0.85) return '#ff6d00'; // heavy — orange
    return '#f44336';                         // gridlock — red
  }

  // Speed ratio: actual travel speed as fraction of free-flow
  function _speedRatio(congestion) {
    // BPR (Bureau of Public Roads) congestion function approximation
    // V/C ratio → speed degradation
    return Math.max(0.05, 1 - Math.pow(congestion, 2.5) * 0.9);
  }

  // ── Road network data ───────────────────────────────────────
  let _roads       = [];  // [{coords, type, speed, density, congestion, color}]
  let _particles   = [];
  let _animTimer   = null;
  let _fetchTimer  = null;
  let _congTimer   = null;
  let _lastFetchPos = null;
  let _isFetching   = false;
  let _running      = false;
  let _autoActive   = false;
  let _currentCongestion = 0.4;

  // Static global seed roads (used before Overpass loads)
  const SEED_ROADS = [
    { name:'Austin I-35',       type:'motorway',   coords: [[-97.7288,30.2798],[-97.7300,30.2740],[-97.7320,30.2680],[-97.7380,30.2500],[-97.7440,30.2400]] },
    { name:'Austin Congress',   type:'primary',    coords: [[-97.7428,30.2740],[-97.7428,30.2680],[-97.7440,30.2620],[-97.7460,30.2580]] },
    { name:'Broadway NYC',      type:'primary',    coords: [[-73.9860,40.7580],[-73.9873,40.7484],[-73.9893,40.7411],[-73.9904,40.7359]] },
    { name:'5th Ave NYC',       type:'primary',    coords: [[-73.9730,40.7644],[-73.9820,40.7516],[-73.9863,40.7456],[-73.9897,40.7408]] },
    { name:'Westminster Rd',    type:'primary',    coords: [[-0.1246,51.5007],[-0.1210,51.4990],[-0.1180,51.4980]] },
    { name:'Shibuya Crossing',  type:'primary',    coords: [[139.7004,35.6595],[139.6980,35.6580],[139.6950,35.6560]] },
    { name:'Champs-Élysées',    type:'primary',    coords: [[2.3052,48.8698],[2.3122,48.8724],[2.3189,48.8746]] },
    { name:'Collins St Melb',   type:'secondary',  coords: [[144.9631,-37.8159],[144.9690,-37.8145],[144.9750,-37.8134]] },
    { name:'Paulista Ave SP',   type:'secondary',  coords: [[-46.6579,-23.5636],[-46.6540,-23.5620],[-46.6490,-23.5600]] },
    { name:'Sheikh Zayed Rd',   type:'motorway',   coords: [[55.1509,25.0827],[55.1600,25.0925],[55.1700,25.1025]] },
  ];

  // ── Path interpolation ─────────────────────────────────────
  function _interpolatePath(coords, t) {
    const n = coords.length;
    if (n < 2) return [coords[0][0], coords[0][1], 0];
    const seg  = Math.min(n - 2, Math.floor(t * (n - 1)));
    const segT = (t * (n - 1)) - seg;
    const p1   = coords[seg], p2 = coords[seg + 1];
    const lng  = p1[0] + (p2[0] - p1[0]) * segT;
    const lat  = p1[1] + (p2[1] - p1[1]) * segT;
    let heading = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]) * 180 / Math.PI;
    if (heading < 0) heading += 360;
    return [lng, lat, heading];
  }

  // ── Particle generation from road list ─────────────────────
  function _generateParticles(roads = null) {
    const roadList = roads || (_roads.length ? _roads : SEED_ROADS.map(r => ({
      ...r,
      speed:     ROAD_SPEEDS[r.type] || 40,
      density:   ROAD_DENSITY[r.type] || 2,
      congestion: _currentCongestion,
      color:     _congestionColor(_currentCongestion),
    })));

    _particles = [];
    roadList.forEach((road, ri) => {
      const c     = road.congestion ?? _currentCongestion;
      const color = road.color || _congestionColor(c);
      const ratio = _speedRatio(c);
      const baseSpeed = (road.speed || 50) / 3600 / 111000; // deg/sec approx
      const count = Math.max(1, Math.round((road.density || 2) * (0.5 + c * 2.5)));

      for (let i = 0; i < count; i++) {
        _particles.push({
          roadIdx:   ri,
          coords:    road.coords,
          t:         Math.random(),
          // actual speed = free_flow * BPR_ratio (congested = slower)
          speed:     baseSpeed * ratio * (0.7 + Math.random() * 0.6),
          color,
          size:      road.type?.includes('motorway') || road.type?.includes('trunk') ? 4 : 3,
          heading:   0,
        });
      }
    });

    // Cap total particles for performance
    if (_particles.length > MAX_PARTICLES) {
      _particles = _particles.slice(0, MAX_PARTICLES);
    }
  }

  // ── Animation tick ─────────────────────────────────────────
  function _tick() {
    if (!_running || !_particles.length) return;

    const features = _particles.map(p => {
      p.t += p.speed;
      if (p.t >= 1) p.t = 0;
      const road = (_roads.length ? _roads : SEED_ROADS)[p.roadIdx];
      if (!road) return null;
      const [lng, lat, heading] = _interpolatePath(p.coords, p.t);
      p.heading = heading;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { color: p.color, size: p.size, heading }
      };
    }).filter(Boolean);

    const m = MAP2D.map;
    if (m?.getSource(SRC)) {
      m.getSource(SRC).setData({ type: 'FeatureCollection', features });
    }
  }

  // ── Update congestion factors for all roads ────────────────
  function _updateCongestion() {
    if (!_roads.length) return;
    const c = MAP2D.map?.getCenter() || { lat: 0, lng: 0 };
    _currentCongestion = _getCongestionFactor(c.lat, c.lng);

    // Per-road slight variation (±15%) for realism
    _roads.forEach(road => {
      const jitter = 0.85 + Math.random() * 0.3;
      road.congestion = Math.min(1, _currentCongestion * jitter);
      road.color = _congestionColor(road.congestion);
    });

    // Regenerate particles with new speeds/colors
    _generateParticles(_roads);

    // Update HUD label
    _updateHUD();
  }

  function _updateHUD() {
    const c = _currentCongestion;
    let label = 'FREE FLOW';
    if (c > 0.85) label = 'GRIDLOCK';
    else if (c > 0.7) label = 'HEAVY';
    else if (c > 0.5) label = 'MODERATE';
    else if (c > 0.3) label = 'LIGHT';
    const color = _congestionColor(c);

    EventBus.emit('sigint:log', {
      cat: 'TRAFFIC',
      msg: `DENSITY: ${label} (${Math.round(c * 100)}%) — ${_particles.length} VEHICLES SIMULATED`,
    });

    // Update layer count badge with congestion %
    STATE.setLayerCount('osmFlow', Math.round(c * 100));
  }

  // ── Fetch OSM roads from Overpass ──────────────────────────
  async function _fetchRoads() {
    if (_isFetching || !MAP2D.map) return;
    const zoom = MAP2D.map.getZoom();
    if (zoom < ZOOM_THRESHOLD) return;

    const ctr = MAP2D.map.getCenter();
    const lat = ctr.lat, lng = ctr.lng;

    if (_lastFetchPos) {
      const moved = Math.pow(lat - _lastFetchPos.lat, 2) + Math.pow(lng - _lastFetchPos.lng, 2);
      if (moved < 0.0001) return; // < ~1km, skip re-fetch
    }

    _isFetching    = true;
    _lastFetchPos  = { lat, lng };

    // Box shrinks as you zoom in for more detail
    const box = zoom >= 16 ? 0.007 : zoom >= 15 ? 0.012 : zoom >= 14 ? 0.02 : 0.035;
    const s = lat - box, n = lat + box, w = lng - box, e = lng + box;

    const query = `[out:json][timeout:15];
way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|living_street|unclassified"](${s},${w},${n},${e});
out geom;`;

    try {
      const res  = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(12000) }
      );
      const data = await res.json();

      if (!data?.elements?.length) { _isFetching = false; return; }

      // Compute per-viewport congestion
      _currentCongestion = _getCongestionFactor(lat, lng);

      const roads = data.elements
        .filter(el => el.geometry?.length > 1)
        .map(el => {
          const type      = el.tags?.highway || 'unclassified';
          const maxspeed  = parseInt(el.tags?.maxspeed) || ROAD_SPEEDS[type] || 40;
          const jitter    = 0.85 + Math.random() * 0.3;
          const cong      = Math.min(1, _currentCongestion * jitter);
          return {
            name:       el.tags?.name || type,
            type,
            speed:      maxspeed,
            density:    ROAD_DENSITY[type] || 1,
            congestion: cong,
            color:      _congestionColor(cong),
            coords:     el.geometry.map(g => [g.lon, g.lat]),
            oneway:     el.tags?.oneway === 'yes',
          };
        });

      if (roads.length) {
        _roads = roads;
        _generateParticles(_roads);

        STATE.setLayerCount('osmFlow', Math.round(_currentCongestion * 100));
        EventBus.emit('sigint:log', {
          cat: 'TRAFFIC',
          msg: `MESH LOADED: ${roads.length} ROAD SEGMENTS | CONGESTION: ${Math.round(_currentCongestion * 100)}% | VEHICLES: ${_particles.length}`,
        });
      }
    } catch(e) {
      // Overpass timed out — keep using last roads
    }
    _isFetching = false;
  }

  // ── TomTom live traffic tile overlay ──────────────────────
  // Requires free TomTom API key (2,500 req/day)
  // Shows red/yellow/green overlay exactly like Google Maps
  function _addTomTomOverlay() {
    if (!CONFIG.TOMTOM_API_KEY || !MAP2D.map) return;
    const m = MAP2D.map;
    if (m.getSource(TOMTOM_SRC)) return;
    try {
      m.addSource(TOMTOM_SRC, {
        type: 'raster',
        tiles: [
          `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?apiKey=${CONFIG.TOMTOM_API_KEY}`,
        ],
        tileSize: 256, maxzoom: 18,
        attribution: '© TomTom Traffic',
      });
      m.addLayer({
        id: TOMTOM_LYR, type: 'raster', source: TOMTOM_SRC,
        paint: { 'raster-opacity': 0.7 },
      });
    } catch(e) {}
  }

  function _removeTomTomOverlay() {
    if (!MAP2D.map) return;
    try { MAP2D.map.removeLayer(TOMTOM_LYR); } catch(e) {}
    try { MAP2D.map.removeSource(TOMTOM_SRC); } catch(e) {}
  }

  // ── MapLibre source + layer setup ─────────────────────────
  function _ensureLayer() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getSource(SRC)) {
        m.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER, type: 'circle', source: SRC,
          paint: {
            'circle-radius':       ['get', 'size'],
            'circle-color':        ['get', 'color'],
            'circle-blur':         0.4,
            'circle-opacity':      ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 0.9],
            'circle-stroke-color': 'rgba(0,0,0,0.3)',
            'circle-stroke-width': 0.5,
          },
        });
        // Also add TomTom overlay if key is configured
        _addTomTomOverlay();
      }
    });
  }

  // ── Zoom-based auto-toggle ─────────────────────────────────
  function _onZoom() {
    if (!STATE.layers.osmFlow.active) return;
    const zoom = MAP2D.map?.getZoom() || 0;
    if (zoom >= ZOOM_THRESHOLD && !_running) _start(true);
    else if (zoom < ZOOM_THRESHOLD && _running && _autoActive) _stop(true);
  }

  // ── Start / Stop ───────────────────────────────────────────
  function _start(auto = false) {
    if (_running) return;
    _running    = true;
    _autoActive = auto;

    // Seed roads immediately so particles show at once
    if (!_roads.length) {
      _roads = SEED_ROADS.map(r => {
        const cong = _getCongestionFactor(r.coords[0][1], r.coords[0][0]);
        return { ...r, speed: ROAD_SPEEDS[r.type] || 40, density: ROAD_DENSITY[r.type] || 2, congestion: cong, color: _congestionColor(cong) };
      });
    }
    _generateParticles(_roads);
    _ensureLayer();

    _animTimer  = setInterval(_tick, 60);           // 16 fps animation
    _fetchTimer = setInterval(_fetchRoads, 4000);   // poll for new roads on pan
    _congTimer  = setInterval(_updateCongestion, 60000); // re-calc congestion every minute

    _fetchRoads(); // immediate first fetch if zoomed in
    _updateHUD();
    STATE.setLayerOnline('osmFlow', true);
  }

  function _stop(auto = false) {
    if (!_running) return;
    if (auto && !_autoActive) return;
    _running = _autoActive = false;
    clearInterval(_animTimer);
    clearInterval(_fetchTimer);
    clearInterval(_congTimer);
    _animTimer = _fetchTimer = _congTimer = null;
    const m = MAP2D.map;
    if (m?.getSource(SRC)) m.getSource(SRC).setData({ type: 'FeatureCollection', features: [] });
    MAP2D.removeLayer(LAYER);
    _removeTomTomOverlay();
    STATE.setLayerOnline('osmFlow', false);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init() {
      MAP2D.whenReady(() => {
        MAP2D.map.on('zoom',    _onZoom);
        MAP2D.map.on('moveend', _fetchRoads);

        const zoom = MAP2D.map.getZoom();
        if (STATE.layers.osmFlow.active && zoom >= ZOOM_THRESHOLD) {
          _start(true);
        }
      });

      EventBus.on('map2d:styleChanged', () => {
        if (_running) {
          _ensureLayer();
          _addTomTomOverlay();
        }
      });
    },

    toggle(active) {
      if (active) {
        _start(false);
        const c = MAP2D.map?.getCenter() || { lat: 0, lng: 0 };
        _currentCongestion = _getCongestionFactor(c.lat, c.lng);
        EventBus.emit('sigint:log', {
          cat: 'TRAFFIC',
          msg: `REAL-WORLD TRAFFIC SIMULATION ACTIVE | LOCAL CONGESTION: ${Math.round(_currentCongestion * 100)}%`,
        });
      } else {
        _stop(false);
        _roads = [];
        STATE.setLayerCount('osmFlow', 0);
      }
    },

    // Exposed for potential external updates (e.g. map move)
    getCongestion: () => _currentCongestion,
  };
})();
