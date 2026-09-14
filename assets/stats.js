/* ==========================================================================
   MovieDrop Stats

   Reads aggregates from the Convex HTTP action at <base>/stats. The
   passphrase is compared on that server, never here, so a wrong key gets a
   401 and no data — reading this page's source tells you nothing.

   Charts are inline SVG. Palette validated with the dataviz skill's script
   against this page's surface (#100b0d):
     categorical  #d1494f #0f9d92 #b8861c #7d6cc8   — all six checks pass
     ordinal      #f0a9ac → #a8323c                  — monotone, single hue
   ========================================================================== */
(function () {
  'use strict';

  var CAT = ['#d1494f', '#0f9d92', '#b8861c', '#7d6cc8'];
  var RAMP = ['#f0a9ac', '#dc7b81', '#c4545c', '#a8323c'];

  var STEPS = [
    ['view',   'Landed'],
    ['follow', 'Tapped follow'],
    ['unlock', 'Unlocked'],
    ['watch',  'Opened a film']
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  /* ── Tooltip ─────────────────────────────────────────────────────────── */
  var tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);

  function bindTip(el, html) {
    el.addEventListener('pointerenter', function (e) {
      tip.innerHTML = html;
      tip.classList.add('is-on');
      move(e);
    });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', function () { tip.classList.remove('is-on'); });
    function move(e) {
      var w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(window.innerWidth - w - 10, Math.max(10, e.clientX + 14)) + 'px';
      tip.style.top = Math.max(10, e.clientY - h - 12) + 'px';
    }
  }

  /* ── Horizontal bars. One job: compare magnitudes by name. ───────────── */
  function bars(host, rows, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!rows.length || !rows.some(function (r) { return r.v > 0; })) {
      host.innerHTML = '<p class="chartEmpty">Nothing yet</p>';
      return;
    }

    var w = Math.max(300, Math.round(host.clientWidth || opts.w || 760));
    var pad = 4, rowH = opts.rowH || 40;
    var labelW = Math.min(opts.labelW || Math.round(w * 0.28), Math.round(w * 0.42));
    var h = rows.length * rowH + pad * 2;
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
    var barW = w - labelW - Math.round(w * 0.12);

    var svg = ['<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' +
               esc(opts.label || 'bar chart') + '">'];

    rows.forEach(function (r, i) {
      var y = pad + i * rowH;
      var len = Math.max(2, (r.v / max) * barW);
      var fill = r.color || opts.color || CAT[0];

      var cap = Math.max(10, Math.floor(labelW / 6.2));
      svg.push('<text x="0" y="' + (y + 22) + '">' +
        esc(r.k.length > cap ? r.k.slice(0, cap - 1) + '…' : r.k) + '</text>');
      // 4px rounded data-end, anchored to the baseline at x=labelW.
      svg.push('<rect class="mark" x="' + labelW + '" y="' + (y + 8) + '" width="' + len +
               '" height="18" rx="4" fill="' + fill + '" ' +
               'data-tip="' + esc('<b>' + r.k + '</b><br><span>' + r.v + (opts.unit || '') +
               (r.note ? ' · ' + r.note : '') + '</span>') + '"/>');
      svg.push('<text class="val" x="' + (labelW + len + 10) + '" y="' + (y + 22) + '">' +
               r.v + (r.note ? '  ' + r.note : '') + '</text>');
    });

    svg.push('</svg>');
    host.innerHTML = svg.join('');
    host.querySelectorAll('[data-tip]').forEach(function (m) { bindTip(m, m.getAttribute('data-tip')); });
  }

  /* ── Line chart, two series, one axis (both are people) ──────────────── */
  function lines(host, days, series) {
    host.innerHTML = '';
    if (days.length < 2) { host.innerHTML = '<p class="chartEmpty">Needs at least two days</p>'; return; }

    var w = Math.max(300, Math.round(host.clientWidth || 760));
    var h = 260, L = 40, R = 12, T = 14, B = 34;
    var max = 1;
    series.forEach(function (s) { s.vals.forEach(function (v) { if (v > max) max = v; }); });
    var stepX = (w - L - R) / Math.max(1, days.length - 1);
    var y = function (v) { return T + (1 - v / max) * (h - T - B); };

    var svg = ['<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Visitors and unlocks per day">'];

    // Four gridlines, recessive.
    for (var g = 0; g <= 3; g++) {
      var gv = Math.round(max * g / 3), gy = y(gv);
      svg.push('<line class="grid" x1="' + L + '" x2="' + (w - R) + '" y1="' + gy + '" y2="' + gy + '"/>');
      svg.push('<text x="0" y="' + (gy + 4) + '">' + gv + '</text>');
    }

    series.forEach(function (s, si) {
      var d = s.vals.map(function (v, i) { return (i ? 'L' : 'M') + (L + i * stepX) + ' ' + y(v); }).join(' ');
      svg.push('<path class="mark" d="' + d + '" fill="none" stroke="' + CAT[si] +
               '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      s.vals.forEach(function (v, i) {
        svg.push('<circle class="mark" cx="' + (L + i * stepX) + '" cy="' + y(v) + '" r="4" fill="' + CAT[si] +
                 '" stroke="#100b0d" stroke-width="2"/>');
      });
    });

    // One hit column per day carries the crosshair and the tooltip.
    days.forEach(function (d, i) {
      var x = L + i * stepX;
      var rows = series.map(function (s, si) {
        return '<span style="color:' + CAT[si] + '">■</span> ' + s.name + ' <b>' + s.vals[i] + '</b>';
      }).join('<br>');
      svg.push('<rect class="hit" x="' + (x - stepX / 2) + '" y="' + T + '" width="' + stepX +
               '" height="' + (h - T - B) + '" data-tip="' + esc('<b>' + d.slice(5) + '</b><br>' + rows) + '"/>');
      if (i === 0 || i === days.length - 1 || (days.length > 6 && i === Math.floor(days.length / 2))) {
        svg.push('<text x="' + x + '" y="' + (h - 10) + '" text-anchor="middle">' + esc(d.slice(5)) + '</text>');
      }
    });

    svg.push('</svg>');

    var legend = '<ul class="legend">' + series.map(function (s, si) {
      return '<li><i style="background:' + CAT[si] + '"></i>' + esc(s.name) + '</li>';
    }).join('') + '</ul>';

    host.innerHTML = legend + svg.join('');
    host.querySelectorAll('[data-tip]').forEach(function (m) { bindTip(m, m.getAttribute('data-tip')); });
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  var lastData = null;

  function render(d) {
    lastData = d;
    $('stamp').textContent = 'Last ' + d.days + ' days · generated ' + d.generated;

    var t = d.totals;
    var tiles = [
      ['Visitors', t.view, ''],
      ['Tapped follow', t.follow, pct(t.follow, t.view) + '% of visitors'],
      ['Unlocked', t.unlock, pct(t.unlock, t.view) + '% of visitors'],
      ['Opened a film', t.watch,
        t.unlock && t.watch <= t.unlock ? pct(t.watch, t.unlock) + '% of unlocks' : 'people']
    ];
    $('tiles').innerHTML = tiles.map(function (x) {
      return '<div class="tile"><p class="tile__k">' + esc(x[0]) + '</p>' +
             '<p class="tile__v">' + x[1] + '</p>' +
             (x[2] ? '<p class="tile__sub">' + esc(x[2]) + '</p>' : '') + '</div>';
    }).join('');

    // Funnel: ordinal stages, so one hue stepping darker.
    var prev = null;
    bars($('funnel'), STEPS.map(function (s, i) {
      var v = t[s[0]] || 0;
      var p = prev === null ? null : pct(v, prev);
      prev = v;
      return { k: s[1], v: v, note: (p === null || p > 100) ? '' : p + '%', color: RAMP[i] };
    }), { label: 'Funnel', w: 760, labelW: 150, unit: ' people' });

    var days = Object.keys(d.byDay).sort();
    lines($('trend'), days, [
      { name: 'Visitors', vals: days.map(function (k) { return d.byDay[k].view || 0; }) },
      { name: 'Unlocked', vals: days.map(function (k) { return d.byDay[k].unlock || 0; }) }
    ]);

    var films = Object.keys(d.films).map(function (k) { return { k: k, v: d.films[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    bars($('films'), films, { label: 'Most opened films', color: CAT[0], unit: ' opens',
      w: 420, rowH: 34, labelW: 150 });

    var split = [];
    Object.keys(d.surfaces).forEach(function (k, i) {
      split.push({ k: k, v: d.surfaces[k], color: CAT[i % CAT.length] });
    });
    split.sort(function (a, b) { return b.v - a.v; });
    bars($('split'), split.slice(0, 6), { label: 'Where visitors come from', unit: ' visitors',
      w: 420, rowH: 34, labelW: 118 });

    var head = ['When', 'Event', 'Detail', 'Device', 'Browser', 'Source'];
    $('log').innerHTML =
      '<thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + (d.recent.length
        ? d.recent.map(function (r) {
            return '<tr>' + r.map(function (c, i) {
              return '<td' + (i === 1 ? ' class="ev"' : '') + '>' + esc(c) + '</td>';
            }).join('') + '</tr>';
          }).join('')
        : '<tr><td colspan="6">Nothing recorded yet.</td></tr>') + '</tbody>';
  }

  /* ── Fetch ───────────────────────────────────────────────────────────
     Convex HTTP actions send CORS headers, so this is an ordinary request.
     The passphrase is checked on the server; a wrong one gets a 401 and no
     data.                                                                 */
  var key = '', days = 30, inflight = null;

  function load(done) {
    var base = (window.MOVIEDROP_STATS_URL || '').replace(/\/+$/, '');
    if (!base) { done('not-configured'); return; }

    if (inflight) inflight.abort();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    inflight = ctrl;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

    fetch(base + '/stats?key=' + encodeURIComponent(key) + '&days=' + days,
          ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        clearTimeout(timer);
        inflight = null;
        if (r.status === 401) return r.json().then(function () { throw new Error('unauthorised'); });
        if (r.status === 500) return r.json().then(function (d) {
          throw new Error(d && d.error === 'no-passphrase-set' ? 'no-passphrase-set' : 'server');
        });
        if (!r.ok) throw new Error('http-' + r.status);
        return r.json();
      })
      .then(function (data) { render(data); done(null); })
      .catch(function (err) {
        clearTimeout(timer);
        inflight = null;
        var name = err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'network';
        done(name);
      });
  }

  /* ── Where the passphrase is kept ────────────────────────────────────
     localStorage, so checking the numbers on a phone doesn't mean retyping
     it every time. It is her own device and the passphrase only ever reads
     aggregate counts, but "Lock" clears it for a shared or borrowed one.
     sessionStorage is still read once, so anyone mid-session is not asked
     again the first time this version loads.                              */
  var KEY = 'moviedrop.statskey';

  function readKey() {
    try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; }
    catch (e) { return ''; }
  }
  function saveKey(v) {
    try { localStorage.setItem(KEY, v); sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function forgetKey() {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
  }

  /* ── Screens ─────────────────────────────────────────────────────────── */
  var root = document.documentElement;

  function showLock(reason) {
    root.classList.remove('has-key');
    $('booting').hidden = true;
    $('lockScreen').hidden = false;
    $('dash').hidden = true;
    if (reason) fail(reason); else lockErr.hidden = true;
    var f = $('passInput');
    if (f && !/mobile|android|iphone/i.test(navigator.userAgent)) f.focus();
  }

  function showDash() {
    root.classList.remove('has-key');
    $('booting').hidden = true;
    $('lockScreen').hidden = true;
    $('dash').hidden = false;
    if (lastData) render(lastData);   // now that the panels have a width
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  var lockErr = $('lockErr');

  function fail(reason) {
    var msg = reason === 'unauthorised' ? 'That passphrase does not match.'
            : reason === 'not-configured' ? 'No stats backend is set up yet. See README → Stats.'
            : reason === 'no-passphrase-set' ? 'The backend has no passphrase set. Run: npx convex env set STATS_PASSPHRASE "…"'
            : reason === 'timeout' ? 'The backend did not answer. Check the deployment is live.'
            : /^http-404$/.test(reason) ? 'The stats route is not deployed yet. Run: npx convex deploy'
            : 'Could not reach the backend.';
    lockErr.textContent = msg;
    lockErr.hidden = false;
    $('passInput').value = '';
  }

  $('lockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    lockErr.hidden = true;
    var btn = $('lockForm').querySelector('button[type=submit]');
    var was = btn.textContent;
    btn.classList.add('is-pending');
    btn.textContent = 'Checking…';
    key = $('passInput').value.trim();
    load(function (err) {
      btn.classList.remove('is-pending');
      btn.textContent = was;
      if (err) { fail(err); $('passInput').focus(); return; }
      saveKey(key);
      showDash();
    });
  });

  $('lockBtn').addEventListener('click', function () {
    forgetKey();
    key = '';
    lastData = null;
    showLock();
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (lastData) render(lastData); }, 180);
  }, { passive: true });

  /* A range switch refetches. The numbers already on screen stay where they
     are and dim, so it reads as updating rather than emptying out.        */
  function busy(on) {
    document.querySelector('.statsBody').classList.toggle('is-busy', !!on);
    $('busyNote').hidden = !on;
  }

  document.querySelectorAll('.range').forEach(function (b) {
    b.addEventListener('click', function () {
      var prev = document.querySelector('.range.is-on');
      document.querySelectorAll('.range').forEach(function (o) { o.classList.remove('is-on'); });
      b.classList.add('is-on');
      days = parseInt(b.getAttribute('data-days'), 10);
      busy(true);
      load(function (err) {
        busy(false);
        if (!err) return;
        // Leave the numbers that are on screen alone and say why they are stale.
        if (prev) { b.classList.remove('is-on'); prev.classList.add('is-on'); days = parseInt(prev.getAttribute('data-days'), 10); }
        $('stamp').textContent = err === 'unauthorised'
          ? 'The passphrase changed — tap Lock and sign in again.'
          : 'Could not refresh (' + err + ') — showing the last numbers that loaded.';
      });
    });
  });

  $('csvBtn').addEventListener('click', function () {
    if (!lastData) return;
    var rows = [['when', 'event', 'detail', 'device', 'browser', 'source']].concat(lastData.recent);
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'moviedrop-events.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ── Boot ────────────────────────────────────────────────────────────── */
  if (!window.MOVIEDROP_STATS_URL) {
    var n = $('note');
    n.hidden = false;
    n.innerHTML = 'No stats backend is configured yet. Put your Convex HTTP Actions URL into ' +
                  '<code>assets/config.js</code> — the steps are in the README under <b>Stats</b>.';
    document.querySelector('.lockCard').appendChild(n);
  }

  var saved = readKey();
  if (saved) {
    // The head script is already showing the loading screen for this case.
    key = saved;
    load(function (err) {
      if (!err) { showDash(); return; }
      // A passphrase that no longer works is worth forgetting; a network
      // blip is not, so a later reload can resume without retyping.
      if (err === 'unauthorised') forgetKey();
      showLock(err);
    });
  } else {
    showLock();
  }
})();
