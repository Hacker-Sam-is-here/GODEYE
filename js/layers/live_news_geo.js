// ============================================================
//  GODEYE — Layer: Live News Geo-Dots (GDELT + YouTube)
//  Click a dot → opens live stream or news source
// ============================================================
const LayerLiveNewsGeo = (() => {
  const SRC   = 'wv-livenews-geo';
  const LAYER = 'wv-livenews-geo-layer';
  const LAYER_PULSE = 'wv-livenews-pulse';

  // Static geo-tagged live stream locations — 40 channels worldwide
  const LIVE_STREAMS = [
    // ── 🌍 Global / International ──────────────────────────────────────────
    { name: 'Al Jazeera English', lat: 25.28,  lng: 51.49,   region: 'MENA', url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1' },
    { name: 'France 24 English',  lat: 48.85,  lng: 2.35,    region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1' },
    { name: 'Bloomberg TV',       lat: 40.71,  lng: -74.01,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg&autoplay=1&mute=1' },
    { name: 'Sky News',           lat: 51.51,  lng: -0.12,   region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNG8-8RFPA&autoplay=1&mute=1' },
    { name: 'BBC World News',     lat: 51.52,  lng: -0.14,   region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UC16niRr50-MSBwiO3YDb3RA&autoplay=1&mute=1' },
    { name: 'DW News',            lat: 52.51,  lng: 13.37,   region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCEg&autoplay=1&mute=1' },
    { name: 'Euronews',           lat: 45.74,  lng: 4.83,    region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UCrnCZPgTDLRfz7z3XIMYG3g&autoplay=1&mute=1' },
    { name: 'TRT World',          lat: 41.01,  lng: 28.97,   region: 'EUR',  url: 'https://www.youtube.com/embed/live_stream?channel=UC7DHo7hFh3Bd-UqS3KT2Zaw&autoplay=1&mute=1' },
    { name: 'i24 News',           lat: 32.08,  lng: 34.78,   region: 'MENA', url: 'https://www.youtube.com/embed/live_stream?channel=UCXpCekwIkGStHMPqBhtnqLg&autoplay=1&mute=1' },
    { name: 'CGTN',               lat: 39.91,  lng: 116.39,  region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCalu4olVgRkJriK4HLZRM7g&autoplay=1&mute=1' },
    { name: 'NHK World',          lat: 35.68,  lng: 139.76,  region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UC6miMFHMfzRm2sCeZBB4LGg&autoplay=1&mute=1' },
    { name: 'Arirang TV',         lat: 37.57,  lng: 126.98,  region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCYe3BeY3ovnqSKLNZ_aLmLg&autoplay=1&mute=1' },
    { name: 'RT News',            lat: 55.76,  lng: 37.61,   region: 'RU',   url: 'https://www.youtube.com/embed/live_stream?channel=UCpwvZYkGwDPflCSjSoSGMXA&autoplay=1&mute=1' },
    { name: 'Africanews',         lat: 3.86,   lng: 11.52,   region: 'AFR',  url: 'https://www.youtube.com/embed/live_stream?channel=UCaba3MqJDOhuxh6bEKXUGGg&autoplay=1&mute=1' },
    { name: 'Sky News Australia',  lat: -33.87, lng: 151.20,  region: 'AUS',  url: 'https://www.youtube.com/embed/live_stream?channel=UCN3oDzHHHhlcqLBPd8gfB8A&autoplay=1&mute=1' },
    { name: 'ABC Australia',      lat: -35.28, lng: 149.13,  region: 'AUS',  url: 'https://www.youtube.com/embed/live_stream?channel=UCVgO39Bk5sMo66-6o6Spn6Q&autoplay=1&mute=1' },
    { name: 'WION',               lat: 28.62,  lng: 77.21,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCkxSzANXo0dOkRj9GnK-M1Q&autoplay=1&mute=1' },

    // ── 🇺🇸 American Networks ──────────────────────────────────────────────
    { name: 'NBC News NOW',       lat: 40.76,  lng: -73.98,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCeY0bbntWzzVIaj2z3QigXg&autoplay=1&mute=1' },
    { name: 'LiveNOW from FOX',   lat: 33.75,  lng: -84.39,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCJg9wBPyKMNA5sRDnvzmkdg&autoplay=1&mute=1' },
    { name: 'CBS News',           lat: 40.76,  lng: -73.96,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UC8p1vwvB0c0M_BTBq6nY2ow&autoplay=1&mute=1' },
    { name: 'ABC News',           lat: 40.75,  lng: -73.99,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCBi2mrWuNuyYy4gbM6fU18Q&autoplay=1&mute=1' },
    { name: 'CNN International',  lat: 33.74,  lng: -84.38,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCupvZG-5ko_eiXAupbDfxWw&autoplay=1&mute=1' },
    { name: 'FOX Weather',        lat: 35.15,  lng: -90.05,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCxS4h56N_E6q_K5yJ45X16g&autoplay=1&mute=1' },
    { name: 'PBS NewsHour',       lat: 38.90,  lng: -77.04,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UC6ZFN9Tx6xh-skXCuRHCDpQ&autoplay=1&mute=1' },
    { name: 'Bloomberg TV (NY)',  lat: 40.70,  lng: -74.00,  region: 'US',   url: 'https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg&autoplay=1&mute=1' },

    // ── 🇮🇳 Indian Networks ────────────────────────────────────────────────
    { name: 'Aaj Tak',            lat: 28.63,  lng: 77.22,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCtqZkgP5u1-N2021c_q43_A&autoplay=1&mute=1' },
    { name: 'Republic World',     lat: 19.07,  lng: 72.88,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCw9o58vWjGkG3hD2J1_848A&autoplay=1&mute=1' },
    { name: 'NDTV',               lat: 28.64,  lng: 77.20,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCZFMm1mMw0F81Z37aaEzTUA&autoplay=1&mute=1' },
    { name: 'India TV',           lat: 28.45,  lng: 77.03,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UC54t4k7V-rXk7fR-32-6Q2w&autoplay=1&mute=1' },
    { name: 'CNN-News18',         lat: 12.97,  lng: 77.59,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCz9Y-29f_r5rGZ5Vp4_9G1A&autoplay=1&mute=1' },
    { name: 'Zee News',           lat: 28.50,  lng: 77.08,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UC6bn8P-k5Kj7-d6sF5S6lYg&autoplay=1&mute=1' },
    { name: 'Times Now',          lat: 19.06,  lng: 72.86,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCt2NxqK5DQZa_62XTMF-S0w&autoplay=1&mute=1' },
    { name: 'DD India',           lat: 28.62,  lng: 77.21,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCF5t6wdnCBtGDUBIl1D0DIQ&autoplay=1&mute=1' },

    // ── Others ─────────────────────────────────────────────────────────────
    { name: 'WION (Delhi)',       lat: 28.55,  lng: 77.25,   region: 'ASIA', url: 'https://www.youtube.com/embed/live_stream?channel=UCkxSzANXo0dOkRj9GnK-M1Q&autoplay=1&mute=1' },
  ];

  function _buildGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: LIVE_STREAMS.map((s, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng + (s.lngOff || 0), s.lat + (s.latOff || 0)] },
        properties: { ...s, index: i }
      }))
    };
  }

  function _render2D() {
    const gj = _buildGeoJSON();
    MAP2D.setSource(SRC, gj);
    MAP2D.whenReady(() => {
      const m = MAP2D.map;
      if (!m) return;
      if (!m.getLayer(LAYER)) {
        m.addLayer({
          id: LAYER, type: 'symbol', source: SRC,
          layout: {
            'icon-image': 'icon-news',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 6, 0.55, 12, 0.80],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['step', ['zoom'], '', 7, ['get', 'name']],
            'text-size': 9,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'icon-color': '#ff4081',
            'text-color': '#ff4081',
            'text-halo-color': '#000',
            'text-halo-width': 1,
          }
        });
        MAP2D.onClick(LAYER, e => {
          const p = e.features[0].properties;
          const popupHtml = `
            <div class="popup-title">ðŸ“º ${p.name}</div>
            <div class="popup-row"><span class="k">REGION</span><span class="vb">${p.region}</span></div>
            <div class="popup-row"><span class="k">STATUS</span><span class="vr">â— LIVE</span></div>
            <div style="margin-top:6px;display:flex;gap:6px;">
              <button onclick="LiveFeedPanel.openStream(${JSON.stringify(p.url).replace(/"/g,"'")}, ${JSON.stringify(p.name).replace(/"/g,"'")})"
                style="flex:1;background:rgba(255,64,129,0.2);border:1px solid #ff4081;color:#ff4081;font-family:var(--font);font-size:0.65rem;padding:5px;cursor:pointer;border-radius:3px;">
                â–¶ OPEN STREAM
              </button>
            </div>`;
          MAP2D.showPopup(e.lngLat.lat, e.lngLat.lng, popupHtml);
          EventBus.emit('sigint:log', { cat: 'MEDIA', msg: `LIVE FEED ACCESSED: ${p.name}` });
        });
      }
    });
    STATE.setLayerCount('live_news_geo', LIVE_STREAMS.length);
    STATE.setLayerOnline('live_news_geo', true);
    STATE.data.liveNewsGeo = LIVE_STREAMS;
  }

  return {
    init() {
      MAP2D.whenReady(() => MAP2D.setSource(SRC, { type: 'FeatureCollection', features: [] }));
      EventBus.on('map2d:styleChanged', () => {
        if (STATE.layers.live_news_geo.active) _render2D();
      });
    },
    toggle(active) {
      if (active) {
        _render2D();
      } else {
        MAP2D.removeLayer(LAYER);
        MAP2D.clearSource(SRC);
        STATE.setLayerCount('live_news_geo', 0);
      }
    },
    openStream(url, name) {
      EventBus.emit('tv:open', { url, name });
    },
  };
})();

