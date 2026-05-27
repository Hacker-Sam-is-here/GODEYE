// ============================================================
//  GODEYE — Unified MapLibre Engine
//  Always-on hybrid: flat view + 3D buildings at zoom 14+
//  No 2D/3D toggle — one seamless map for all modes
// ============================================================
const MAP2D = (() => {
  let map  = null;
  let ready = false;
  const _pendingLayers = [];

  // ── Free tile styles (no API key needed) ──────────────────
  const STYLES = {
    // CartoDB Dark Matter — served as a complete GL style with CORS
    dark:      'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    // CartoDB Voyager (lighter)
    voyager:   'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    // Pure satellite (raster)
    satellite: {
      version: 8,
      glyphs:  'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sprite:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/sprite',
      sources: {
        esri: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256, maxzoom: 19,
          attribution: '© Esri'
        }
      },
      layers: [{ id: 'esri-base', type: 'raster', source: 'esri' }],
    },
    // OpenStreetMap
    osm: {
      version: 8,
      glyphs:  'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sprite:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/sprite',
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256, maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-base', type: 'raster', source: 'osm' }],
    },
    // Satellite with labels
    esri: {
      version: 8,
      glyphs:  'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sprite:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/sprite',
      sources: {
        esri: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256, maxzoom: 19
        }
      },
      layers: [{ id: 'esri-base', type: 'raster', source: 'esri' }],
    },
  };

  let _currentStyleKey = 'dark';
  let _isGlobe         = false;  // track projection state ourselves
  const GLOBE_ZOOM = 2.5;
  const PITCH_STEPS = [[16,55],[14,40],[13,28],[11,15],[8,8],[0,0]];

  // ── Init ───────────────────────────────────────────────────
  function init() {
    map = new maplibregl.Map({
      container: 'map-2d',
      style:     STYLES.dark,
      center:    [CONFIG.DEFAULT_LNG, CONFIG.DEFAULT_LAT],
      zoom:      CONFIG.DEFAULT_ZOOM,
      pitch:     45,
      bearing:   -5,
      antialias: true,
      maxPitch:  70,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    // After style load: add icons + 3D buildings source
    map.on('style.load', () => {
      _generateIcons();
      _addBuildingsSource();
      // Set atmosphere for globe mode (v5+)
      try {
        map.setFog({
          color:            'rgb(4, 20, 4)',
          'high-color':     'rgb(0, 30, 0)',
          'horizon-blend':  0.02,
          'space-color':    'rgb(0, 0, 0)',
          'star-intensity': 0.8,
        });
      } catch(e) {}
    });

    map.on('load', () => {
      ready = true;
      _pendingLayers.forEach(fn => fn());
      _pendingLayers.length = 0;
      // Set initial projection + pitch based on starting zoom
      _autoPitch();
      _autoProjection();
      EventBus.emit('map2d:ready', map);
    });

    map.on('zoom', () => {
      _autoPitch();
      _autoProjection();
    });

    // Coords readout
    map.on('mousemove', e => {
      const el = document.getElementById('map-coords');
      if (el) el.textContent = `LAT: ${e.lngLat.lat.toFixed(5)}  LNG: ${e.lngLat.lng.toFixed(5)}`;
    });

    // State updates
    map.on('moveend', () => {
      const c = map.getCenter();
      STATE.center = { lat: c.lat, lng: c.lng };
      STATE.zoom = map.getZoom();
      EventBus.emit('map:moved', STATE.center);
      EventBus.emit('map:viewchange', null);
    });

    // Right-click coord intel
    map.on('contextmenu', e => {
      EventBus.emit('coord:lookup', { lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Style switcher
    const sel = document.getElementById('map-style-select');
    if (sel) {
      sel.addEventListener('change', e => {
        _currentStyleKey = e.target.value;
        const style = STYLES[_currentStyleKey] || STYLES.dark;
        map.setStyle(style);
        map.once('style.load', () => {
          _generateIcons();
          _addBuildingsSource();
          EventBus.emit('map2d:styleChanged', null);
        });
      });
    }
  }

  // ── Auto-pitch: smooth tilt based on zoom level ──────────
  function _autoPitch() {
    if (!map) return;
    const z = map.getZoom();
    const target = (PITCH_STEPS.find(([minZ]) => z >= minZ) || [0, 0])[1];
    if (Math.abs(map.getPitch() - target) > 2) {
      map.easeTo({ pitch: target, duration: 500 });
    }
  }

  // ── Globe / Mercator projection auto-switch ────────────────
  function _autoProjection() {
    if (!map) return;
    const z = map.getZoom();
    try {
      if (z <= GLOBE_ZOOM && !_isGlobe) {
        // MapLibre v4 requires object form: { type: 'globe' }
        map.setProjection({ type: 'globe' });
        _isGlobe = true;
        EventBus.emit('sigint:log', { cat: 'MAP', msg: 'GLOBE PROJECTION ENGAGED' });
      } else if (z > GLOBE_ZOOM && _isGlobe) {
        map.setProjection({ type: 'mercator' });
        _isGlobe = false;
        EventBus.emit('sigint:log', { cat: 'MAP', msg: 'MERCATOR PROJECTION RESTORED' });
      }
    } catch(e) { /* MapLibre version may not support globe */ }
  }

  // ── 3D Buildings (OpenFreeMap vector tiles) ────────────────
  function _addBuildingsSource() {
    if (!map) return;
    try {
      if (!map.getSource('ofm')) {
        map.addSource('ofm', {
          type: 'vector',
          tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}'],
          minzoom: 13, maxzoom: 14,
          attribution: '© OpenFreeMap',
        });
      }
      if (!map.getLayer('wv-3d-buildings')) {
        map.addLayer({
          id: 'wv-3d-buildings',
          type: 'fill-extrusion',
          source: 'ofm',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'height'], 5],
              0,   '#001800',
              10,  '#002800',
              30,  '#004400',
              80,  '#006600',
              200, '#009933',
            ],
            'fill-extrusion-height':   ['coalesce', ['get', 'height'], ['get', 'render_height'], 5],
            'fill-extrusion-base':     ['coalesce', ['get', 'min_height'], 0],
            'fill-extrusion-opacity':  0.85,
          },
        });
      }
    } catch(e) {
      console.warn('[Buildings]', e.message);
    }
  }

  // No-op: buildings always enabled, auto-pitch handles depth
  function _autoBuildingsVisibility() {}

  // ── Icon canvas generation ─────────────────────────────────
  function _generateIcons() {
    if (!map) return;
    const addIcon = (id, drawFn, size = 32) => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      drawFn(ctx, size);
      try {
        if (!map.hasImage(id))
          map.addImage(id, ctx.getImageData(0, 0, size, size), { sdf: true });
      } catch(e) {}
    };

    // ✈ AIRCRAFT — swept-wing jet silhouette
    addIcon('icon-plane', (ctx, s) => {
      ctx.fillStyle = '#fff';
      // Fuselage
      ctx.beginPath(); ctx.roundRect(s*0.44, s*0.08, s*0.12, s*0.82, s*0.06); ctx.fill();
      // Main swept wings
      ctx.beginPath();
      ctx.moveTo(s*0.5,  s*0.36);
      ctx.lineTo(s*0.03, s*0.64); ctx.lineTo(s*0.03, s*0.70);
      ctx.lineTo(s*0.5,  s*0.50);
      ctx.lineTo(s*0.97, s*0.70); ctx.lineTo(s*0.97, s*0.64);
      ctx.closePath(); ctx.fill();
      // Tail stabilisers
      ctx.beginPath();
      ctx.moveTo(s*0.5,  s*0.78);
      ctx.lineTo(s*0.26, s*0.92); ctx.lineTo(s*0.26, s*0.96);
      ctx.lineTo(s*0.5,  s*0.86);
      ctx.lineTo(s*0.74, s*0.96); ctx.lineTo(s*0.74, s*0.92);
      ctx.closePath(); ctx.fill();
    });

    // 🚢 SHIP — hull with pointed bow and superstructure
    addIcon('icon-ship', (ctx, s) => {
      ctx.fillStyle = '#fff';
      // Hull
      ctx.beginPath();
      ctx.moveTo(s*0.50, s*0.06);
      ctx.lineTo(s*0.80, s*0.32); ctx.lineTo(s*0.80, s*0.84);
      ctx.lineTo(s*0.20, s*0.84); ctx.lineTo(s*0.20, s*0.32);
      ctx.closePath(); ctx.fill();
      // Superstructure (cleared then refilled)
      ctx.fillStyle = '#fff';
      ctx.fillRect(s*0.30, s*0.40, s*0.40, s*0.28);
      // Windows as dark cutouts
      ctx.fillStyle = '#000';
      ctx.fillRect(s*0.36, s*0.46, s*0.10, s*0.08);
      ctx.fillRect(s*0.54, s*0.46, s*0.10, s*0.08);
      // Mast
      ctx.fillStyle = '#fff';
      ctx.fillRect(s*0.48, s*0.06, s*0.04, s*0.18);
    });

    // 🛰 SATELLITE — body with solar panels and dish
    addIcon('icon-satellite', (ctx, s) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8;
      // Body
      ctx.fillRect(s*0.38, s*0.36, s*0.24, s*0.24);
      // Left solar panel
      ctx.strokeRect(s*0.04, s*0.28, s*0.30, s*0.16);
      ctx.beginPath();
      ctx.moveTo(s*0.04+s*0.30*0.33, s*0.28); ctx.lineTo(s*0.04+s*0.30*0.33, s*0.44);
      ctx.moveTo(s*0.04+s*0.30*0.66, s*0.28); ctx.lineTo(s*0.04+s*0.30*0.66, s*0.44);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.34, s*0.38); ctx.lineTo(s*0.38, s*0.42); ctx.stroke();
      // Right solar panel
      ctx.strokeRect(s*0.66, s*0.28, s*0.30, s*0.16);
      ctx.beginPath();
      ctx.moveTo(s*0.66+s*0.30*0.33, s*0.28); ctx.lineTo(s*0.66+s*0.30*0.33, s*0.44);
      ctx.moveTo(s*0.66+s*0.30*0.66, s*0.28); ctx.lineTo(s*0.66+s*0.30*0.66, s*0.44);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.66, s*0.42); ctx.lineTo(s*0.62, s*0.38); ctx.stroke();
      // Dish parabola
      ctx.beginPath(); ctx.arc(s*0.50, s*0.74, s*0.14, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.50, s*0.60); ctx.lineTo(s*0.50, s*0.56); ctx.stroke();
    }, 40);

    // 🌩 EARTHQUAKE — lightning bolt
    addIcon('icon-earthquake', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(s*0.62, s*0.05); ctx.lineTo(s*0.33, s*0.50);
      ctx.lineTo(s*0.52, s*0.50); ctx.lineTo(s*0.36, s*0.95);
      ctx.lineTo(s*0.66, s*0.48); ctx.lineTo(s*0.48, s*0.48);
      ctx.closePath(); ctx.fill();
    });

    // 🔥 WILDFIRE — flame
    addIcon('icon-fire', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(s*0.50, s*0.04);
      ctx.bezierCurveTo(s*0.50, s*0.04, s*0.80, s*0.28, s*0.80, s*0.52);
      ctx.bezierCurveTo(s*0.80, s*0.74, s*0.70, s*0.84, s*0.62, s*0.72);
      ctx.bezierCurveTo(s*0.70, s*0.58, s*0.66, s*0.46, s*0.56, s*0.40);
      ctx.bezierCurveTo(s*0.60, s*0.56, s*0.55, s*0.66, s*0.50, s*0.70);
      ctx.bezierCurveTo(s*0.45, s*0.66, s*0.40, s*0.56, s*0.44, s*0.40);
      ctx.bezierCurveTo(s*0.34, s*0.46, s*0.30, s*0.58, s*0.38, s*0.72);
      ctx.bezierCurveTo(s*0.30, s*0.84, s*0.20, s*0.74, s*0.20, s*0.52);
      ctx.bezierCurveTo(s*0.20, s*0.28, s*0.50, s*0.04, s*0.50, s*0.04);
      ctx.closePath(); ctx.fill();
    });

    // 📹 CCTV CAMERA — body + lens
    addIcon('icon-camera', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(s*0.06, s*0.34, s*0.54, s*0.32);
      // Mount arm
      ctx.fillRect(s*0.24, s*0.18, s*0.08, s*0.18);
      // Lens ring
      ctx.beginPath(); ctx.arc(s*0.74, s*0.50, s*0.18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(s*0.74, s*0.50, s*0.10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s*0.74, s*0.50, s*0.04, 0, Math.PI*2); ctx.fill();
    }, 40);

    // 💥 CONFLICT — explosion burst star
    addIcon('icon-conflict', (ctx, s) => {
      ctx.fillStyle = '#fff';
      const cx = s/2, cy = s/2, r1 = s*0.46, r2 = s*0.20, pts = 10;
      ctx.beginPath();
      for (let i = 0; i < pts*2; i++) {
        const a = (i * Math.PI / pts) - Math.PI/2;
        const r = i%2===0 ? r1 : r2;
        i===0 ? ctx.moveTo(cx+r*Math.cos(a), cy+r*Math.sin(a))
              : ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
      }
      ctx.closePath(); ctx.fill();
    });

    // 🔐 CYBER THREAT — hexagonal circuit node
    addIcon('icon-cyber', (ctx, s) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i=0; i<6; i++) {
        const a = (i*60-30)*Math.PI/180;
        i===0 ? ctx.moveTo(s/2+s*0.28*Math.cos(a), s/2+s*0.28*Math.sin(a))
              : ctx.lineTo(s/2+s*0.28*Math.cos(a), s/2+s*0.28*Math.sin(a));
      }
      ctx.closePath(); ctx.fill();
      [[s*0.5,s*0.06],[s*0.88,s*0.28],[s*0.88,s*0.72],[s*0.5,s*0.94],[s*0.12,s*0.72],[s*0.12,s*0.28]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(s/2,s/2); ctx.lineTo(x,y); ctx.stroke();
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });
    });

    // 🚫 NO-FLY ZONE — circle with diagonal bar
    addIcon('icon-nofly', (ctx, s) => {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(s/2, s/2, s*0.42, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath();
      const r = s*0.42;
      ctx.moveTo(s/2-r*Math.cos(Math.PI*0.25), s/2-r*Math.sin(Math.PI*0.25));
      ctx.lineTo(s/2+r*Math.cos(Math.PI*0.25), s/2+r*Math.sin(Math.PI*0.25));
      ctx.stroke();
    });

    // ⚠ WAR ALERT — shield with exclamation
    addIcon('icon-war-alert', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(s*0.5, s*0.04);
      ctx.lineTo(s*0.90, s*0.22); ctx.lineTo(s*0.90, s*0.56);
      ctx.bezierCurveTo(s*0.90, s*0.82, s*0.5, s*0.97, s*0.5, s*0.97);
      ctx.bezierCurveTo(s*0.5, s*0.97, s*0.10, s*0.82, s*0.10, s*0.56);
      ctx.lineTo(s*0.10, s*0.22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(s*0.45, s*0.28, s*0.10, s*0.34);
      ctx.beginPath(); ctx.arc(s*0.5, s*0.75, s*0.06, 0, Math.PI*2); ctx.fill();
    });

    // 📡 GPS JAM — signal arcs with X
    addIcon('icon-gps-jam', (ctx, s) => {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
      [s*0.14, s*0.24, s*0.34].forEach(r => {
        ctx.beginPath(); ctx.arc(s*0.28, s*0.70, r, -Math.PI*0.80, -Math.PI*0.05); ctx.stroke();
      });
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(s*0.54,s*0.22); ctx.lineTo(s*0.92,s*0.60); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.92,s*0.22); ctx.lineTo(s*0.54,s*0.60); ctx.stroke();
    });

    // ⛅ WEATHER — cloud with lightning
    addIcon('icon-weather', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s*0.34,s*0.36,s*0.18,Math.PI,0);
      ctx.arc(s*0.58,s*0.30,s*0.22,Math.PI,0);
      ctx.arc(s*0.76,s*0.40,s*0.14,Math.PI*1.5,Math.PI*0.5);
      ctx.lineTo(s*0.18,s*0.54); ctx.arc(s*0.18,s*0.40,s*0.14,Math.PI*0.5,Math.PI);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s*0.56,s*0.58); ctx.lineTo(s*0.43,s*0.76);
      ctx.lineTo(s*0.52,s*0.76); ctx.lineTo(s*0.40,s*0.96);
      ctx.lineTo(s*0.62,s*0.73); ctx.lineTo(s*0.52,s*0.73);
      ctx.closePath(); ctx.fill();
    });

    // 🏗 INFRASTRUCTURE — buildings silhouette
    addIcon('icon-infra', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(s*0.06,s*0.42,s*0.30,s*0.50);
      ctx.fillRect(s*0.40,s*0.24,s*0.26,s*0.68);
      ctx.fillRect(s*0.70,s*0.34,s*0.24,s*0.58);
      ctx.fillRect(s*0.46,s*0.08,s*0.06,s*0.18);
      ctx.fillStyle = '#000';
      [[s*0.10,s*0.50],[s*0.22,s*0.50],[s*0.10,s*0.64],[s*0.22,s*0.64]].forEach(([x,y])=>ctx.fillRect(x,y,s*0.08,s*0.08));
      [[s*0.45,s*0.32],[s*0.57,s*0.32],[s*0.45,s*0.48],[s*0.57,s*0.48]].forEach(([x,y])=>ctx.fillRect(x,y,s*0.08,s*0.08));
    });

    // 📰 NEWS — speech bubble pin
    addIcon('icon-news', (ctx, s) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(s*0.08,s*0.06,s*0.76,s*0.54,s*0.10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s*0.34,s*0.60); ctx.lineTo(s*0.26,s*0.82); ctx.lineTo(s*0.54,s*0.60); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(s*0.18,s*0.20,s*0.56,s*0.07);
      ctx.fillRect(s*0.18,s*0.34,s*0.42,s*0.07);
      ctx.fillRect(s*0.18,s*0.48,s*0.30,s*0.07);
    });
  }

  // ── Public helpers ─────────────────────────────────────────
  function whenReady(fn) {
    if (ready) fn(); else _pendingLayers.push(fn);
  }

  function setSource(id, data) {
    whenReady(() => {
      if (!map) return;
      if (map.getSource(id)) map.getSource(id).setData(data);
      else map.addSource(id, { type: 'geojson', data });
    });
  }

  function addLayer(layerDef, beforeId = null) {
    whenReady(() => {
      if (!map || map.getLayer(layerDef.id)) return;
      try {
        if (beforeId && map.getLayer(beforeId)) map.addLayer(layerDef, beforeId);
        else map.addLayer(layerDef);
      } catch(e) {}
    });
  }

  function removeLayer(id) {
    if (!map) return;
    try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {}
  }

  function removeSource(id) {
    if (!map) return;
    try { if (map.getSource(id)) map.removeSource(id); } catch(e) {}
  }

  function clearSource(id) {
    if (!map) return;
    try {
      const src = map.getSource(id);
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    } catch(e) {}
  }

  function removeLayerAndSource(id) { removeLayer(id); removeSource(id); }

  function flyTo(lat, lng, zoom = 12, duration = 2000) {
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom, duration, essential: true, curve: 1.5 });
  }

  function getBounds() {
    if (!map) return null;
    const b = map.getBounds();
    return { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() };
  }

  function onClick(layerId, cb) {
    whenReady(() => {
      if (!map) return;
      map.on('click', layerId, cb);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  function showPopup(lat, lng, html) {
    if (!map) return;
    new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
      .setLngLat([lng, lat]).setHTML(html).addTo(map);
  }

  function applyFilterMode(mode) {
    const el = document.getElementById('map-2d');
    if (!el) return;
    const f = {
      'night-vision': 'hue-rotate(100deg) brightness(1.4) saturate(1.5)',
      'thermal':      'sepia(1) hue-rotate(300deg) contrast(1.5) saturate(2)',
      'crt':          'contrast(1.1) brightness(0.95)',
      'grayscale':    'grayscale(1) contrast(1.3)',
      'deep-night':   'brightness(0.5) saturate(0.8)',
      'normal':       '',
    };
    el.style.filter = f[mode] || '';
  }

  // No-op stubs for backward compat with old 3D-toggle code
  function enable3D()  {}
  function disable3D() {}

  return {
    init, enable3D, disable3D,
    setSource, addLayer, removeLayer, removeSource, removeLayerAndSource, clearSource,
    flyTo, getBounds, onClick, showPopup, whenReady, applyFilterMode,
    get map()     { return map; },
    get isReady() { return ready; },
    get is3D()    { return false; },
  };
})();
