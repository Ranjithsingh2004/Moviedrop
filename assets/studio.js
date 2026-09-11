/* ==========================================================================
   MovieDrop Studio

   Owner-facing poster picker. It writes nothing anywhere — it finds artwork
   and hands you the URL to paste into the sheet's "poster" column, which the
   site treats as the final word on a movie's poster.

   About the passphrase: it runs in the browser, so anyone reading the page
   source can get past it. It is a doormat, not a lock. That is acceptable
   here only because this page has no destructive power — it searches public
   poster catalogues and copies links. Never put anything secret behind it.
   ========================================================================== */
(function () {
  'use strict';

  // SHA-256 of the passphrase. To change it, hash your new phrase and paste
  // the hex digest here. In any browser console:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your phrase'))
  //     .then(b => console.log([...new Uint8Array(b)]
  //       .map(x => x.toString(16).padStart(2,'0')).join('')));
  var PASS_HASH = '50c8e147ac43e93bb2ee900243ac299b78e73a69015182a1a3d8b30f7a7741e1';

  var SHEET_ID  = '1UWeqWaGwmzGwVyjDSgwL_Eie1iHk8NWHCmA38iSOYPk';
  var SHEET_TAB = 'Sheet1';
  var LS_OPEN   = 'moviedrop.studio.v1';

  function $(id) { return document.getElementById(id); }
  var el = {
    lockScreen: $('lockScreen'), lockForm: $('lockForm'), passInput: $('passInput'), lockErr: $('lockErr'),
    studio: $('studio'), tmdbNote: $('tmdbNote'),
    searchForm: $('searchForm'), qInput: $('qInput'), searchHint: $('searchHint'),
    resultsWrap: $('resultsWrap'), results: $('results'),
    resultsTitle: $('resultsTitle'), resultsNote: $('resultsNote'),
    customForm: $('customForm'), customInput: $('customInput'), customPreview: $('customPreview'),
    sheetRows: $('sheetRows'), sheetNote: $('sheetNote'),
    toast: $('toast')
  };

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    requestAnimationFrame(function () { el.toast.classList.add('is-visible'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.toast.classList.remove('is-visible');
      setTimeout(function () { el.toast.hidden = true; }, 400);
    }, 2600);
  }

  /* ── Passphrase ───────────────────────────────────────────────────────── */
  function sha256Hex(text) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      })
      .catch(function () { return null; });
  }

  function openStudio() {
    el.lockScreen.hidden = true;
    el.studio.hidden = false;
    loadSheet();
  }

  el.lockForm.addEventListener('submit', function (e) {
    e.preventDefault();
    el.lockErr.hidden = true;
    sha256Hex(el.passInput.value.trim()).then(function (hex) {
      if (hex && hex === PASS_HASH) {
        store.set(LS_OPEN, hex);
        openStudio();
      } else {
        el.lockErr.hidden = false;
        el.passInput.value = '';
        el.passInput.focus();
      }
    });
  });

  if (store.get(LS_OPEN) === PASS_HASH) openStudio();

  /* ── Clipboard ────────────────────────────────────────────────────────── */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  // Instagram's in-app browser and any non-HTTPS preview land here.
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ── Poster search ────────────────────────────────────────────────────── */
  var searchToken = 0;

  function search(title) {
    var mine = ++searchToken;
    el.resultsWrap.hidden = false;
    el.resultsTitle.textContent = 'Results for “' + title + '”';
    el.resultsNote.textContent = 'Searching…';
    el.results.innerHTML = '';

    fetch('api/poster?list=1&title=' + encodeURIComponent(title))
      .then(function (r) {
        var type = r.headers.get('content-type') || '';
        if (!r.ok || type.indexOf('json') === -1) throw new Error('no api');
        return r.json();
      })
      .then(function (data) {
        if (mine !== searchToken) return;        // a newer search already ran
        var list = (data && data.results) || [];

        if (data && !data.tmdb) {
          el.tmdbNote.hidden = false;
          el.tmdbNote.innerHTML =
            'Searching IMDb only, which returns its top few most-popular matches. ' +
            'For smaller regional films, add a free <strong>TMDB_API_KEY</strong> in ' +
            'Vercel → Settings → Environment Variables, then redeploy.';
        }

        if (!list.length) {
          el.resultsNote.textContent = 'Nothing found';
          el.results.innerHTML =
            '<p class="panel__hint">No posters for that title. Try the original ' +
            'or English spelling, or paste your own image link below.</p>';
          return;
        }

        el.resultsNote.textContent = list.length + ' found · tap one to copy its link';
        el.results.innerHTML = list.map(function (c) {
          return '<button class="hit" type="button" data-url="' + esc(c.url) + '">' +
            '<span class="hit__shot">' +
              '<img src="' + esc(c.url) + '" alt="" loading="lazy" ' +
                'onerror="this.closest(\'.hit\').remove()">' +
              '<span class="hit__badge">' + esc(c.source) + '</span>' +
              '<span class="hit__copy"><svg aria-hidden="true"><use href="#i-copy"/></svg>Copy link</span>' +
            '</span>' +
            '<span class="hit__name">' + esc(c.title) + '</span>' +
            '<span class="hit__meta">' + esc(c.year || '—') +
              (c.extra ? ' · ' + esc(String(c.extra).slice(0, 40)) : '') + '</span>' +
          '</button>';
        }).join('');
      })
      .catch(function () {
        if (mine !== searchToken) return;
        el.resultsNote.textContent = '';
        el.results.innerHTML =
          '<p class="panel__hint">Poster search needs the <code>/api/poster</code> ' +
          'function, which only runs on the deployed Vercel site — not on a plain ' +
          'local server. You can still paste your own image link below.</p>';
      });
  }

  el.results.addEventListener('click', function (e) {
    var hit = e.target.closest('.hit');
    if (!hit) return;
    var url = hit.getAttribute('data-url');
    copy(url).then(function (ok) {
      toast(ok ? 'Link copied — paste it into the poster column' : 'Copy failed — long-press the image instead');
    });
  });

  el.searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = el.qInput.value.trim();
    if (q) search(q);
  });

  /* ── Custom URL preview ───────────────────────────────────────────────── */
  el.customForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var url = el.customInput.value.trim();
    if (!url) return;

    el.customPreview.hidden = false;
    el.customPreview.innerHTML = '<p>Loading…</p>';

    var img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = function () {
      el.customPreview.innerHTML = '';
      img.alt = '';
      el.customPreview.appendChild(img);
      var p = document.createElement('p');
      p.innerHTML = 'Loads fine — ' + img.naturalWidth + '×' + img.naturalHeight + '.<br>' +
        'Paste this link into the <strong>poster</strong> column for that movie.';
      el.customPreview.appendChild(p);
    };
    img.onerror = function () {
      el.customPreview.innerHTML =
        '<p class="bad">That link did not load as an image. It needs to point ' +
        'straight at a file (ending .jpg, .png or .webp), not at a page showing one.</p>';
    };
    img.src = url;
  });

  /* ── The sheet ────────────────────────────────────────────────────────── */
  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false, i;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { q = false; } }
        else field += c;
        continue;
      }
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = [];
      } else field += c;
    }
    row.push(field); rows.push(row);
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  function col(header, names) {
    for (var i = 0; i < header.length; i++) {
      var k = String(header[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (names.indexOf(k) !== -1) return i;
    }
    return -1;
  }

  function loadSheet() {
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(SHEET_TAB) + '&_=' + Date.now();

    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.text(); })
      .then(function (text) {
        var rows = parseCSV(text);
        if (!rows.length) throw new Error('empty');

        var h = rows[0];
        var iT = col(h, ['movie', 'movies', 'title', 'name', 'moviename']);
        var iY = col(h, ['year', 'released', 'releaseyear', 'releasedate']);
        var iP = col(h, ['poster', 'image', 'img', 'thumbnail', 'posterurl']);
        var body = iT === -1 ? rows : rows.slice(1);
        if (iT === -1) iT = 0;

        var movies = [];
        body.forEach(function (r) {
          var raw = String(r[iT] || '').trim();
          if (!raw) return;
          var m = raw.match(/^(.*?)\s*\((19\d{2}|20\d{2})\)\s*$/);
          movies.push({
            title: m && m[1].trim() ? m[1].trim() : raw,
            year: (m ? m[2] : '') || String(iY > -1 ? (r[iY] || '') : '').replace(/\D/g, '').slice(0, 4),
            poster: String(iP > -1 ? (r[iP] || '') : '').trim()
          });
        });

        renderSheet(movies, iP > -1);
      })
      .catch(function () {
        el.sheetNote.textContent = '';
        el.sheetRows.innerHTML =
          '<p class="panel__hint">Could not read the sheet just now. Reload to try again.</p>';
      });
  }

  function renderSheet(movies, hasPosterCol) {
    el.sheetNote.textContent = movies.length + (movies.length === 1 ? ' movie' : ' movies');

    if (!movies.length) {
      el.sheetRows.innerHTML = '<p class="panel__hint">No movies in the sheet yet.</p>';
      return;
    }

    if (!hasPosterCol) {
      el.searchHint.innerHTML =
        'Your sheet has no <strong>poster</strong> column yet. Add one ' +
        '(any position, header spelled <code>poster</code>) and paste links into it.';
    }

    el.sheetRows.innerHTML = movies.map(function (m, i) {
      return '<div class="row" data-i="' + i + '">' +
        '<span class="row__thumb" id="thumb' + i + '"></span>' +
        '<span class="row__text">' +
          '<p class="row__name">' + esc(m.title) + (m.year ? ' <span class="row__meta">(' + esc(m.year) + ')</span>' : '') + '</p>' +
          '<p class="row__meta" id="stat' + i + '">Checking…</p>' +
        '</span>' +
        '<button class="btn btn--ghost btn--quiet" type="button" data-find="' + i + '">' +
          '<svg aria-hidden="true"><use href="#i-search"/></svg>Find poster</button>' +
      '</div>';
    }).join('');

    el.sheetRows.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-find]');
      if (!btn) return;
      var m = movies[Number(btn.getAttribute('data-find'))];
      el.qInput.value = m.title;
      search(m.title);
      el.resultsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    checkAll(movies);
  }

  // Shows, per row, what the live site will actually display right now.
  function checkAll(movies) {
    var queue = movies.map(function (m, i) { return { m: m, i: i }; });
    var active = 0;

    function setRow(i, thumbUrl, text, warn) {
      var stat = $('stat' + i), thumb = $('thumb' + i);
      if (stat) stat.innerHTML = warn ? '<span class="warn">' + esc(text) + '</span>' : esc(text);
      if (thumb && thumbUrl) {
        var img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.alt = '';
        img.onload = function () { thumb.innerHTML = ''; thumb.appendChild(img); };
        img.src = thumbUrl;
      }
    }

    function pump() {
      while (active < 3 && queue.length) {
        (function (item) {
          active++;
          var done = function () { active--; if (queue.length) pump(); };

          if (item.m.poster) {
            setRow(item.i, item.m.poster, 'Using your poster column');
            return done();
          }

          fetch('api/poster?title=' + encodeURIComponent(item.m.title) +
                (item.m.year ? '&year=' + encodeURIComponent(item.m.year) : ''))
            .then(function (r) {
              var t = r.headers.get('content-type') || '';
              if (!r.ok || t.indexOf('json') === -1) throw new Error('no api');
              return r.json();
            })
            .then(function (d) {
              if (d && d.url) {
                setRow(item.i, d.url, 'Auto: ' + (d.title || '') + (d.year ? ' (' + d.year + ')' : '') +
                  ' · ' + d.source);
              } else if (!item.m.year) {
                setRow(item.i, '', 'Generated poster — add a year to help the lookup', true);
              } else {
                setRow(item.i, '', 'Generated poster — no match found', true);
              }
            })
            .catch(function () { setRow(item.i, '', 'Deploy to check automatically'); })
            .then(done);
        })(queue.shift());
      }
    }

    pump();
  }
})();
