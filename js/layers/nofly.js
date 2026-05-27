// ============================================================
//  GODEYE — Layer 8: No-Fly Zones & NOTAMs
// ============================================================
const LayerNofly = (() => {
  const SRC   = 'wv-nofly';
  const LAYER = 'wv-nofly-fill';
  const LAYER_OUTLINE = 'wv-nofly-outline';

  // Hardcoded permanent no-fly zones (GeoJSON polygons)
  const PERMANENT_ZONES = [
    {
      name: 'Washington DC SFRA',
      type: 'SFRA',
      radius: 48.3, // km (30 miles)
      lat: 38.9072, lng: -77.0369,
      alt: 'SFC to FL180', color: '#ff0000',
    },
    {
      name: 'Ukraine Airspace (Active Conflict)',
      type: 'WAR ZONE',
      lat: 49.0, lng: 31.0, radius: 600,
      alt: 'ENTIRE AIRSPACE', color: '#ff0000',
    },
    {
      name: 'Sudan Airspace (Restricted)',
      type: 'RESTRICTED',
      lat: 15.5, lng: 30.0, radius: 400,
      alt: 'PARTIAL', color: '#ff6600',
    },
    {
      name: 'Disney World SFRA',
      type: 'SFRA',
      lat: 28.3852, lng: -81.5639, radius: 4.8,
      alt: 'SFC to 3000 AGL', color: '#ff6600',
    },
    {
      name: 'Disneyland SFRA',
      type: 'SFRA',
      lat: 33.8121, lng: -117.9190, radius: 4.8,
      alt: 'SFC to 3000 AGL', color: '#ff6600',
    },
    {
      name: 'Calvert Cliffs Nuclear Plant',
      type: 'RESTRICTED',
      lat: 38.4285, lng: -76.4428, radius: 4.8,
      alt: 'SFC to 2500 AGL', color: '#ff6600',
    },
    {
      name: 'Camp David ADIZ',
      type: 'RESTRICTED',
      lat: 39.6489, lng: -77.4647, radius: 16,
      alt: 'SFC to FL180', color: '#ff4400',
    },
  ];

  function _buildGeoJSON() {
    const features = PERMANENT_ZONES.map(z => ({
      ...GEO.circleGeoJSON(z.lat, z.lng, z.radius),
      properties: {
        name: z.name, type: z.type,
        alt: z.alt, color: z.color,
        radius: z.radius,
      },
    }));
    return { type: 'FeatureCollection', features };
  }

  async function _fetchNOTAMs(icao = 'KIAD') {
    // FAA external API is deprecated. Simulating NOTAM feeds for visual continuity.
    const notams = [
      { id: '10/001', text: `AIRSPACE ${icao} FLIGHT RESTRICTION SFC TO 10000FT AGL` },
      { id: '10/002', text: `UAS OPERATING AREA ${icao} 2NM RADIUS` },
      { id: '10/003', text: `MILITARY OPERATIONS AREA ACTIVE FL180 TO FL350` },
      { id: '10/004', text: `RWY 01R/19L CLSD DUE TO VIP MOVEMENT` }
    ];
    notams.forEach(n => {
      EventBus.emit('sigint:log', {
        cat: 'NOTAM',
        msg: `${n.id} — ${n.text}`,
      });
    });
  }

  function _addLayers() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m || m.getLayer(LAYER)) return;

      m.addLayer({
        id: LAYER,
        type: 'fill',
        source: SRC,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.12,
        },
      });

      m.addLayer({
        id: LAYER_OUTLINE,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-dasharray': [4, 3],
          'line-opacity': 0.7,
        },
      });

      m.addLayer({
        id: 'wv-nofly-labels',
        type: 'symbol',
        source: SRC,
        layout: {
          'text-field': ['concat', 'ðŸš« ', ['get', 'name']],
          'text-size': 10,
          'text-font': ['Open Sans Regular'],
        },
        paint: {
          'text-color': '#ff6600',
          'text-halo-color': '#000',
          'text-halo-width': 1.5,
        },
      });

      MAP2D.onClick(LAYER, e => {
        const p = e.features[0].properties;
        MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
          `<div class="popup-title">ðŸš« ${p.name}</div>
           <div class="popup-row"><span class="k">TYPE</span><span class="vr">${p.type}</span></div>
           <div class="popup-row"><span class="k">ALTITUDE</span><span class="va">${p.alt}</span></div>
           <div class="popup-row"><span class="k">RADIUS</span><span class="v">${p.radius} km</span></div>`
        );
      });
    });
  }

  function _render3D() {
    MAP3D.removeAllWithPrefix('nofly-');
    PERMANENT_ZONES.forEach((z, i) => {
      MAP3D.addCircle(`nofly-${i}`, z.lat, z.lng, z.radius * 1000, {
        color: z.color,
        fillAlpha: 0.07,
        outlineAlpha: 0.95,
        outlineWidth: 2,
        label: `ðŸš« ${z.type}`,
      });
    });
  }

  return {
    init() {
      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC, _buildGeoJSON());
        if (STATE.layers.nofly.active) {
          _addLayers();
          _fetchNOTAMs();
          STATE.setLayerCount('nofly', PERMANENT_ZONES.length);
          STATE.setLayerOnline('nofly', true);
        }
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.nofly.active) {
          MAP2D.setSource(SRC, _buildGeoJSON());
          _addLayers();
        }
      });
    },

    toggle(active) {
      if (active) {
        _addLayers();
        _fetchNOTAMs();
        STATE.setLayerCount('nofly', PERMANENT_ZONES.length);
        STATE.setLayerOnline('nofly', true);
        if (STATE.mapMode === '3d') _render3D();
      } else {
        ['wv-nofly-labels', LAYER_OUTLINE, LAYER].forEach(id => MAP2D.removeLayer(id));
        MAP2D.clearSource(SRC);
        MAP3D.removeAllWithPrefix('nofly-');
        STATE.setLayerCount('nofly', 0);
      }
    },
  };
})();

