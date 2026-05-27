// ============================================================
//  GODEYE — Layer 6: CCTV / Cameras
//  Sources: Insecam-scraped live feeds + DOT static cameras
// ============================================================
const LayerCameras = (() => {
  const SRC   = 'wv-cameras';
  const LAYER = 'wv-camera-icons';

  // Static fallback cameras (DOT verified JPEG feeds)
  const STATIC_CAMERAS = [
    { id:'nyc01', name:'Times Square, NYC',    lat:40.7580, lng:-73.9855, stream:'https://webcams.nyctmc.org/api/cameras/a7e3e437-e294-4074-8e72-7b6e0a781dec/image', country:'USA', city:'New York', manufacturer:'DOT' },
    { id:'nyc02', name:'Brooklyn Bridge NYC',  lat:40.7061, lng:-73.9969, stream:'https://webcams.nyctmc.org/api/cameras/16c6396f-f024-4b3e-bded-30e2e04cddd2/image', country:'USA', city:'New York', manufacturer:'DOT' },
    { id:'wsd01', name:'Seattle I-5 NB',       lat:47.6231, lng:-122.3321,stream:'https://images.wsdot.wa.gov/nw/005vc00220.jpg', country:'USA', city:'Seattle', manufacturer:'WSDOT' },
    { id:'wsd02', name:'Seattle I-90',         lat:47.5951, lng:-122.3032,stream:'https://images.wsdot.wa.gov/nw/090vc09950.jpg', country:'USA', city:'Seattle', manufacturer:'WSDOT' },
    { id:'lon01', name:'Tower Bridge, London', lat:51.5055, lng:-0.0754,  stream:'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01083.jpg', country:'UK', city:'London', manufacturer:'TfL' },
    { id:'lon02', name:'Westminster Bridge',   lat:51.5007, lng:-0.1246,  stream:'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01503.jpg', country:'UK', city:'London', manufacturer:'TfL' },
    { id:'sgp01', name:'Marina Bay, SG',       lat:1.2816,  lng:103.8636, stream:'https://images.data.gov.sg/api/traffic-images/2703', country:'Singapore', city:'Singapore', manufacturer:'LTA' },
  ];

  let _cameras = [...STATIC_CAMERAS];
  let _loaded  = false;
  let _cameraInterval = null;

  // â”€â”€ Load scraped Insecam data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function _loadInsecamData() {
    if (_loaded) return;
    try {
      const res  = await fetch('data/insecam_cameras.json');
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const insecam = data.map(c => ({
        id:           'ic_' + c.id,
        name:         [c.city, c.country].filter(Boolean).join(', ') || 'Camera #' + c.id,
        lat:          c.lat,
        lng:          c.lng,
        stream:       c.stream,
        country:      c.country,
        city:         c.city,
        manufacturer: c.manufacturer,
        insecamId:    c.id,
      })).filter(c => c.stream && c.lat && c.lng);
      _cameras = [...STATIC_CAMERAS, ...insecam];
      _loaded  = true;
      STATE.setLayerCount('cameras', _cameras.length);
      MAP2D.setSource(SRC, _buildGeoJSON());
      EventBus.emit('sigint:log', { cat:'CAM', msg:`INSECAM: ${insecam.length} live cameras loaded globally` });
    } catch(e) {
      console.warn('[Cameras] Could not load insecam_cameras.json:', e.message);
    }
  }

  function _buildGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: _cameras.map(c => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          id:    c.id, name: c.name, stream: c.stream,
          city:  c.city || '', country: c.country || '',
          manufacturer: c.manufacturer || '',
          insecamId: c.insecamId || '',
        },
      })),
    };
  }

  function _addLayer() {
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m || m.getLayer(LAYER)) return;
      m.addLayer({
        id: LAYER, type: 'symbol', source: SRC,
        layout: {
          'icon-image': 'icon-camera',
          'icon-size':  ['interpolate', ['linear'], ['zoom'], 2, 0.26, 6, 0.48, 12, 0.76],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'text-field':  ['step', ['zoom'], '', 11, ['get', 'name']],
          'text-size':   9, 'text-offset': [0, 1.4], 'text-anchor': 'top',
        },
        paint: {
          'icon-color': ['case',
            ['!=', ['get', 'insecamId'], ''], '#ff6600',
            '#00ccff'
          ],
          'text-color': '#aaa', 'text-halo-color': '#000', 'text-halo-width': 1,
        },
      });
      MAP2D.onClick(LAYER, e => {
        const p = e.features[0].properties;
        const cam = _cameras.find(c => c.id === p.id);
        if (cam) _openPopup(cam);
      });
    });
  }

  function _openPopup(cam) {
    const panel   = document.getElementById('camera-popup');
    const title   = document.getElementById('camera-popup-title');
    const img     = document.getElementById('camera-feed-img');
    const overlay = document.getElementById('camera-overlay-text');
    const lost    = document.getElementById('signal-lost');

    title.textContent = `${cam.city || cam.name}  [${cam.manufacturer || 'Insecam'}]`;
    panel.classList.remove('hidden');
    panel.style.top = '80px'; panel.style.right = '370px';
    clearInterval(_cameraInterval);

    // Clean up any old iframe
    panel.querySelectorAll('iframe.cam-frame').forEach(f => f.remove());

    const stream = cam.stream || '';
    // Always try as direct image first (all Insecam streams are JPEG/MJPEG endpoints)
    img.style.display = 'block';
    lost.classList.add('hidden');

    function loadImg() {
      const sep = stream.includes('?') ? '&' : '?';
      const src = stream + sep + '_t=' + Date.now();
      const t = new Image();
      t.crossOrigin = 'anonymous';
      t.onload = () => {
        img.src = src; img.style.display = 'block';
        lost.classList.add('hidden');
        overlay.textContent = `${(cam.city||cam.country||'').toUpperCase()} | ${cam.manufacturer||'IP CAM'} | ${new Date().toUTCString()}`;
        if (cam.insecamId) {
          overlay.innerHTML += ` <a href="http://insecam.org/en/view/${cam.insecamId}/" target="_blank"
            style="color:var(--amber);text-decoration:none;font-size:0.62rem;">&#128279; INSECAM</a>`;
        }
      };
      t.onerror = () => {
        img.style.display = 'none';
        lost.classList.remove('hidden');
        overlay.textContent = `SIGNAL LOST | ${cam.city || cam.country}`;
        // Still provide the insecam link
        if (cam.insecamId) {
          overlay.innerHTML += ` <a href="http://insecam.org/en/view/${cam.insecamId}/" target="_blank"
            style="color:var(--amber);text-decoration:none;font-size:0.62rem;">&#128279; VIEW ON INSECAM</a>`;
        }
      };
      t.src = src;
    }

    loadImg();
    _cameraInterval = setInterval(loadImg, 5000);
  }

  document.getElementById('btn-close-camera')?.addEventListener('click', () => {
    clearInterval(_cameraInterval);
    document.getElementById('camera-popup')?.querySelectorAll('iframe.cam-frame').forEach(f => f.remove());
    document.getElementById('camera-popup')?.classList.add('hidden');
  });

  return {
    init() {
      STATE.setLayerCount('cameras', _cameras.length);
      STATE.setLayerOnline('cameras', true);
      MAP2D.whenReady(() => {
        MAP2D.setSource(SRC, _buildGeoJSON());
        if (STATE.layers.cameras.active) { _addLayer(); _loadInsecamData(); }
      });
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.cameras.active) { MAP2D.setSource(SRC, _buildGeoJSON()); _addLayer(); }
      });
    },
    toggle(active) {
      if (active) {
        MAP2D.setSource(SRC, _buildGeoJSON());
        _addLayer();
        STATE.setLayerOnline('cameras', true);
        _loadInsecamData();
      } else {
        MAP2D.removeLayer(LAYER);
        MAP2D.clearSource(SRC);
        clearInterval(_cameraInterval);
        document.getElementById('camera-popup')?.classList.add('hidden');
        STATE.setLayerOnline('cameras', false);
      }
    },
  };
})();

