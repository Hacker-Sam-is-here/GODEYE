// ============================================================
//  GODEYE — Live News Feed Panel (GDELT + RSS + YouTube)
// ============================================================
const LiveFeedPanel = (() => {
  let _articles = [];
  let _filter = 'ALL';
  let _search = '';
  let _subTab = 'articles';
  let _autoScroll = true;

  const GDELT_QUERIES = [
    { key:'war',       q:'war+battle+airstrike+attack+explosion+military' },
    { key:'disaster',  q:'earthquake+tsunami+volcano+hurricane+wildfire+flood' },
    { key:'politics',  q:'protest+riot+demonstration+coup+election+president' },
    { key:'economy',   q:'economy+sanctions+trade+oil+energy+currency+inflation' },
    { key:'general',   q:'' },
  ];

  // Free, CORS-safe news feeds via saurav.tech/NewsAPI mirror (no key needed)
  const NEWS_FEEDS = [
    // ── US Broadcast ────────────────────────────────────────────
    { name:'CNN',              url:'https://saurav.tech/NewsAPI/everything/cnn.json' },
    { name:'CBS News',         url:'https://saurav.tech/NewsAPI/everything/cbs-news.json' },
    { name:'NBC News',         url:'https://saurav.tech/NewsAPI/everything/nbc-news.json' },
    { name:'ABC News',         url:'https://saurav.tech/NewsAPI/everything/abc-news.json' },
    { name:'Fox News',         url:'https://saurav.tech/NewsAPI/everything/fox-news.json' },
    { name:'NPR',              url:'https://saurav.tech/NewsAPI/everything/npr.json' },
    // ── US Print / Digital ──────────────────────────────────────
    { name:'New York Times',   url:'https://saurav.tech/NewsAPI/everything/the-new-york-times.json' },
    { name:'Washington Post',  url:'https://saurav.tech/NewsAPI/everything/the-washington-post.json' },
    { name:'Wall St. Journal', url:'https://saurav.tech/NewsAPI/everything/the-wall-street-journal.json' },
    { name:'Business Insider', url:'https://saurav.tech/NewsAPI/everything/business-insider.json' },
    { name:'Politico',         url:'https://saurav.tech/NewsAPI/everything/politico.json' },
    { name:'Vice',             url:'https://saurav.tech/NewsAPI/everything/vice-news.json' },
    // ── UK ──────────────────────────────────────────────────────
    { name:'BBC News',         url:'https://saurav.tech/NewsAPI/everything/bbc-news.json' },
    { name:'The Guardian',     url:'https://saurav.tech/NewsAPI/everything/the-guardian-uk.json' },
    { name:'Sky News',         url:'https://saurav.tech/NewsAPI/everything/sky-news.json' },
    { name:'The Independent',  url:'https://saurav.tech/NewsAPI/everything/independent.json' },
    // ── International Wire ──────────────────────────────────────
    { name:'Reuters',          url:'https://saurav.tech/NewsAPI/everything/reuters.json' },
    { name:'Associated Press', url:'https://saurav.tech/NewsAPI/everything/associated-press.json' },
    { name:'Al Jazeera',       url:'https://saurav.tech/NewsAPI/everything/al-jazeera-english.json' },
    { name:'Bloomberg',        url:'https://saurav.tech/NewsAPI/everything/bloomberg.json' },
    { name:'Financial Times',  url:'https://saurav.tech/NewsAPI/everything/financial-times.json' },
    // ── India ────────────────────────────────────────────────────
    { name:'NDTV',             url:'https://saurav.tech/NewsAPI/everything/ndtv.json' },
    { name:'Times of India',   url:'https://saurav.tech/NewsAPI/everything/the-times-of-india.json' },
    { name:'The Hindu',        url:'https://saurav.tech/NewsAPI/everything/the-hindu.json' },
    // ── Category Feeds (Global) ──────────────────────────────────
    { name:'WORLD',            url:'https://saurav.tech/NewsAPI/top-headlines/category/general/us.json' },
    { name:'TECHNOLOGY',       url:'https://saurav.tech/NewsAPI/top-headlines/category/technology/us.json' },
    { name:'SCIENCE',          url:'https://saurav.tech/NewsAPI/top-headlines/category/science/us.json' },
    { name:'HEALTH',           url:'https://saurav.tech/NewsAPI/top-headlines/category/health/us.json' },
  ];


  // ── Build the panel UI ──────────────────────────────────────
  function _build() {
    const container = document.getElementById('tab-live-news');
    container.innerHTML = `
      <div class="feed-header">
        <span class="feed-title"><span class="blink-dot">●</span> LIVE NEWS STREAM</span>
        <span class="feed-updated" id="news-updated">--</span>
      </div>

      <div class="news-sub-tabs">
        <button class="news-sub-tab active" data-subtab="articles">ALL</button>
        <button class="news-sub-tab" data-subtab="war">WAR</button>
        <button class="news-sub-tab" data-subtab="disaster">DISASTER</button>
        <button class="news-sub-tab" data-subtab="politics">POLITICS</button>
        <button class="news-sub-tab" data-subtab="economy">ECONOMY</button>
        <button class="news-sub-tab" data-subtab="tv">📺 TV</button>
      </div>

      <div class="search-filter-wrap">
        <input type="text" id="news-search" placeholder="FILTER HEADLINES...">
      </div>

      <div class="articles-list" id="news-articles-list"></div>

      <div id="news-tv-panel" style="display:none;padding:8px;">
        <div style="font-size:0.72rem;color:var(--amber);letter-spacing:0.1em;margin-bottom:6px;">BROADCAST INTEL</div>
        <div class="tv-grid" id="tv-clip-grid"></div>
      </div>`;

    // Sub-tab switching
    container.querySelectorAll('.news-sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.news-sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _subTab = btn.dataset.subtab;

        const articlesList = document.getElementById('news-articles-list');
        const tvPanel      = document.getElementById('news-tv-panel');
        if (_subTab === 'tv') {
          articlesList.style.display = 'none';
          tvPanel.style.display = 'block';
          _fetchTV();
        } else {
          articlesList.style.display = 'block';
          tvPanel.style.display = 'none';
          _renderArticles();
        }
      });
    });

    // Search filter
    document.getElementById('news-search').addEventListener('input', e => {
      _search = e.target.value.toLowerCase();
      _renderArticles();
    });
  }

  // ── Fetch GDELT articles ────────────────────────────────────
  async function _fetchGDELT() {
    const allArticles = [];

    await Promise.allSettled(GDELT_QUERIES.map(async ({ key, q }) => {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q || 'world+news'}&mode=artlist&format=json&maxrecords=20&timespan=15min&sort=DateDesc`;
      try {
        const data = await CORS.fetchJSON(url);
        (data.articles || []).forEach(a => {
          if (!a.title || !a.url) return;
          allArticles.push({
            title:     a.title,
            url:       a.url,
            source:    a.domain || 'GDELT',
            date:      a.seendate ? _parseGDELTDate(a.seendate) : new Date(),
            tone:      a.tone || 0,
            sentiment: GEO.toneToSentiment(a.tone),
            category:  key === 'general' ? GEO.categorize(a.title) : key.toUpperCase(),
            isBreaking: false,
          });
        });
      } catch(e) {}
    }));

    return allArticles;
  }

  // ── Fetch news via saurav.tech/NewsAPI mirror (CORS-safe, free, no key) ──
  async function _fetchRSS() {
    const allArticles = [];
    await Promise.allSettled(NEWS_FEEDS.map(async feed => {
      try {
        const res  = await fetch(feed.url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (!data.articles?.length) return;
        data.articles.slice(0, 15).forEach(item => {
          if (!item.title || item.title === '[Removed]') return;
          const date = item.publishedAt ? new Date(item.publishedAt) : new Date();
          allArticles.push({
            title:     item.title,
            url:       item.url,
            source:    item.source?.name || feed.name,
            date,
            tone:      0,
            sentiment: 'neutral',
            category:  GEO.categorize(item.title),
            isBreaking:(Date.now() - date.getTime()) < 1800000,
          });
        });
      } catch(e) {}
    }));
    return allArticles;
  }

  // ── Full refresh ────────────────────────────────────────────
  async function _refresh() {
    try {
      const [gdelt, rss] = await Promise.allSettled([_fetchGDELT(), _fetchRSS()]);
      const combined = [
        ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
        ...(rss.status   === 'fulfilled' ? rss.value   : []),
      ];

      // Deduplicate by URL
      const seen = new Set();
      const unique = combined.filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      });

      // Sort newest first
      unique.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Mark breaking (< 30 min old)
      unique.forEach(a => {
        a.isBreaking = (Date.now() - new Date(a.date).getTime()) < 1800000;
      });

      // Find new articles
      const prevUrls = new Set(_articles.map(a => a.url));
      const newOnes  = unique.filter(a => !prevUrls.has(a.url));
      _articles = unique.slice(0, 100);

      STATE.data.newsArticles = _articles;
      STATE.setLayerCount('news', _articles.length);

      // Breaking news alerts
      newOnes.filter(a => a.isBreaking).slice(0, 2).forEach(a => {
        AUDIO.breakingNewsAlert();
        EventBus.emit('sigint:log', {
          cat: 'GDELT',
          msg: `BREAKING: ${a.title.substring(0, 80)}`,
          level: a.sentiment === 'negative' ? 'danger' : 'warn',
        });
      });

      const el = document.getElementById('news-updated');
      if (el) el.textContent = GEO.sigintTime();

      _renderArticles();
    } catch(e) {}
  }

  // ── Render article cards ────────────────────────────────────
  function _renderArticles() {
    const list = document.getElementById('news-articles-list');
    if (!list) return;

    let filtered = _articles;

    if (_subTab !== 'articles') {
      const cat = _subTab.toUpperCase();
      filtered = filtered.filter(a =>
        a.category === cat ||
        (cat === 'WAR' && ['WAR','CONFLICT'].includes(a.category)) ||
        (cat === 'DISASTER' && a.category === 'DISASTER')
      );
    }

    if (_search) {
      filtered = filtered.filter(a => a.title.toLowerCase().includes(_search));
    }

    list.innerHTML = filtered.slice(0, 50).map(a => `
      <div class="article-card" onclick="window.open('${a.url}', '_blank')">
        <div class="card-headline">${a.title}</div>
        <div class="card-meta">
          <span class="card-source">${a.source}</span>
          <span class="card-time">${GEO.timeAgo(a.date)}</span>
          ${a.isBreaking ? '<span class="badge-breaking">🔴 BREAKING</span>' : ''}
          <span class="badge-sentiment ${a.sentiment}">${a.sentiment === 'negative' ? '🔴' : a.sentiment === 'positive' ? '🟢' : '🟡'} ${a.sentiment.toUpperCase()}</span>
          <span class="badge-category">${a.category}</span>
        </div>
      </div>`).join('');
  }

  // ── All 40 live broadcast channels ─────────────────────────
  const LIVE_CHANNELS = [
    // 🌍 Global / International
    { id:'aje',      name:'Al Jazeera English', region:'INTL', ch:'UCNye-wNBqNL5ZzHSJj3l8Bg' },
    { id:'f24',      name:'France 24',          region:'INTL', ch:'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
    { id:'bloomberg',name:'Bloomberg TV',       region:'INTL', ch:'UCIALMKvObZNtJ6AmdCLP7Lg' },
    { id:'sky',      name:'Sky News',           region:'INTL', ch:'UCoMdktPbSTixAyNG8-8RFPA' },
    { id:'bbc',      name:'BBC World News',     region:'INTL', ch:'UC16niRr50-MSBwiO3YDb3RA' },
    { id:'dw',       name:'DW News',            region:'INTL', ch:'UCknLrEdhRCp1aegoMqRaCEg' },
    { id:'euronews', name:'Euronews',           region:'INTL', ch:'UCrnCZPgTDLRfz7z3XIMYG3g' },
    { id:'trt',      name:'TRT World',          region:'INTL', ch:'UC7DHo7hFh3Bd-UqS3KT2Zaw' },
    { id:'i24',      name:'i24 News',           region:'INTL', ch:'UCXpCekwIkGStHMPqBhtnqLg' },
    { id:'cgtn',     name:'CGTN',               region:'INTL', ch:'UCalu4olVgRkJriK4HLZRM7g' },
    { id:'nhk',      name:'NHK World',          region:'INTL', ch:'UC6miMFHMfzRm2sCeZBB4LGg' },
    { id:'arirang',  name:'Arirang TV',         region:'INTL', ch:'UCYe3BeY3ovnqSKLNZ_aLmLg' },
    { id:'rt',       name:'RT News',            region:'INTL', ch:'UCpwvZYkGwDPflCSjSoSGMXA' },
    { id:'africa',   name:'Africanews',         region:'INTL', ch:'UCaba3MqJDOhuxh6bEKXUGGg' },
    { id:'skya',     name:'Sky News Australia', region:'INTL', ch:'UCN3oDzHHHhlcqLBPd8gfB8A' },
    { id:'abca',     name:'ABC Australia',      region:'INTL', ch:'UCVgO39Bk5sMo66-6o6Spn6Q' },
    { id:'wion',     name:'WION',               region:'INTL', ch:'UCkxSzANXo0dOkRj9GnK-M1Q' },
    // 🇺🇸 American
    { id:'nbc',      name:'NBC News NOW',       region:'US',   ch:'UCeY0bbntWzzVIaj2z3QigXg' },
    { id:'fox',      name:'LiveNOW from FOX',   region:'US',   ch:'UCJg9wBPyKMNA5sRDnvzmkdg' },
    { id:'cbs',      name:'CBS News',           region:'US',   ch:'UC8p1vwvB0c0M_BTBq6nY2ow' },
    { id:'abc',      name:'ABC News',           region:'US',   ch:'UCBi2mrWuNuyYy4gbM6fU18Q' },
    { id:'cnn',      name:'CNN International',  region:'US',   ch:'UCupvZG-5ko_eiXAupbDfxWw' },
    { id:'foxwx',    name:'FOX Weather',        region:'US',   ch:'UCxS4h56N_E6q_K5yJ45X16g' },
    { id:'pbs',      name:'PBS NewsHour',       region:'US',   ch:'UC6ZFN9Tx6xh-skXCuRHCDpQ' },
    // 🇮🇳 India
    { id:'aajtak',   name:'Aaj Tak',            region:'IN',   ch:'UCtqZkgP5u1-N2021c_q43_A' },
    { id:'republic', name:'Republic World',     region:'IN',   ch:'UCw9o58vWjGkG3hD2J1_848A' },
    { id:'ndtv',     name:'NDTV',               region:'IN',   ch:'UCZFMm1mMw0F81Z37aaEzTUA' },
    { id:'indiatv',  name:'India TV',           region:'IN',   ch:'UC54t4k7V-rXk7fR-32-6Q2w' },
    { id:'news18',   name:'CNN-News18',         region:'IN',   ch:'UCz9Y-29f_r5rGZ5Vp4_9G1A' },
    { id:'zee',      name:'Zee News',           region:'IN',   ch:'UC6bn8P-k5Kj7-d6sF5S6lYg' },
    { id:'timesnow', name:'Times Now',          region:'IN',   ch:'UCt2NxqK5DQZa_62XTMF-S0w' },
    { id:'ddindia',  name:'DD India',           region:'IN',   ch:'UCF5t6wdnCBtGDUBIl1D0DIQ' },
  ];

  let _activeCh = null;

  function _fetchTV() {
    const grid = document.getElementById('tv-clip-grid');
    if (!grid) return;

    const regions = { INTL: '🌍 International', US: '🇺🇸 American', IN: '🇮🇳 India' };
    const grouped = {};
    LIVE_CHANNELS.forEach(c => { (grouped[c.region] = grouped[c.region] || []).push(c); });

    grid.innerHTML = `
      <div id="tv-player-wrap" style="display:none;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span id="tv-now-playing" style="color:var(--amber);font-size:0.7rem;letter-spacing:.08em;flex:1;">▶ SELECT A CHANNEL</span>
          <button onclick="document.getElementById('tv-player-wrap').style.display='none';_tvMuted=true;"
            style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.8rem;">✕</button>
        </div>
        <iframe id="tv-live-iframe"
          width="100%" height="195" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen style="border:1px solid var(--green-dim);"></iframe>
        <div style="display:flex;gap:4px;margin-top:4px;">
          <button id="tv-unmute-btn" onclick="
            var f=document.getElementById('tv-live-iframe');
            f.src=f.src.replace('mute=1','mute=0');
            this.textContent='🔊 MUTED — CLICK AGAIN TO UNMUTE';
          " class="action-btn" style="flex:1;font-size:0.65rem;">🔇 TAP TO UNMUTE</button>
        </div>
      </div>
      ${Object.entries(regions).map(([rk, rl]) => `
        <div style="color:var(--amber);font-size:0.68rem;letter-spacing:.1em;padding:4px 0 2px;border-bottom:1px solid #1a2a1a;margin-bottom:4px;">${rl}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          ${(grouped[rk]||[]).map(c => `
            <button class="tv-live-btn" data-ch="${c.ch}" data-name="${c.name}"
              onclick="
                document.querySelectorAll('.tv-live-btn').forEach(b=>b.classList.remove('active'));
                this.classList.add('active');
                var wrap=document.getElementById('tv-player-wrap');
                var f=document.getElementById('tv-live-iframe');
                var label=document.getElementById('tv-now-playing');
                wrap.style.display='block';
                f.src='https://www.youtube.com/embed/live_stream?channel=${c.ch}&autoplay=1&mute=1';
                label.textContent='▶ ${c.name.toUpperCase()} — LIVE';
              "
              style="background:rgba(0,255,65,0.06);border:1px solid #1a3a1a;color:#7aff7a;
                     font-family:var(--font);font-size:0.62rem;letter-spacing:.06em;padding:3px 6px;
                     cursor:pointer;border-radius:2px;transition:all .15s;"
              onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)';"
              onmouseout="if(!this.classList.contains('active')){this.style.borderColor='#1a3a1a';this.style.color='#7aff7a';}"
            >${c.name.toUpperCase()}</button>
          `).join('')}
        </div>
      `).join('')}
    `;

  }

  function _parseGDELTDate(s) {
    // GDELT format: 20260516143201
    if (!s || s.length < 14) return new Date();
    return new Date(`${s.substr(0,4)}-${s.substr(4,2)}-${s.substr(6,2)}T${s.substr(8,2)}:${s.substr(10,2)}:${s.substr(12,2)}Z`);
  }

  return {
    init() {
      _build();
      // TV tab channels are rendered inline via _fetchTV() — no separate panel needed
      _refresh();
      API.schedule('live-news', _refresh, CONFIG.REFRESH_MS.LIVE_NEWS, STAGGER.next(15000));
    },

    openStream(url, name) {
      EventBus.emit('tv:open', { url, name });
    },

    refresh: _refresh,
  };
})();

