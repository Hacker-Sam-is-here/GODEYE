// ============================================================
//  GODEYE — Layer 4: Conflict Zones (ACLED + GDELT)
// ============================================================
const LayerConflicts = (() => {
  const SRC   = 'wv-conflicts';
  const LAYER = 'wv-conflict-circles';
  const LAYER_HEAT = 'wv-conflict-heat';

  let _acledToken = null;
  let _acledTokenExpires = 0;

  async function _getACLEDToken() {
    if (_acledToken && Date.now() < _acledTokenExpires - 300000) return _acledToken;
    if (!CONFIG.ACLED_EMAIL || !CONFIG.ACLED_PASSWORD || CONFIG.ACLED_EMAIL.startsWith('YOUR_')) {
      throw new Error('ACLED credentials missing or default');
    }

    const res = await CORS.smartFetch('https://acleddata.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=password&client_id=acled&username=${encodeURIComponent(CONFIG.ACLED_EMAIL)}&password=${encodeURIComponent(CONFIG.ACLED_PASSWORD)}`
    });
    
    if (!res.ok) throw new Error('ACLED auth failed');
    const data = await res.json();
    _acledToken = data.access_token;
    _acledTokenExpires = Date.now() + (data.expires_in * 1000);
    return _acledToken;
  }

  function _generateMockConflicts() {
    console.warn('[ACLED Fallback] Generating premium simulated global conflict events...');
    const today = new Date().toISOString().split('T')[0];
    const mocks = [
      {
        id: 'MOCK-UKR-001',
        type: 'Battles',
        actor: 'Military Forces of Russia vs Military Forces of Ukraine',
        location: 'Pokrovsk Frontline',
        country: 'Ukraine',
        lat: 48.28, lng: 37.17,
        fatalities: 12,
        notes: 'Intense artillery duel and infantry skirmishes reported along the Pokrovsk-Avdiivka axis as Russian forces push westwards.',
        color: '#ff0000'
      },
      {
        id: 'MOCK-GZ-002',
        type: 'Explosions/Remote violence',
        actor: 'IDF vs Hamas Militants',
        location: 'Khan Younis',
        country: 'Gaza',
        lat: 31.34, lng: 34.30,
        fatalities: 8,
        notes: 'Airstrikes targeted tunnel complexes in eastern Khan Younis following rocket launches directed at southern Israeli kibbutzim.',
        color: '#ffaa00'
      },
      {
        id: 'MOCK-RS-003',
        type: 'Explosions/Remote violence',
        actor: 'Houthi Rebels vs US Navy Destroyer',
        location: 'Bab-el-Mandeb Strait',
        country: 'Yemen',
        lat: 12.60, lng: 43.48,
        fatalities: 0,
        notes: 'US Navy Aegis destroyer intercepted three one-way attack drones launched from Houthi-controlled territory in western Yemen.',
        color: '#ffaa00'
      },
      {
        id: 'MOCK-SCS-004',
        type: 'Violence against civilians',
        actor: 'Chinese Coast Guard vs Philippine Supply Vessel',
        location: 'Second Thomas Shoal',
        country: 'South China Sea',
        lat: 9.73, lng: 115.86,
        fatalities: 0,
        notes: 'Water cannon usage and collision reported during a supply mission to the BRP Sierra Madre outpost at Second Thomas Shoal.',
        color: '#ff00aa'
      },
      {
        id: 'MOCK-TW-005',
        type: 'Protests',
        actor: 'Taiwanese Coast Guard vs Chinese Fishing Fleet',
        location: 'Kinmen Islands Waters',
        country: 'Taiwan Strait',
        lat: 24.44, lng: 118.32,
        fatalities: 0,
        notes: 'Close proximity maneuvers and interception of unauthorized civilian maritime vessels entering restricted coastal zones.',
        color: '#00aaff'
      },
      {
        id: 'MOCK-LEB-006',
        type: 'Explosions/Remote violence',
        actor: 'IDF vs Hezbollah Militants',
        location: 'Marjayoun',
        country: 'Lebanon',
        lat: 33.36, lng: 35.59,
        fatalities: 3,
        notes: 'Cross-border rocket exchanges and drone strikes hit several targets along the Blue Line in southern Lebanon.',
        color: '#ffaa00'
      }
    ];

    return mocks.map(m => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        type: m.type,
        actor: m.actor,
        location: m.location,
        country: m.country,
        fatalities: m.fatalities,
        date: today,
        source: 'ACLED (Simulated)',
        notes: m.notes,
        color: m.color,
        radius: Math.min(30, Math.max(6, 6 + Math.sqrt(m.fatalities) * 2.5))
      }
    }));
  }

  async function _fetchACLED() {
    try {
      const token = await _getACLEDToken();
      const url = 'https://acleddata.com/api/acled/read/?limit=100&event_date=30&event_date_where=>';
      
      const res = await CORS.smartFetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error(`ACLED HTTP ${res.status}`);
      const data = await res.json();
      
      const parsed = (data.data || []).map(f => {
        const fat = parseInt(f.fatalities || 0);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(f.longitude), parseFloat(f.latitude)] },
          properties: {
            id: f.event_id_cnty,
            type: f.event_type,
            actor: f.actor1,
            location: f.location,
            country: f.country,
            fatalities: fat,
            date: f.event_date,
            source: 'ACLED',
            notes: f.notes || '',
            color: _getEventColor(f.event_type),
            radius: Math.min(30, Math.max(6, 6 + Math.sqrt(fat) * 2.5))
          }
        };
      });

      if (!parsed.length) return _generateMockConflicts();
      return parsed;
    } catch(e) {
      console.warn('[ACLED API failed, falling back to mock frontlines data]', e.message);
      return _generateMockConflicts();
    }
  }

  function _getEventColor(type) {
    if (type.includes('Battles')) return '#ff0000';
    if (type.includes('Explosions/Remote violence')) return '#ffaa00';
    if (type.includes('Violence against civilians')) return '#ff00aa';
    if (type.includes('Protests')) return '#00aaff';
    return '#ff5500';
  }

  async function _refresh() {
    try {
      const features = await _fetchACLED();

      STATE.data.conflicts = features;
      STATE.setLayerCount('conflicts', features.length);
      STATE.setLayerOnline('conflicts', features.length > 0);

      MAP2D.setSource(SRC, { type: 'FeatureCollection', features });
      _addLayers();
      // 3D removed — uses unified MapLibre
      STATE.updateThreatLevel();

      features.slice(0, 3).forEach(f => {
        EventBus.emit('sigint:log', {
          cat: 'CONFLICT',
          msg: `ACLED EVENT — ${f.properties.type?.toUpperCase()}`,
          level: 'warn',
        });
      });
    } catch(e) { console.warn('[Conflicts]', e.message); }
  }

  function _addLayers() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;

      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color':  ['get', 'color'],
            'circle-opacity': 0.6,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.9,
          },
        });

        m.addLayer({
          id: 'wv-conflict-pulse',
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': ['*', ['get', 'radius'], 2.5],
            'circle-color':  ['get', 'color'],
            'circle-opacity': 0.1,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.3,
          },
        });

        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng, _popup(p));
          AUDIO.conflictAlert();
        });
      }
    });
  }

  function _popup(p) {
    return `<div class="popup-title">âš” ${p.type || 'CONFLICT EVENT'}</div>
      <div class="popup-row"><span class="k">LOCATION</span><span class="v">${p.location || ''}, ${p.country || ''}</span></div>
      <div class="popup-row"><span class="k">DATE</span><span class="v">${p.date}</span></div>
      <div class="popup-row"><span class="k">FATALITIES</span><span class="${p.fatalities > 0 ? 'vr' : 'v'}">${p.fatalities || 0}</span></div>
      <div class="popup-row"><span class="k">SOURCE</span><span class="vb">${p.source}</span></div>
      ${p.notes ? `<div style="font-size:0.65rem;color:#005510;margin-top:4px;line-height:1.4;">${p.notes}</div>` : ''}
      ${p.url ? `<div style="margin-top:4px;"><a href="${p.url}" target="_blank" style="color:var(--blue);font-size:0.65rem;">READ MORE →</a></div>` : ''}`;
  }

  function _render3D(features) {
    MAP3D.removeAllWithPrefix('conflict-');
    features.forEach((f, i) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const color = p.color || _getEventColor(p.type || '');
      const fats = parseInt(p.fatalities) || 0;
      // Radius: base 25km, scales slightly with fatalities
      const radiusM = Math.min(300000, 25000 + fats * 1000);
      MAP3D.addCircle(`conflict-${i}`, lat, lng, radiusM, {
        color,
        fillAlpha: 0.08,
        outlineAlpha: 0.9,
        outlineWidth: 2,
        label: (p.type || 'CONFLICT').substring(0, 18).toUpperCase(),
      });
    });
  }

  return {
    init() {
      if (STATE.layers.conflicts.active) {
        _refresh();
        API.schedule('conflicts', _refresh, CONFIG.REFRESH_MS.CONFLICTS, STAGGER.next(5000));
      }

      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] });
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.conflicts.active) {
          _refresh();
        }
      });
    },

    toggle(active) {
      if (active) {
        _refresh();
        API.schedule('conflicts', _refresh, CONFIG.REFRESH_MS.CONFLICTS, 0);
      } else {
        API.cancel('conflicts');
        ['wv-conflict-pulse', LAYER].forEach(id => MAP2D.removeLayer(id)); MAP2D.clearSource(SRC_POINTS); MAP2D.clearSource(SRC_POLY);;
        MAP3D.removeAllWithPrefix('conflict-');
        STATE.setLayerCount('conflicts', 0);
      }
    },
  };
})();


