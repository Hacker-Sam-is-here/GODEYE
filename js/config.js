// ============================================================
//  GODEYE — CONFIG BLOCK
//  Fill in your free API keys below before opening index.html
// ============================================================
const CONFIG = {
  // ── API Keys ────────────────────────────────────────────────
  // Keys are NEVER stored here when deployed.
  // They live in Render environment variables and are injected
  // server-side via /api/* proxy endpoints.
  // For LOCAL development only, you can temporarily set them here.
  AISSTREAM_KEY:  '',   // → server injects via /api/ais-key
  ACLED_EMAIL:    '',   // → server proxies via /api/acled
  ACLED_PASSWORD: '',   // → server proxies via /api/acled
  FIRMS_API_KEY:  '',   // → server proxies via /api/firms
  N2YO_API_KEY:   '',   // → server proxies via /api/n2yo/*
  GOOGLE_MAPS_KEY: '',

  // Runtime feature flags — populated by _fetchServerConfig() in main.js
  SERVER_MODE: false,   // true when running behind server.js
  HAS_AISSTREAM: false,
  HAS_ACLED: false,
  HAS_FIRMS: false,
  HAS_N2YO: false,

  DEFAULT_LAT: 30.2672,
  DEFAULT_LNG: -97.7431,
  DEFAULT_ZOOM: 4,

  REFRESH_MS: {
    FLIGHTS: 15000,
    SHIPS: 30000,
    SATELLITES: 5000,
    CONFLICTS: 60000,
    EARTHQUAKES: 120000,
    LIVE_NEWS: 900000,
    CITY_NEWS: 60000,
    CYBER: 300000,
    CAMERAS: 3000,
    FIRES: 900000,
    WEATHER: 900000,
    MARKETS: 300000,
  }
};

// ── Quick Jump / View Presets ────────────────────────────────
const HOTSPOTS = [
  { name: 'Taiwan Strait', lat: 24.0, lng: 120.1, zoom: 7 },
  { name: 'Strait of Hormuz', lat: 26.6, lng: 56.4, zoom: 8 },
  { name: 'Suez Canal', lat: 30.7, lng: 32.6, zoom: 9 },
  { name: 'Strait of Malacca', lat: 1.3, lng: 103.8, zoom: 7 },
  { name: 'Ukraine Front Lines', lat: 48.5, lng: 37.0, zoom: 7 },
  { name: 'South China Sea', lat: 12.0, lng: 114.0, zoom: 6 },
  { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.5, zoom: 8 },
  { name: 'Korean DMZ', lat: 38.0, lng: 126.8, zoom: 9 },
  { name: 'Kashmir LOC', lat: 34.5, lng: 74.5, zoom: 8 },
  { name: 'Gaza Strip', lat: 31.4, lng: 34.3, zoom: 10 },
  { name: 'Sahel Region', lat: 14.5, lng: 2.0, zoom: 5 },
  { name: 'Arctic Circle', lat: 78.0, lng: 15.0, zoom: 5 },
  { name: 'Panama Canal', lat: 9.1, lng: -79.5, zoom: 9 },
  { name: 'Cape of Good Hope', lat: -34.4, lng: 18.5, zoom: 8 },
  { name: 'Strait of Gibraltar', lat: 35.9, lng: -5.4, zoom: 9 },
  { name: 'Svalbard', lat: 78.2, lng: 15.6, zoom: 7 },
  { name: 'Diego Garcia', lat: -7.3, lng: 72.4, zoom: 10 },
  { name: 'Guam', lat: 13.4, lng: 144.8, zoom: 10 },
  { name: 'Okinawa', lat: 26.5, lng: 128.0, zoom: 9 },
  { name: 'Cyprus', lat: 35.1, lng: 33.4, zoom: 9 },
  { name: 'Persian Gulf', lat: 26.5, lng: 52.0, zoom: 6 },
  { name: 'Red Sea', lat: 20.0, lng: 38.5, zoom: 6 },
  { name: 'Black Sea', lat: 43.0, lng: 34.0, zoom: 6 },
  { name: 'Baltic Sea', lat: 58.5, lng: 19.0, zoom: 6 },
  { name: 'Barents Sea', lat: 74.0, lng: 35.0, zoom: 5 },
  { name: 'Sudan Conflict', lat: 15.5, lng: 32.5, zoom: 6 },
  { name: 'Myanmar', lat: 19.7, lng: 96.0, zoom: 6 },
  { name: 'Yemen', lat: 15.5, lng: 48.0, zoom: 6 },
  { name: 'DRC Congo', lat: -2.5, lng: 28.5, zoom: 6 },
  { name: 'Somalia', lat: 5.0, lng: 46.0, zoom: 6 },
];

// ── Active War / Conflict Zones (static OSINT intel) ─────────
const WAR_ZONES = [
  { name: 'Ukraine–Russia War', lat: 48.5, lng: 37.0, severity: 'ACTIVE_WAR', description: 'Large-scale ground conflict. Front lines across eastern & southern Ukraine.' },
  { name: 'Gaza / Israel', lat: 31.4, lng: 34.3, severity: 'ACTIVE_WAR', description: 'Active urban warfare. Ongoing military operations in Gaza Strip.' },
  { name: 'Sudan Civil War', lat: 15.5, lng: 32.5, severity: 'ACTIVE_WAR', description: 'SAF vs RSF conflict. Humanitarian crisis. Khartoum heavily affected.' },
  { name: 'Myanmar Civil War', lat: 19.7, lng: 96.0, severity: 'ACTIVE_WAR', description: 'Military junta vs resistance forces. Multiple active fronts.' },
  { name: 'DRC Eastern Conflict', lat: -1.5, lng: 29.0, severity: 'ACTIVE_WAR', description: 'M23 rebels and FDLR active in eastern DRC. Goma under pressure.' },
  { name: 'Yemen War', lat: 15.5, lng: 48.0, severity: 'ACTIVE_WAR', description: 'Houthi forces vs Saudi-led coalition. Red Sea attacks ongoing.' },
  { name: 'Syria Conflict', lat: 35.0, lng: 38.5, severity: 'HIGH_TENSION', description: 'Residual fighting. Turkish operations in north. HTS control in Idlib.' },
  { name: 'Lebanon', lat: 33.8, lng: 35.5, severity: 'HIGH_TENSION', description: 'Ceasefire fragile. Hezbollah–Israel border tensions elevated.' },
  { name: 'Sahel / Mali–Niger', lat: 14.5, lng: 2.0, severity: 'HIGH_TENSION', description: 'JNIM & ISGS jihadist insurgency. Wagner/Russia-linked forces present.' },
  { name: 'Somalia / al-Shabaab', lat: 5.0, lng: 46.0, severity: 'HIGH_TENSION', description: 'Al-Shabaab controls large rural areas. Frequent attacks in Mogadishu.' },
  { name: 'Red Sea Corridor', lat: 14.0, lng: 43.0, severity: 'HIGH_TENSION', description: 'Houthi drone & missile attacks on commercial shipping.' },
  { name: 'Taiwan Strait', lat: 24.0, lng: 120.5, severity: 'ELEVATED', description: 'PLA military exercises near Taiwan. Strategic flashpoint.' },
  { name: 'Korean DMZ', lat: 38.0, lng: 126.8, severity: 'ELEVATED', description: 'DPRK missile tests. US-ROK joint exercises. Heightened readiness.' },
];

// ── Nuclear / Critical Infrastructure ────────────────────────
const INFRASTRUCTURE_SITES = [
  { name: 'Zaporizhzhia NPP', lat: 47.51, lng: 34.58, type: 'nuclear', country: 'Ukraine', status: 'OCCUPIED' },
  { name: 'Bushehr NPP', lat: 28.83, lng: 50.89, type: 'nuclear', country: 'Iran', status: 'OPERATIONAL' },
  { name: 'Kudankulam NPP', lat: 8.17, lng: 77.71, type: 'nuclear', country: 'India', status: 'OPERATIONAL' },
  { name: 'Yongbyon Complex', lat: 39.78, lng: 125.74, type: 'nuclear', country: 'North Korea', status: 'ACTIVE' },
  { name: 'Natanz Enrichment', lat: 33.72, lng: 51.73, type: 'nuclear', country: 'Iran', status: 'ACTIVE' },
  { name: 'Sellafield', lat: 54.42, lng: -3.50, type: 'nuclear', country: 'UK', status: 'OPERATIONAL' },
  { name: 'Strait of Hormuz LNG', lat: 26.6, lng: 56.4, type: 'energy', country: 'Regional', status: 'CRITICAL' },
  { name: 'Nord Stream 2 Damage', lat: 55.53, lng: 15.63, type: 'energy', country: 'Baltic Sea', status: 'DAMAGED' },
  { name: 'Suez Canal Authority', lat: 30.58, lng: 32.26, type: 'chokepoint', country: 'Egypt', status: 'OPERATIONAL' },
  { name: 'Panama Canal', lat: 9.08, lng: -79.68, type: 'chokepoint', country: 'Panama', status: 'OPERATIONAL' },
  { name: 'Bab-el-Mandeb', lat: 12.58, lng: 43.47, type: 'chokepoint', country: 'Regional', status: 'HIGH RISK' },
  { name: 'Malacca Strait', lat: 1.26, lng: 103.82, type: 'chokepoint', country: 'Regional', status: 'MONITORED' },
];

// ── GPS Jamming Zones (known active interference regions) ────
const GPS_JAM_ZONES = [
  { name: 'Eastern Ukraine', lat: 48.5, lng: 37.0, radius: 250, severity: 'severe', note: 'Active ECM operations' },
  { name: 'Eastern Mediterranean', lat: 34.5, lng: 35.0, radius: 300, severity: 'severe', note: 'GPS spoofing affecting aviation' },
  { name: 'Red Sea', lat: 14.0, lng: 43.0, radius: 200, severity: 'moderate', note: 'Houthi ECM activity' },
  { name: 'Baltic Region', lat: 58.5, lng: 22.0, radius: 350, severity: 'moderate', note: 'Russian ECM emissions' },
  { name: 'Black Sea', lat: 43.0, lng: 34.0, radius: 200, severity: 'moderate', note: 'Spoofing near Crimea' },
  { name: 'Syrian Border', lat: 36.5, lng: 36.5, radius: 150, severity: 'moderate', note: 'Multi-actor ECM' },
  { name: 'North Korea Border', lat: 38.5, lng: 126.0, radius: 100, severity: 'low', note: 'Periodic jamming events' },
];

// ── Country → Local RSS Feed ─────────────────────────────────
const LOCAL_RSS_MAP = {
  'India': 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  'Pakistan': 'https://www.dawn.com/feed',
  'United Kingdom': 'https://feeds.bbci.co.uk/news/uk/rss.xml',
  'France': 'https://www.lemonde.fr/en/rss/une.xml',
  'Germany': 'https://www.dw.com/en/top-stories/s-9097/rss',
  'Japan': 'https://www3.nhk.or.jp/nhkworld/en/news/feeds/',
  'Australia': 'https://www.abc.net.au/news/feed/51120/rss.xml',
  'Brazil': 'https://agenciabrasil.ebc.com.br/en/rss/ultimasnoticias/feed.xml',
  'Russia': 'https://tass.com/rss/v2.xml',
  'China': 'https://www.scmp.com/rss/91/feed',
  'United States': 'https://feeds.npr.org/1001/rss.xml',
  'Canada': 'https://www.cbc.ca/cmlink/rss-topstories',
  'Turkey': 'https://www.hurriyetdailynews.com/rss.aspx',
  'South Korea': 'https://koreajoongangdaily.joins.com/rss/feeds/totalFeeds.xml',
  'Indonesia': 'https://www.thejakartapost.com/feed',
  'Nigeria': 'https://www.thisdaylive.com/index.php/feed/',
  'South Africa': 'https://www.dailymaverick.co.za/feed/',
  'Ukraine': 'https://www.kyivpost.com/rss',
};

// ── Live TV Channels (expanded from 4 → 25+) ─────────────────
const TV_CHANNELS = {
  aje: { name: 'AL JAZEERA', src: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1', region: 'MENA' },
  dw: { name: 'DW NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCEg&autoplay=1&mute=1', region: 'EUR' },
  france24: { name: 'FRANCE 24', src: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1', region: 'EUR' },
  sky: { name: 'SKY NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNG8-8RFPA&autoplay=1&mute=1', region: 'EUR' },
  bbc: { name: 'BBC NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UC16niRr50-MSBwiO3YDb3RA&autoplay=1&mute=1', region: 'EUR' },
  cnn: { name: 'CNN INT\'L', src: 'https://www.youtube.com/embed/live_stream?channel=UCupvZG-5ko_eiXAupbDfxWw&autoplay=1&mute=1', region: 'US' },
  abc: { name: 'ABC NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCBi2mrWuNuyYy4gbM6fU18Q&autoplay=1&mute=1', region: 'US' },
  nbc: { name: 'NBC NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCeY0bbntWzzVIaj2z3QigXg&autoplay=1&mute=1', region: 'US' },
  cbs: { name: 'CBS NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UC8p1vwvB0c0M_BTBq6nY2ow&autoplay=1&mute=1', region: 'US' },
  bloomberg: { name: 'BLOOMBERG', src: 'https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg&autoplay=1&mute=1', region: 'US' },
  nhk: { name: 'NHK WORLD', src: 'https://www.youtube.com/embed/live_stream?channel=UC6miMFHMfzRm2sCeZBB4LGg&autoplay=1&mute=1', region: 'ASIA' },
  wion: { name: 'WION', src: 'https://www.youtube.com/embed/live_stream?channel=UCkxSzANXo0dOkRj9GnK-M1Q&autoplay=1&mute=1', region: 'ASIA' },
  euronews: { name: 'EURONEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCrnCZPgTDLRfz7z3XIMYG3g&autoplay=1&mute=1', region: 'EUR' },
  rt: { name: 'RT NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCpwvZYkGwDPflCSjSoSGMXA&autoplay=1&mute=1', region: 'RU' },
  cgtn: { name: 'CGTN', src: 'https://www.youtube.com/embed/live_stream?channel=UCalu4olVgRkJriK4HLZRM7g&autoplay=1&mute=1', region: 'ASIA' },
  trtworld: { name: 'TRT WORLD', src: 'https://www.youtube.com/embed/live_stream?channel=UC7DHo7hFh3Bd-UqS3KT2Zaw&autoplay=1&mute=1', region: 'EUR' },
  arirang: { name: 'ARIRANG', src: 'https://www.youtube.com/embed/live_stream?channel=UCYe3BeY3ovnqSKLNZ_aLmLg&autoplay=1&mute=1', region: 'ASIA' },
  ddbangla: { name: 'DD INDIA', src: 'https://www.youtube.com/embed/live_stream?channel=UCF5t6wdnCBtGDUBIl1D0DIQ&autoplay=1&mute=1', region: 'ASIA' },
  i24: { name: 'i24 NEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCXpCekwIkGStHMPqBhtnqLg&autoplay=1&mute=1', region: 'MENA' },
  skynews_au: { name: 'SKY AU', src: 'https://www.youtube.com/embed/live_stream?channel=UCN3oDzHHHhlcqLBPd8gfB8A&autoplay=1&mute=1', region: 'AUS' },
  times_now: { name: 'TIMES NOW', src: 'https://www.youtube.com/embed/live_stream?channel=UCt2NxqK5DQZa_62XTMF-S0w&autoplay=1&mute=1', region: 'ASIA' },
  ndtv: { name: 'NDTV', src: 'https://www.youtube.com/embed/live_stream?channel=UCZFMm1mMw0F81Z37aaEzTUA&autoplay=1&mute=1', region: 'ASIA' },
  pbsnews: { name: 'PBS NEWSHOUR', src: 'https://www.youtube.com/embed/live_stream?channel=UC6ZFN9Tx6xh-skXCuRHCDpQ&autoplay=1&mute=1', region: 'US' },
  abc_au: { name: 'ABC AUSTRALIA', src: 'https://www.youtube.com/embed/live_stream?channel=UCVgO39Bk5sMo66-6o6Spn6Q&autoplay=1&mute=1', region: 'AUS' },
  africanews: { name: 'AFRICANEWS', src: 'https://www.youtube.com/embed/live_stream?channel=UCaba3MqJDOhuxh6bEKXUGGg&autoplay=1&mute=1', region: 'AFR' },
};

// ── Defense / Markets Symbols ─────────────────────────────────
const MARKET_SYMBOLS = [
  // Defense
  { symbol: 'LMT', name: 'Lockheed Martin', sector: 'defense' },
  { symbol: 'RTX', name: 'Raytheon', sector: 'defense' },
  { symbol: 'NOC', name: 'Northrop', sector: 'defense' },
  { symbol: 'BA', name: 'Boeing', sector: 'defense' },
  { symbol: 'GD', name: 'Gen Dynamics', sector: 'defense' },
  // Commodities / Macro
  { symbol: 'GC=F', name: 'Gold', sector: 'commodity' },
  { symbol: 'CL=F', name: 'WTI Oil', sector: 'commodity' },
  { symbol: 'SI=F', name: 'Silver', sector: 'commodity' },
  { symbol: 'BTC-USD', name: 'Bitcoin', sector: 'crypto' },
];
