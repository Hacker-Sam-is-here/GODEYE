// ============================================================
//  GODEYE — Layer 2: Ship Tracking (AISStream + OpenSeaMap)
// ============================================================
const LayerShips = (() => {
  const SRC = 'wv-ships';
  const LAYER_ICONS = 'wv-ship-icons';
  let _ws = null;
  let _reconnectTimer = null;
  let _vessels = {};
  const _shipPaths = {}; // key -> array of [lng, lat, 0]

  const SHIP_COLORS = {
    1: '#ffbb00', 2: '#ffbb00', 3: '#ffbb00',   // Reserved/unknown → orange-gold
    70: '#ff7722', 71: '#ff7722', 72: '#ff7722',  // Cargo → glowing orange-amber
    73: '#ff7722', 74: '#ff7722', 75: '#ff7722',
    80: '#ff4400', 81: '#ff4400', 82: '#ff4400',  // Tanker → bright warm red-orange
    83: '#ff4400', 84: '#ff4400', 85: '#ff4400',
    60: '#ffaa00', 61: '#ffaa00', 62: '#ffaa00',  // Passenger → glowing orange-yellow
    35: '#ff3300',                                  // Military → vibrant red-orange
  };

  function _vesselColor(typeCode) {
    return SHIP_COLORS[typeCode] || '#ff7722';
  }

  function _vesselType(typeCode) {
    if (typeCode >= 70 && typeCode <= 79) return 'CARGO';
    if (typeCode >= 80 && typeCode <= 89) return 'TANKER';
    if (typeCode >= 60 && typeCode <= 69) return 'PASSENGER';
    if (typeCode === 35) return 'MILITARY';
    if (typeCode >= 30 && typeCode <= 35) return 'FISHING';
    if (typeCode >= 20 && typeCode <= 29) return 'WIG';
    if (typeCode >= 40 && typeCode <= 49) return 'HSC';
    return 'OTHER';
  }


  let _mockInterval = null;

  function _startMockShips() {
    if (_mockInterval) return;
    
    console.warn('[AISStream Fallback] Activating resilient mock maritime simulation...');
    STATE.setLayerOnline('ships', true);

    const routes = [
      { name: 'MAERSK MC-KINNEY MOLLER', flag: '🇩🇰', type: 70, typeLabel: 'CARGO', lat: 1.25, lng: 103.8, heading: 240, sog: 18.5, dest: 'ROTTERDAM' },
      { name: 'EVER GIVEN', flag: '🇵🇦', type: 70, typeLabel: 'CARGO', lat: 29.9, lng: 32.5, heading: 340, sog: 12.2, dest: 'FELIXSTOWE' },
      { name: 'USS GERALD R. FORD', flag: '🇺🇸', type: 35, typeLabel: 'MILITARY', lat: 34.2, lng: 25.4, heading: 90, sog: 25.0, dest: 'MED SEA PATROL' },
      { name: 'TI OCEANIA', flag: '🇧🇪', type: 80, typeLabel: 'TANKER', lat: 26.2, lng: 56.1, heading: 180, sog: 14.1, dest: 'SINGAPORE' },
      { name: 'QUEEN MARY 2', flag: '🇬🇧', type: 60, typeLabel: 'PASSENGER', lat: 45.3, lng: -35.2, heading: 85, sog: 22.4, dest: 'NEW YORK' },
      { name: 'XIN GUANG HUA', flag: '🇨🇳', type: 70, typeLabel: 'CARGO', lat: 22.1, lng: 115.3, heading: 45, sog: 11.8, dest: 'SHANGHAI' },
      { name: 'SINOPEC ADVENTURE', flag: '🇭🇰', type: 80, typeLabel: 'TANKER', lat: 12.4, lng: 43.8, heading: 155, sog: 13.9, dest: 'JEDDAH' },
      { name: 'INS VIKRANT', flag: '🇮🇳', type: 35, typeLabel: 'MILITARY', lat: 18.8, lng: 72.5, heading: 270, sog: 20.0, dest: 'ARABIAN SEA' },
      { name: 'BLUE MARLIN', flag: '🇲🇹', type: 70, typeLabel: 'CARGO', lat: 50.8, lng: -1.2, heading: 225, sog: 10.5, dest: 'ANTWERP' },
    ];

    routes.forEach(r => {
      _vessels[r.name] = {
        mmsi: Math.floor(100000000 + Math.random() * 800000000),
        name: r.name,
        flag: r.flag,
        type: r.type,
        typeLabel: r.typeLabel,
        lat: r.lat,
        lng: r.lng,
        heading: r.heading,
        sog: r.sog,
        destination: r.dest,
        lastPos: Date.now()
      };
    });

    _renderDebounced();

    _mockInterval = setInterval(() => {
      Object.values(_vessels).forEach(v => {
        const rad = (v.heading * Math.PI) / 180;
        const speedDeg = (v.sog * 0.514444) / 111111;
        v.lat += Math.sin(rad) * speedDeg * 30;
        v.lng += Math.cos(rad) * speedDeg * 30;
        v.lastPos = Date.now();
      });
      _renderDebounced();
    }, 5000);
  }

  function _connectWS() {
    if (!CONFIG.AISSTREAM_KEY || CONFIG.AISSTREAM_KEY.startsWith('YOUR_')) {
      _startMockShips();
      return;
    }
    clearTimeout(_reconnectTimer);
    if (_ws) { try { _ws.close(); } catch(e) {} }

    const wsWatchdog = setTimeout(() => {
      if (!_ws || _ws.readyState !== WebSocket.OPEN) {
        console.warn('[AISStream] WebSocket connection timed out. Falling back to simulation.');
        _startMockShips();
      }
    }, 5000);

    _ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    _ws.onopen = () => {
      clearTimeout(wsWatchdog);
      clearInterval(_mockInterval);
      _mockInterval = null;
      const bounds = MAP2D.getBounds() || { south: -70, north: 70, west: -180, east: 180 };
      _ws.send(JSON.stringify({
        APIKey: CONFIG.AISSTREAM_KEY,
        BoundingBoxes: [[
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ]],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
      STATE.setLayerOnline('ships', true);
    };

    _ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        _handleAISMessage(msg);
      } catch(e) {}
    };

    _ws.onerror = () => {
      clearTimeout(wsWatchdog);
      _startMockShips();
    };

    _ws.onclose = () => {
      clearTimeout(wsWatchdog);
      if (STATE.layers.ships.active) {
        if (!_mockInterval) _startMockShips();
      }
    };
  }

  function _handleAISMessage(msg) {
    const mmsi = msg.MetaData?.MMSI;
    if (!mmsi) return;

    if (msg.Message?.PositionReport) {
      const p = msg.Message.PositionReport;
      if (!_vessels[mmsi]) _vessels[mmsi] = { mmsi };
      Object.assign(_vessels[mmsi], {
        lat: p.Latitude,
        lng: p.Longitude,
        sog: p.Sog?.toFixed(1),
        cog: p.Cog,
        heading: p.TrueHeading !== 511 ? p.TrueHeading : p.Cog,
        lastPos: Date.now(),
        name: msg.MetaData?.ShipName?.trim() || _vessels[mmsi].name,
        flag: msg.MetaData?.flag || '',
      });
    }

    if (msg.Message?.ShipStaticData) {
      const s = msg.Message.ShipStaticData;
      if (!_vessels[mmsi]) _vessels[mmsi] = { mmsi };
      Object.assign(_vessels[mmsi], {
        name: s.Name?.trim() || _vessels[mmsi]?.name,
        type: s.Type,
        typeLabel: _vesselType(s.Type),
        callsign: s.CallSign?.trim(),
        destination: s.Destination?.trim(),
        flag: msg.MetaData?.flag || '',
      });
    }

    STATE.data.ships = _vessels;
    STATE.setLayerCount('ships', Object.keys(_vessels).length);
    _renderDebounced();

    // Dark vessel alert
    const v = _vessels[mmsi];
    if (v && v.lastPos && Date.now() - v.lastPos > 7200000) {
      EventBus.emit('sigint:log', {
        cat: 'AIS',
        msg: `DARK VESSEL — MMSI:${mmsi} — LAST POS: ${v.lat?.toFixed(2)}°N ${v.lng?.toFixed(2)}°E`,
        level: 'warn',
      });
    }
  }

  let _renderTimer = null;
  function _renderDebounced() {
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(_render, 500);
  }

  function _render() {
    const features = Object.values(_vessels)
      .filter(v => v.lat && v.lng)
      .map(v => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
        properties: {
          mmsi: v.mmsi,
          name: v.name || `MMSI:${v.mmsi}`,
          type: v.typeLabel || 'OTHER',
          sog: v.sog || '0',
          heading: v.heading || 0,
          destination: v.destination || '--',
          flag: v.flag || '',
          color: _vesselColor(v.type)
        },
      }));

    if (STATE.mapMode === '3d') {
      _render3D();
      return;
    }

    MAP2D.setSource(SRC, { type: 'FeatureCollection', features });

    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m || m.getLayer(LAYER_ICONS)) return;
      m.addLayer({
        id: LAYER_ICONS,
        type: 'symbol',
        source: SRC,
        layout: {
          'icon-image': 'icon-ship',
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
      });
    });
  }

  function _render3D() {
    MAP3D.removeAllWithPrefix('ship-');
    Object.values(_vessels).filter(v => v.lat && v.lng).forEach(v => {
      const isMilitary = v.type === 35;
      const color3d = _vesselColor(v.type);
      const key = v.mmsi || v.name;

      // Glowing blip at sea level
      MAP3D.addBillboard(`ship-${key}`, v.lat, v.lng, 2, {
        type: 'ship',
        isMilitary,
        color: color3d,
        scale: 1.1,
        heading: v.heading,
        label: `${(v.name || `MMSI:${v.mmsi}`).toUpperCase()} (${v.typeLabel || 'Cargo'})`,
        popup: _popup({ mmsi: v.mmsi, name: v.name, flag: v.flag, type: v.typeLabel, sog: v.sog, heading: v.heading, destination: v.destination })
      });

      // Project a 30-min wake trail in vessel heading direction
      if (v.heading != null && v.sog > 0) {
        const speedMs = v.sog * 0.514444; // knots to m/s
        const dist30m = speedMs * 1800;
        const distDeg = dist30m / 111320;
        const headRad = (v.heading * Math.PI) / 180;
        const dLat = distDeg * Math.cos(headRad);
        const dLng = distDeg * Math.sin(headRad) / Math.cos(v.lat * Math.PI / 180);

        const path = [
          [v.lng, v.lat, 0],
          [v.lng + dLng * 0.33, v.lat + dLat * 0.33, 0],
          [v.lng + dLng * 0.66, v.lat + dLat * 0.66, 0],
          [v.lng + dLng, v.lat + dLat, 0],
        ];
        MAP3D.addDashedPolyline(`ship-path-${key}`, path, color3d, 3, true);
      }

      // Also accumulate real path history
      if (!_shipPaths[key]) _shipPaths[key] = [];
      _shipPaths[key].push([v.lng, v.lat, 0]);
      if (_shipPaths[key].length > 20) _shipPaths[key].shift();
    });
  }

  function _popup(p) {
    return `<div class="popup-title">${p.flag} ${p.name}</div>
      <div class="popup-row"><span class="k">MMSI</span><span class="v">${p.mmsi}</span></div>
      <div class="popup-row"><span class="k">TYPE</span><span class="vb">${p.type}</span></div>
      <div class="popup-row"><span class="k">SPEED</span><span class="v">${p.sog} kts</span></div>
      <div class="popup-row"><span class="k">HEADING</span><span class="v">${p.heading}°</span></div>
      <div class="popup-row"><span class="k">DESTINATION</span><span class="va">${p.destination}</span></div>`;
  }

  return {
    init() {
      if (STATE.layers.ships.active) _connectWS();

      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] });

        // OpenSeaMap raster tiles as fallback overlay
        const m = MAP2D.map;
        if (m && !m.getSource('openseamap')) {
          m.addSource('openseamap', {
            type: 'raster',
            tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
            tileSize: 256,
          });
          m.addLayer({
            id: 'openseamap-layer',
            type: 'raster',
            source: 'openseamap',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 0.6 },
          });
        }
      });

      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.ships.active) {
          _render();
        }
      });
    },

    toggle(active) {
      if (active) _connectWS();
      else {
        if (_ws) { try { _ws.close(); } catch(e) {} _ws = null; }
        clearTimeout(_reconnectTimer);
        clearInterval(_mockInterval);
        _mockInterval = null;
        if (STATE.mapMode === '2d') {
          MAP2D.removeLayer(LAYER_ICONS);
          MAP2D.clearSource(SRC);
        } else {
          MAP3D.removeAllWithPrefix('ship-');
        }
        _vessels = {};
        STATE.setLayerCount('ships', 0);
        STATE.setLayerOnline('ships', false);
      }
    },
  };
})();
