/* ==========================================================================
   MovieDrop
   Pulls the movie list straight from the owner's Google Sheet, renders it,
   and gates the watch links behind an Instagram follow.

   Design rule that drives most of this file: nothing on screen is ever
   allowed to look broken. Every poster is drawn locally first; anything
   fetched from the network is a bonus layered on top.
   ========================================================================== */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  var SHEET_ID  = '1UWeqWaGwmzGwVyjDSgwL_Eie1iHk8NWHCmA38iSOYPk';
  var SHEET_TAB = 'Sheet1';
  var INSTAGRAM = 'https://www.instagram.com/by_.meghana/';

  // How many films play without following. A free sample proves the links are
  // real, and converts far better than gating everything. Set to 0 to gate all.
  var FREE_PREVIEW = 1;

  var LS_UNLOCK  = 'moviedrop.unlocked.v1';
  var LS_VISITED = 'moviedrop.visited.v1';
  var LS_POSTERS = 'moviedrop.posters.v2';
  var POSTER_TTL = 1000 * 60 * 60 * 24 * 14; // re-check posters fortnightly

  // Cache-bust in 60s buckets: new sheet rows appear fast, but a reload
  // inside the same minute still hits the browser cache.
  function bust() { return Math.floor(Date.now() / 60000); }

  var SOURCES = [
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(SHEET_TAB) + '&_=' + bust(),
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:csv&_=' + bust(),
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/export?format=csv&gid=0&_=' + bust()
  ];

  // ── Tiny DOM helpers ────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  var el = {
    grid:        $('grid'),
    skeleton:    $('skeleton'),
    notice:      $('notice'),
    noticeTitle: $('noticeTitle'),
    noticeCopy:  $('noticeCopy'),
    retryBtn:    $('retryBtn'),
    sectionNote: $('sectionNote'),
    heroCount:   $('heroCount'),
    gate:        $('gate'),
    gateLocked:  $('gateLocked'),
    gateUnlocked:$('gateUnlocked'),
    followBtn:   $('followBtn'),
    unlockBtn:   $('unlockBtn'),
    toast:       $('toast'),
    gateStep:    $('gateStep'),
    flash:       $('flash'),
    encore:      $('encore'),
    dock:        $('dock'),
    dockText:    $('dockText'),
    topbar:      $('topbar')
  };

  // ── Safe localStorage (private mode / in-app browsers can throw) ─────────
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* no-op */ } }
  };

  // ── State ───────────────────────────────────────────────────────────────
  var unlocked = store.get(LS_UNLOCK) === 'yes';
  var visitedIg = store.get(LS_VISITED) === 'yes';
  var movies = [];

  /* ========================================================================
     CSV — RFC 4180: quoted fields, escaped quotes, newlines inside cells
     ===================================================================== */
  function parseCSV(text) {
    var rows = [], row = [], field = '', inQuotes = false, i;

    text = text.replace(/^﻿/, '');

    for (i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += c; }
        continue;
      }

      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') { i++; }
        row.push(field); field = '';
        rows.push(row); row = [];
      } else { field += c; }
    }

    row.push(field);
    rows.push(row);

    // Drop rows where every cell is blank.
    return rows.filter(function (r) {
      return r.some(function (cell) { return String(cell).trim() !== ''; });
    });
  }

  /* ========================================================================
     Normalising sheet values
     ===================================================================== */

  // "psycho" -> "Psycho", but "KGF" and "iPhone" are left as typed.
  function smartTitle(s) {
    return String(s).trim().split(/\s+/).map(function (w) {
      if (!w) return w;
      if (w !== w.toLowerCase()) return w;           // already has caps — trust it
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function normKey(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Loose title match used when accepting a remote poster.
  function normTitle(s) {
    return String(s)
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*/g, ' ')  // drop "(1960 film)" etc.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  var OTT = {
    youtube:      { label: 'YouTube',     color: '#ff3b41' },
    youtubemovies:{ label: 'YouTube',     color: '#ff3b41' },
    netflix:      { label: 'Netflix',     color: '#e50914' },
    primevideo:   { label: 'Prime Video', color: '#25b7e8' },
    amazonprime:  { label: 'Prime Video', color: '#25b7e8' },
    amazonprimevideo: { label: 'Prime Video', color: '#25b7e8' },
    prime:        { label: 'Prime Video', color: '#25b7e8' },
    hotstar:      { label: 'JioHotstar',  color: '#4a7dff' },
    jiohotstar:   { label: 'JioHotstar',  color: '#4a7dff' },
    disneyhotstar:{ label: 'JioHotstar',  color: '#4a7dff' },
    disneyplushotstar: { label: 'JioHotstar', color: '#4a7dff' },
    disney:       { label: 'Disney+',     color: '#4a7dff' },
    disneyplus:   { label: 'Disney+',     color: '#4a7dff' },
    jiocinema:    { label: 'JioCinema',   color: '#c44bff' },
    sonyliv:      { label: 'Sony LIV',    color: '#3d8bff' },
    zee5:         { label: 'ZEE5',        color: '#a05cff' },
    aha:          { label: 'aha',         color: '#ff6a2b' },
    appletv:      { label: 'Apple TV+',   color: '#d8d8dd' },
    appletvplus:  { label: 'Apple TV+',   color: '#d8d8dd' },
    mxplayer:     { label: 'MX Player',   color: '#ff4d4d' },
    sunnxt:       { label: 'Sun NXT',     color: '#ffb03b' },
    etvwin:       { label: 'ETV Win',     color: '#ff8a3d' },
    lionsgateplay:{ label: 'Lionsgate Play', color: '#ffd166' },
    telegram:     { label: 'Telegram',    color: '#34a8e8' },
    theatre:      { label: 'In Theatres', color: '#e9b455' },
    theater:      { label: 'In Theatres', color: '#e9b455' },
    theatres:     { label: 'In Theatres', color: '#e9b455' },
    theaters:     { label: 'In Theatres', color: '#e9b455' },
    cinema:       { label: 'In Theatres', color: '#e9b455' }
  };

  function resolveOtt(raw) {
    var v = String(raw || '').trim();
    if (!v) return { label: 'Watch now', color: '#e9b455' };
    var hit = OTT[normKey(v)];
    return hit || { label: smartTitle(v), color: '#e9b455' };
  }

  // Only a trailing parenthetical counts as a release year. Bare trailing
  // digits are part of the title far too often — Blade Runner 2049, 1917, 2012.
  function splitYear(rawTitle) {
    var m = String(rawTitle).match(/^(.*?)[\s]*\((19\d{2}|20\d{2})\)\s*$/);
    if (m && m[1].trim()) return { title: m[1].trim(), year: m[2] };
    return { title: String(rawTitle).trim(), year: '' };
  }

  function cleanYear(raw) {
    var m = String(raw || '').match(/(19\d{2}|20\d{2})/);
    return m ? m[1] : '';
  }

  // Accepts "https://…", "http://…" and bare "youtu.be/…".
  function cleanUrl(raw) {
    var v = String(raw || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) {
      if (!/^[\w-]+(\.[\w-]+)+/.test(v)) return '';  // not domain-ish
      v = 'https://' + v;
    }
    try {
      var u = new URL(v);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch (e) { return ''; }
  }

  /* ========================================================================
     Sheet -> movie objects
     ===================================================================== */
  function findColumns(header) {
    var idx = { title: -1, ott: -1, link: -1, poster: -1, year: -1 };

    header.forEach(function (raw, i) {
      var k = normKey(raw);
      if (idx.title  < 0 && (k === 'movie' || k === 'movies' || k === 'title' || k === 'name' || k === 'moviename')) idx.title = i;
      if (idx.ott    < 0 && (k === 'ott' || k === 'platform' || k === 'where' || k === 'app' || k === 'channel')) idx.ott = i;
      if (idx.link   < 0 && (k === 'link' || k === 'url' || k === 'watchlink' || k === 'links' || k === 'watch')) idx.link = i;
      if (idx.poster < 0 && (k === 'poster' || k === 'image' || k === 'img' || k === 'thumbnail' || k === 'posterurl')) idx.poster = i;
      if (idx.year   < 0 && (k === 'year' || k === 'released' || k === 'releaseyear' || k === 'releasedate')) idx.year = i;
    });

    // Sheet uses plain A/B/C with no recognisable header — fall back to order.
    if (idx.title < 0 && idx.ott < 0 && idx.link < 0) {
      idx.title = 0; idx.ott = 1; idx.link = 2;
      return { idx: idx, headerIsData: true };
    }
    if (idx.title < 0) idx.title = 0;
    if (idx.ott   < 0) idx.ott   = 1;
    if (idx.link  < 0) idx.link  = 2;
    return { idx: idx, headerIsData: false };
  }

  function toMovies(rows) {
    if (!rows.length) return [];

    var map = findColumns(rows[0]);
    var body = map.headerIsData ? rows : rows.slice(1);
    var idx = map.idx;
    var seen = {};
    var out = [];

    body.forEach(function (r) {
      var cell = function (i) { return (i >= 0 && r[i] != null) ? String(r[i]).trim() : ''; };

      var rawTitle = cell(idx.title);
      if (!rawTitle) return;                         // no title -> not a movie

      // A year may live in its own column or inline as "Psycho (2020)".
      var split = splitYear(rawTitle);
      var year = cleanYear(cell(idx.year)) || split.year;

      var key = normKey(split.title) + '|' + year;
      if (key === '|' || seen[key]) return;          // blank-ish or duplicate
      seen[key] = true;

      out.push({
        title:  smartTitle(split.title),
        raw:    split.title,
        year:   year,
        ott:    resolveOtt(cell(idx.ott)),
        link:   cleanUrl(cell(idx.link)),
        poster: cleanUrl(cell(idx.poster))
      });
    });

    return out;
  }

  function fetchText(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);

    var opts = { cache: 'no-store' };
    if (ctrl) opts.signal = ctrl.signal;

    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  // Walks the source list until one of them returns usable rows.
  function loadSheet() {
    var attempt = 0;

    function next() {
      if (attempt >= SOURCES.length) return Promise.reject(new Error('all sources failed'));
      var url = SOURCES[attempt++];
      return fetchText(url).then(function (text) {
        if (/^\s*</.test(text)) throw new Error('got HTML, not CSV');
        var list = toMovies(parseCSV(text));
        if (!list.length && attempt < SOURCES.length) return next();
        return list;
      }, function (err) {
        if (window.console) console.warn('[MovieDrop] source failed:', err && err.message);
        return next();
      });
    }

    return next();
  }

  /* ========================================================================
     Generated posters
     Deterministic, offline, and good-looking by construction — the palette
     list is curated so no hash can produce an ugly pairing.
     ===================================================================== */
  var PALETTES = [
    { a: '#1c1224', b: '#5e2a55', glow: '#c887cd' },
    { a: '#0d1a2e', b: '#2a5f80', glow: '#7cc4de' },
    { a: '#2c0f12', b: '#8f2329', glow: '#e2736a' },
    { a: '#0d2019', b: '#276046', glow: '#74cba1' },
    { a: '#241705', b: '#8a5a1c', glow: '#e8b65e' },
    { a: '#141426', b: '#3e447a', glow: '#949ee0' },
    { a: '#2a1119', b: '#87344b', glow: '#e08298' },
    { a: '#0b1d25', b: '#1f5460', glow: '#6bc6d1' },
    { a: '#22170e', b: '#7d442b', glow: '#e39a6e' }
  ];

  function hash(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  // Greedy wrap sized for the poster's 400-unit-wide viewBox. Steps the type
  // down until every line fits — a single long word like INTERSTELLAR has to
  // fit on its own, or it runs off the edge of the poster.
  function layoutTitle(title) {
    var words = String(title).toUpperCase().split(/\s+/).filter(Boolean);
    var sizes = [72, 62, 53, 45, 38, 32, 26];
    var avail = 336;              // 400 viewBox units minus left/right padding
    var ratio = 0.44;             // Anton is condensed — much tighter than a grotesque
    var i, s;

    function wrap(maxChars) {
      var lines = [], cur = '';
      for (var w = 0; w < words.length; w++) {
        var candidate = cur ? cur + ' ' + words[w] : words[w];
        if (candidate.length <= maxChars || !cur) { cur = candidate; }
        else { lines.push(cur); cur = words[w]; }
      }
      if (cur) lines.push(cur);
      return lines;
    }

    for (s = 0; s < sizes.length; s++) {
      var fs = sizes[s];
      var maxChars = Math.max(4, Math.floor(avail / (fs * ratio)));

      // Any word that cannot fit on a line of its own needs smaller type.
      var longest = 0;
      for (i = 0; i < words.length; i++) longest = Math.max(longest, words[i].length);
      if (longest > maxChars && s < sizes.length - 1) continue;

      var lines = wrap(maxChars);
      if (lines.length <= 3 || s === sizes.length - 1) {
        if (lines.length > 3) {
          lines = lines.slice(0, 3);
          lines[2] = lines[2].replace(/.$/, '') + '…';
        }
        // Last resort for one absurdly long word: hard-break it.
        lines = lines.map(function (ln) {
          return ln.length > maxChars ? ln.slice(0, Math.max(1, maxChars - 1)) + '…' : ln;
        });
        return { size: fs, lines: lines };
      }
    }

    return { size: sizes[sizes.length - 1], lines: wrap(20).slice(0, 3) };
  }

  function motif(kind, pal, uid) {
    switch (kind) {
      case 0: // concentric rings, like a lens
        return '<g fill="none" stroke="' + pal.glow + '" stroke-opacity=".38">' +
               '<circle cx="292" cy="176" r="58" stroke-width="2"/>' +
               '<circle cx="292" cy="176" r="94" stroke-width="1.5"/>' +
               '<circle cx="292" cy="176" r="132" stroke-width="1.1"/>' +
               '<circle cx="292" cy="176" r="176" stroke-width=".8"/>' +
               '</g>' +
               '<circle cx="292" cy="176" r="30" fill="' + pal.glow + '" fill-opacity=".32"/>';
      case 1: // raking light bars
        return '<g fill="' + pal.glow + '" fill-opacity=".2">' +
               '<rect x="-80" y="-40" width="26" height="760" transform="rotate(18 0 0)"/>' +
               '<rect x="40"  y="-40" width="14" height="760" transform="rotate(18 0 0)"/>' +
               '<rect x="130" y="-40" width="40" height="760" transform="rotate(18 0 0)"/>' +
               '<rect x="250" y="-40" width="12" height="760" transform="rotate(18 0 0)"/>' +
               '</g>';
      case 2: // low sun over a horizon
        return '<circle cx="200" cy="238" r="82" fill="' + pal.glow + '" fill-opacity=".42"/>' +
               '<circle cx="200" cy="238" r="82" fill="none" stroke="' + pal.glow +
               '" stroke-opacity=".6" stroke-width="1.8"/>' +
               '<g stroke="' + pal.a + '" stroke-opacity=".85">' +
               '<path d="M112 252h176" stroke-width="7"/>' +
               '<path d="M112 274h176" stroke-width="5"/>' +
               '<path d="M112 292h176" stroke-width="3"/>' +
               '</g>';
      default: // layered ridges
        return '<g fill="' + pal.glow + '">' +
               '<path d="M0 372l112-104 88 78 84-62 116 88v92H0z" fill-opacity=".26"/>' +
               '<path d="M0 424l140-92 96 68 164-96v138H0z" fill-opacity=".2"/>' +
               '</g>';
    }
  }

  var lastPal = -1, lastKind = -1;

  function buildPoster(title, uid) {
    var h = hash(title || 'moviedrop');

    var pi = h % PALETTES.length;
    if (pi === lastPal) pi = (pi + 4) % PALETTES.length;
    lastPal = pi;
    var pal = PALETTES[pi];

    var kind = (h >>> 8) % 4;
    if (kind === lastKind) kind = (kind + 1) % 4;
    lastKind = kind;
    var t = layoutTitle(title);

    var lineH = Math.round(t.size * 0.93);
    var baseY = 540 - (t.lines.length - 1) * lineH;

    var text = t.lines.map(function (line, i) {
      return '<text x="32" y="' + (baseY + i * lineH) + '" fill="#f4ece1" ' +
             'font-family="Anton, Arial Narrow, Impact, sans-serif" font-weight="400" ' +
             'font-size="' + t.size + '" letter-spacing="0.4">' + esc(line) + '</text>';
    }).join('');

    var ruleY = baseY - t.size - 20;

    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" role="presentation">' +
        '<defs>' +
          '<linearGradient id="bg' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + pal.b + '"/>' +
            '<stop offset="1" stop-color="' + pal.a + '"/>' +
          '</linearGradient>' +
          '<radialGradient id="gl' + uid + '" cx="50%" cy="22%" r="72%">' +
            '<stop offset="0" stop-color="' + pal.glow + '" stop-opacity=".38"/>' +
            '<stop offset="1" stop-color="' + pal.glow + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<linearGradient id="sc' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset=".3" stop-color="#04040a" stop-opacity="0"/>' +
            '<stop offset=".72" stop-color="#04040a" stop-opacity=".62"/>' +
            '<stop offset="1" stop-color="#04040a" stop-opacity=".93"/>' +
          '</linearGradient>' +
          '<filter id="sh' + uid + '" x="-20%" y="-20%" width="140%" height="140%">' +
            '<feDropShadow dx="0" dy="2" stdDeviation="7" flood-color="#000" flood-opacity=".55"/>' +
          '</filter>' +
        '</defs>' +
        '<rect width="400" height="600" fill="url(#bg' + uid + ')"/>' +
        motif(kind, pal, uid) +
        '<rect width="400" height="600" fill="url(#gl' + uid + ')"/>' +
        '<rect width="400" height="600" fill="url(#sc' + uid + ')"/>' +
        '<rect x="32" y="' + ruleY + '" width="38" height="2" fill="' + pal.glow + '"/>' +
        '<g filter="url(#sh' + uid + ')">' + text + '</g>' +
      '</svg>';
  }

  /* ========================================================================
     Optional remote poster
     Wikipedia's PageImages only serves freely-licensed art, so this hits for
     some titles and misses for many. That is fine: a miss simply leaves the
     generated poster in place. Nothing here can break the page.
     ===================================================================== */
  var posterCache = (function () {
    try { return JSON.parse(store.get(LS_POSTERS) || '{}') || {}; }
    catch (e) { return {}; }
  })();

  var cacheDirty = false;
  function flushCache() {
    if (!cacheDirty) return;
    cacheDirty = false;
    store.set(LS_POSTERS, JSON.stringify(posterCache));
  }

  // Set to false the first time /api/poster proves unavailable, so a purely
  // static deployment (GitHub Pages, Netlify drop) stops retrying it.
  var apiAvailable = true;

  function withTimeout(ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return { signal: ctrl ? ctrl.signal : undefined, done: function () { clearTimeout(timer); } };
  }

  // Primary source: our own endpoint, which queries IMDb (and TMDB when a key
  // is configured) server-side and refuses to guess on ambiguous titles.
  function fromApi(title, year) {
    if (!apiAvailable) return Promise.resolve('');

    var t = withTimeout(8000);
    var url = 'api/poster?title=' + encodeURIComponent(title) +
              (year ? '&year=' + encodeURIComponent(year) : '');

    return fetch(url, { signal: t.signal })
      .then(function (r) {
        t.done();
        // A static host answers /api/* with its 404 page, not JSON.
        var type = r.headers.get('content-type') || '';
        if (!r.ok || type.indexOf('json') === -1) { apiAvailable = false; return null; }
        return r.json();
      })
      .then(function (d) { return (d && d.url) || ''; })
      .catch(function () { t.done(); return ''; });
  }

  // Secondary source: Wikipedia. Only serves freely-licensed art, so it hits
  // for older and public-domain films — but it needs no backend at all.
  var WIKI_SKIP = /\((soundtrack|album|disambiguation|TV series|novel|video game|franchise|song)\)/i;

  function fromWikipedia(title, year) {
    var t = withTimeout(7000);
    var api = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
              '&prop=pageimages&piprop=thumbnail&pithumbsize=500' +
              '&generator=search&gsrnamespace=0&gsrlimit=8&gsrsearch=' +
              encodeURIComponent('"' + title + '" ' + (year ? year + ' ' : '') + 'film');

    return fetch(api, { signal: t.signal })
      .then(function (r) { t.done(); return r.ok ? r.json() : null; })
      .then(function (data) {
        var pages = data && data.query && data.query.pages;
        if (!pages) return '';

        var want = normTitle(title);
        var candidates = Object.keys(pages).map(function (k) { return pages[k]; })
          .filter(function (p) { return !WIKI_SKIP.test(p.title) && normTitle(p.title) === want; })
          .sort(function (a, b) { return (a.index || 99) - (b.index || 99); });

        if (!candidates.length) return '';

        var yearOf = function (p) {
          var m = String(p.title).match(/\((19\d{2}|20\d{2})\s*film\)/i);
          return m ? m[1] : '';
        };

        if (year) {
          // A year was supplied — only an article carrying it will do.
          var byYear = candidates.filter(function (p) { return yearOf(p) === year; });
          if (!byYear.length) {
            // Unless there is exactly one article and it names no year at all,
            // which means only one film goes by this title.
            var bare = candidates.filter(function (p) { return !yearOf(p); });
            if (!(candidates.length === 1 && bare.length === 1)) return '';
            byYear = bare;
          }
          candidates = byYear;
        } else {
          // No year given: refuse as soon as the title turns out to be shared.
          var years = {};
          candidates.forEach(function (p) { var y = yearOf(p); if (y) years[y] = 1; });
          if (Object.keys(years).length > 1) return '';
        }

        var hit = candidates.filter(function (p) { return p.thumbnail && p.thumbnail.source; })[0];
        return hit ? hit.thumbnail.source : '';
      })
      .catch(function () { t.done(); return ''; });
  }

  function lookupPoster(title, year) {
    var key = normTitle(title) + '|' + (year || '');
    var hit = posterCache[key];

    if (hit && (Date.now() - hit.t) < POSTER_TTL) {
      return Promise.resolve(hit.u || '');
    }

    var remember = function (url) {
      posterCache[key] = { u: url, t: Date.now() };
      cacheDirty = true;
      return url;
    };

    return fromApi(title, year)
      .then(function (url) { return url || fromWikipedia(title, year); })
      .then(remember)
      .catch(function () { return ''; });
  }

  // Swaps in a remote poster only after it has fully decoded.
  function applyPoster(card, url) {
    if (!url) return;
    var img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = '';

    img.onload = function () {
      if (!img.naturalWidth) return;           // zero-byte / corrupt response
      var slot = card.querySelector('.poster__frame');
      if (!slot) return;
      img.className = 'poster__img';
      slot.appendChild(img);
      requestAnimationFrame(function () { img.classList.add('is-ready'); });
      // Marquee frames with a real photograph get the chromatic pass.
      if (window.MovieDropChroma) window.MovieDropChroma(card, url);
    };
    img.onerror = function () { /* generated poster stays — nothing to do */ };

    img.src = url;
  }

  // Three at a time so a long list never floods the connection.
  function hydratePosters(cards) {
    var queue = cards.slice();
    var active = 0;

    function pump() {
      while (active < 3 && queue.length) {
        (function (item) {
          active++;
          var p = item.movie.poster
            ? Promise.resolve(item.movie.poster)
            : lookupPoster(item.movie.raw || item.movie.title, item.movie.year);

          p.then(function (url) { applyPoster(item.card, url); })
            .catch(function () {})
            .then(function () {
              active--;
              if (queue.length) pump();
              else if (!active) flushCache();
            });
        })(queue.shift());
      }
    }

    pump();
  }

  /* ========================================================================
     Rendering
     ===================================================================== */
  // Shared by the grid cards and the Now Showing frames.
  function ctaFor(movie, cls) {
    var open = unlocked || movie.free;
    if (!movie.link) {
      return '<span class="' + cls + ' card__cta--soon">' +
        '<svg aria-hidden="true"><use href="#i-clock"/></svg>Coming soon</span>';
    }
    if (open) {
      return '<a class="' + cls + '" href="' + esc(movie.link) + '" target="_blank" rel="noopener noreferrer" ' +
        'aria-label="Watch ' + esc(movie.title) + ' on ' + esc(movie.ott.label) + '">' +
        '<svg aria-hidden="true"><use href="#i-play"/></svg>Watch</a>';
    }
    return '<a class="' + cls + '"><svg aria-hidden="true"><use href="#i-lock"/></svg>Locked</a>';
  }

  function posterMarkup(movie, i) {
    return '<div class="poster">' +
        '<div class="poster__frame">' +
          '<div class="poster__art">' + buildPoster(movie.raw || movie.title, i) + '</div>' +
        '</div>' +
        '<div class="poster__scrim"></div>' +
        '<div class="poster__glow" aria-hidden="true"></div>' +
        '<div class="poster__sheen" aria-hidden="true"></div>' +
        '<div class="poster__marks" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<div class="poster__head">' +
          '<span class="poster__no" aria-hidden="true">FILM ' + String(i + 1).padStart(3, '0') + '</span>' +
          '<span class="poster__tag" style="--ott:' + esc(movie.ott.color) + '">' + esc(movie.ott.label) + '</span>' +
        '</div>' +
        (movie.free
          ? '<span class="poster__free">Free</span>'
          : '<div class="poster__locked">' +
              '<p class="poster__band">' +
                '<svg aria-hidden="true"><use href="#i-lock"/></svg>Locked' +
              '</p>' +
            '</div>') +
      '</div>';
  }

  function buildCard(movie, i) {
    var card = document.createElement('article');
    card.className = 'card' + (unlocked || movie.free ? ' is-unlocked' : '');
    card.style.setProperty('--d', Math.min(i, 11) * 65 + 'ms');

    card.innerHTML =
      posterMarkup(movie, i) +
      '<div class="card__body">' +
        '<h3 class="card__title">' + esc(movie.title) + '</h3>' +
        '<p class="card__meta">' + esc(movie.ott.label) +
          (movie.year ? '<i aria-hidden="true"></i>' + esc(movie.year) : '') + '</p>' +
        ctaFor(movie, 'card__cta') +
      '</div>';

    return card;
  }

  function render(list) {
    movies = list;

    el.skeleton.hidden = true;
    el.notice.hidden = true;

    if (!list.length) {
      el.grid.hidden = true;
      el.notice.hidden = false;
      el.noticeTitle.textContent = 'The projector is being threaded';
      el.noticeCopy.textContent = 'New films are on the way. Check back in a moment.';
      el.sectionNote.textContent = '';
      return;
    }

    list.forEach(function (m, i) { m.free = i < FREE_PREVIEW && !!m.link; });

    var frag = document.createDocumentFragment();
    var pairs = list.map(function (m, i) {
      var card = buildCard(m, i);
      frag.appendChild(card);
      return { card: card, movie: m };
    });

    el.grid.innerHTML = '';
    el.grid.appendChild(frag);
    el.grid.hidden = false;


    var n = list.length;
    var free = Math.min(FREE_PREVIEW, n);
    var shut = Math.max(0, n - free);

    el.sectionNote.textContent = unlocked
      ? n + (n === 1 ? ' film, all open' : ' films, all open')
      : (shut ? free + ' free, ' + shut + ' locked' : n + ' films');

    if (el.dockText) {
      el.dockText.textContent = shut
        ? shut + (shut === 1 ? ' film locked' : ' films locked')
        : 'Follow for the next drop';
    }

    el.heroCount.hidden = false;
    el.heroCount.className = 'slug slug--count tick';
    if (window.MovieDropTick) {
      window.MovieDropTick(el.heroCount, n, '', n === 1 ? ' film this week' : ' films this week');
    } else {
      el.heroCount.textContent = n + (n === 1 ? ' film this week' : ' films this week');
    }

    hydratePosters(pairs);
  }

  function showError() {
    el.skeleton.hidden = true;
    el.grid.hidden = true;
    el.notice.hidden = false;
    el.noticeTitle.textContent = 'The reel didn’t arrive';
    el.noticeCopy.textContent = 'Something broke on the way here. Give it another roll.';
    el.sectionNote.textContent = '';
  }

  /* ========================================================================
     Lock / unlock
     ===================================================================== */
  function paintGate() {
    el.gate.setAttribute('data-state', unlocked ? 'unlocked' : 'locked');
    el.gateLocked.hidden = unlocked;
    el.gateUnlocked.hidden = !unlocked;
    document.body.classList.toggle('is-open', unlocked);
    if (el.encore) el.encore.hidden = unlocked;
    if (el.dock) el.dock.hidden = unlocked;
    paintUnlockBtn();
  }

  // Step two of the gate stays inert until step one has happened.
  function paintUnlockBtn() {
    var ready = visitedIg;
    el.unlockBtn.disabled = !ready;
    el.unlockBtn.setAttribute('aria-disabled', String(!ready));
    el.unlockBtn.classList.toggle('is-primed', ready);
    el.unlockBtn.innerHTML = ready
      ? '<svg aria-hidden="true"><use href="#i-unlock"/></svg>' +
        '<span>I&rsquo;ve followed &mdash; open them</span>'
      : '<svg aria-hidden="true"><use href="#i-lock"/></svg>' +
        '<span>Follow first</span>';
    el.gateStep.textContent = ready
      ? 'Back from Instagram? Tap to open.'
      : 'Two taps. Then it stays open.';
  }

  var awaitingReturn = false;
  var returnTimer = null;

  function markVisited() {
    if (visitedIg) return;
    visitedIg = true;
    awaitingReturn = false;
    clearTimeout(returnTimer);
    store.set(LS_VISITED, 'yes');
    paintUnlockBtn();
  }

  function onFollowClick() {
    awaitingReturn = true;
    // Some in-app browsers (Instagram's own included) never fire a visibility
    // change for an outbound link, so a short timer makes sure nobody ends up
    // stuck behind a button that will not enable.
    clearTimeout(returnTimer);
    returnTimer = setTimeout(markVisited, 4000);
  }

  function onReturn() {
    if (awaitingReturn && document.visibilityState === 'visible') markVisited();
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    requestAnimationFrame(function () { el.toast.classList.add('is-visible'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.toast.classList.remove('is-visible');
      setTimeout(function () { el.toast.hidden = true; }, 400);
    }, 3200);
  }

  function unlockAll() {
    if (unlocked || !visitedIg) return;
    unlocked = true;
    store.set(LS_UNLOCK, 'yes');
    paintGate();

    // The one orchestrated moment: the lamp strikes, the film advances a
    // frame, then the shutters lift across the grid in order.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (el.flash) {
        el.flash.classList.remove('is-firing');
        void el.flash.offsetWidth;               // restart the animation
        el.flash.classList.add('is-firing');
      }
      if (el.grid) {
        el.grid.classList.remove('is-advancing');
        void el.grid.offsetWidth;
        el.grid.classList.add('is-advancing');
        setTimeout(function () { el.grid.classList.remove('is-advancing'); }, 600);
      }
    }

    // Re-point each locked CTA at its real destination.
    function openOne(node, movie) {
      node.classList.add('is-unlocked');
      var cta = node.querySelector('a.card__cta');
      if (cta && movie && movie.link) {
        cta.setAttribute('href', movie.link);
        cta.setAttribute('target', '_blank');
        cta.setAttribute('rel', 'noopener noreferrer');
        cta.setAttribute('aria-label', 'Watch ' + movie.title + ' on ' + movie.ott.label);
        cta.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg>Watch';
      }
    }

    Array.prototype.forEach.call(el.grid.querySelectorAll('.card'), function (card, i) {
      setTimeout(function () { openOne(card, movies[i]); }, 180 + Math.min(i, 14) * 55);
    });


    if (movies.length) {
      el.sectionNote.textContent = movies.length +
        (movies.length === 1 ? ' film, all open' : ' films, all open');
    }

    toast('Screening open — now showing');

    var drops = document.getElementById('drops');
    if (drops) {
      setTimeout(function () { drops.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 420);
    }
  }

  /* ========================================================================
     Boot
     ===================================================================== */
  function start() {
    el.skeleton.hidden = false;
    el.grid.hidden = true;
    el.notice.hidden = true;
    el.sectionNote.textContent = 'Threading the reel…';

    loadSheet().then(render, function (err) {
      if (window.console) console.warn('[MovieDrop] sheet unavailable:', err && err.message);
      showError();
    });
  }

  paintGate();

  el.unlockBtn.addEventListener('click', function () {
    if (!visitedIg) return;          // belt and braces alongside the disabled attribute
    unlockAll();
  });
  el.retryBtn.addEventListener('click', start);

  el.followBtn.addEventListener('click', onFollowClick);
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  window.addEventListener('pageshow', onReturn);

  // Give the sticky bar a hairline once the page has moved.
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      el.topbar.classList.toggle('is-stuck', window.scrollY > 12);
      ticking = false;
    });
  }, { passive: true });

  window.addEventListener('pagehide', flushCache);

  start();
})();
