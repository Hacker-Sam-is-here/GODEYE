// ============================================================
//  GODEYE — Layer 9: Maritime Lanes & Chokepoints
// ============================================================
const LayerMaritime = (() => {
  const SRC_LANES = 'wv-lanes';
  const SRC_CHOKE = 'wv-chokepoints';

  const SHIPPING_LANES = {
    type: 'FeatureCollection',
    features: [
      { type:'Feature', properties:{ name:'North Atlantic Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[-73.9,40.7],[-60,42],[-40,48],[-20,50],[-5,48],[0,51],[2,51]] }},
      { type:'Feature', properties:{ name:'Trans-Pacific Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[-118.2,33.7],[-140,38],[-170,35],[170,32],[144,35],[140,35]] }},
      { type:'Feature', properties:{ name:'Indian Ocean Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[32.6,30.7],[43.5,12.6],[55,17],[65,22],[72,18],[80,10],[100,5],[103.8,1.3]] }},
      { type:'Feature', properties:{ name:'Europe-Asia Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[4,52],[2,51],[0,50],[-5,36],[5,36],[32,30],[43,12],[55,14],[72,22],[80,8],[100,3],[103.8,1.3],[110,20],[121,29]] }},
      { type:'Feature', properties:{ name:'Cape of Good Hope Route', traffic:'MEDIUM' },
        geometry:{ type:'LineString', coordinates:[[2,52],[0,50],[-5,36],[18,-34],[35,-30],[55,-20],[80,-10],[100,0],[103.8,1.3]] }},
      { type:'Feature', properties:{ name:'Panama Canal Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[-73.9,40.7],[-75,30],[-79.5,9.1],[-90,13],[-100,18],[-105,23],[-115,30],[-118.2,33.7]] }},
      { type:'Feature', properties:{ name:'Red Sea Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[32,30],[33,28],[35,24],[38,20],[43,12],[50,12],[55,15]] }},
      { type:'Feature', properties:{ name:'South China Sea Route', traffic:'HIGH' },
        geometry:{ type:'LineString', coordinates:[[103.8,1.3],[107,12],[110,20],[115,22],[120,24],[121,25]] }},
    ],
  };

  const CHOKEPOINTS = {
    type: 'FeatureCollection',
    features: [
      { type:'Feature', properties:{ name:'Strait of Hormuz', daily_vessels:'~17M barrels oil/day', importance:'Critical oil transit', status:'normal' },
        geometry:{ type:'Point', coordinates:[56.4,26.6] }},
      { type:'Feature', properties:{ name:'Suez Canal', daily_vessels:'~50 ships/day', importance:'Europe-Asia shortcut', status:'normal' },
        geometry:{ type:'Point', coordinates:[32.6,30.7] }},
      { type:'Feature', properties:{ name:'Strait of Malacca', daily_vessels:'~83,000 ships/year', importance:'Asia Pacific gateway', status:'normal' },
        geometry:{ type:'Point', coordinates:[103.8,1.3] }},
      { type:'Feature', properties:{ name:'Bab-el-Mandeb', daily_vessels:'~21,000 ships/year', importance:'Red Sea access', status:'disrupted' },
        geometry:{ type:'Point', coordinates:[43.5,12.6] }},
      { type:'Feature', properties:{ name:'Panama Canal', daily_vessels:'~14,000 ships/year', importance:'Pacific-Atlantic link', status:'normal' },
        geometry:{ type:'Point', coordinates:[-79.5,9.1] }},
      { type:'Feature', properties:{ name:'Danish Straits', daily_vessels:'~40,000 ships/year', importance:'Baltic Sea access', status:'elevated' },
        geometry:{ type:'Point', coordinates:[10.5,55.5] }},
      { type:'Feature', properties:{ name:'Taiwan Strait', daily_vessels:'~88 ships/day', importance:'Global tech supply chain', status:'elevated' },
        geometry:{ type:'Point', coordinates:[120.1,24.0] }},
      { type:'Feature', properties:{ name:'Strait of Gibraltar', daily_vessels:'~300+ ships/day', importance:'Med-Atlantic gateway', status:'normal' },
        geometry:{ type:'Point', coordinates:[-5.4,35.9] }},
    ],
  };

  const STATUS_COLORS = { normal:'#00ff41', elevated:'#ffff00', disrupted:'#ff6600', blocked:'#ff0000' };

  return {
    init() {
      if (STATE.layers.maritime.active) {
        STATE.setLayerCount('maritime', CHOKEPOINTS.features.length);
        STATE.setLayerOnline('maritime', true);
      }

      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC_LANES, SHIPPING_LANES);
        MAP2D.setSource(SRC_CHOKE, CHOKEPOINTS);

        if (STATE.layers.maritime.active && STATE.mapMode === '2d') {
          _addLayers();
        }
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.maritime.active) {
          MAP2D.setSource(SRC_LANES, SHIPPING_LANES);
          MAP2D.setSource(SRC_CHOKE, CHOKEPOINTS);
          _addLayers();
        }
      });
    },

    toggle(active) {
      if (active) {
        _addLayers();
        STATE.setLayerCount('maritime', CHOKEPOINTS.features.length);
        STATE.setLayerOnline('maritime', true);
      } else {
        ['wv-lanes-line', 'wv-choke-circles', 'wv-choke-labels'].forEach(id => MAP2D.removeLayer(id));
        MAP2D.clearSource(SRC_LANES);
        MAP2D.clearSource(SRC_CHOKE);
        STATE.setLayerCount('maritime', 0);
      }
    },
  };

  function _addLayers() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m || m.getLayer('wv-lanes-line')) return;

      m.addLayer({
        id: 'wv-lanes-line',
        type: 'line',
        source: SRC_LANES,
        paint: {
          'line-color': '#00aaff',
          'line-width': 1.2,
          'line-opacity': 0.4,
          'line-dasharray': [3, 3],
        },
      });

      m.addLayer({
        id: 'wv-choke-circles',
        type: 'circle',
        source: SRC_CHOKE,
        paint: {
          'circle-radius': 10,
          'circle-color': ['match', ['get', 'status'],
            'normal', '#00ff41', 'elevated', '#ffff00', 'disrupted', '#ff6600', '#ff0000'],
          'circle-opacity': 0.6,
          'circle-stroke-color': ['match', ['get', 'status'],
            'normal', '#00ff41', 'elevated', '#ffff00', 'disrupted', '#ff6600', '#ff0000'],
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      });

      m.addLayer({
        id: 'wv-choke-labels',
        type: 'symbol',
        source: SRC_CHOKE,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-offset': [0, 1.5],
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#00aaff',
          'text-halo-color': '#000',
          'text-halo-width': 1.5,
        },
      });

      MAP2D.onClick('wv-choke-circles', e => {
        const p = e.features[0].properties;
        const statusColor = STATUS_COLORS[p.status] || '#00ff41';
        MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng,
          `<div class="popup-title">âš“ ${p.name}</div>
           <div class="popup-row"><span class="k">DAILY TRAFFIC</span><span class="vb">${p.daily_vessels}</span></div>
           <div class="popup-row"><span class="k">STATUS</span><span style="color:${statusColor}">${(p.status||'').toUpperCase()}</span></div>
           <div class="popup-row"><span class="k">IMPORTANCE</span><span class="v">${p.importance}</span></div>`
        );
      });
    });
  }
})();

