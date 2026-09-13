/* ==========================================================================
   MovieDrop Stats

   Reads aggregates from the Apps Script backend by JSONP, because an Apps
   Script web app cannot be relied on to send CORS headers. The passphrase is
   checked on that server, not here — this page never holds the data, and a
   wrong key gets nothing back.

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

  /* ── Fetch by JSONP ──────────────────────────────────────────────────── */
  var key = '', days = 30, seq = 0;

  function load(onErr) {
    var url = window.MOVIEDROP_STATS_URL;
    if (!url) { onErr('not-configured'); return; }

    var name = '__mdstats' + (++seq);
    var s = document.createElement('script');
    var done = false;

    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      cleanup();
      onErr('timeout');
    }, 12000);

    window[name] = function (data) {
      done = true;
      clearTimeout(timer);
      cleanup();
      if (data && data.error) { onErr(data.error); return; }
      render(data);
      onErr(null);
    };

    function cleanup() {
      try { delete window[name]; } catch (e) { window[name] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }

    s.src = url + (url.indexOf('?') === -1 ? '?' : '&') +
      'key=' + encodeURIComponent(key) + '&days=' + days + '&callback=' + name;
    s.onerror = function () { if (!done) { done = true; clearTimeout(timer); cleanup(); onErr('network'); } };
    document.head.appendChild(s);
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  var lockErr = $('lockErr');

  function fail(reason) {
    var msg = reason === 'unauthorised' ? 'That passphrase does not match.'
            : reason === 'not-configured' ? 'No stats backend is set up yet. See README → Stats.'
            : reason === 'timeout' ? 'The backend did not answer. Check the deployment is live.'
            : 'Could not reach the backend.';
    lockErr.textContent = msg;
    lockErr.hidden = false;
    $('passInput').value = '';
    $('passInput').focus();
  }

  $('lockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    lockErr.hidden = true;
    key = $('passInput').value.trim();
    load(function (err) {
      if (err) { fail(err); return; }
      try { sessionStorage.setItem('moviedrop.statskey', key); } catch (x) {}
      $('lockScreen').hidden = true;
      $('dash').hidden = false;
      if (lastData) render(lastData);      // now that it has a width
    });
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (lastData) render(lastData); }, 180);
  }, { passive: true });

  document.querySelectorAll('.range').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.range').forEach(function (o) { o.classList.remove('is-on'); });
      b.classList.add('is-on');
      days = parseInt(b.getAttribute('data-days'), 10);
      load(function (err) { if (err) $('stamp').textContent = 'Could not refresh (' + err + ')'; });
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

  // Come straight back in within the same tab.
  try {
    var saved = sessionStorage.getItem('moviedrop.statskey');
    if (saved) {
      key = saved;
      load(function (err) {
        if (err) return;
        $('lockScreen').hidden = true;
        $('dash').hidden = false;
        if (lastData) render(lastData);
      });
    }
  } catch (e) {}

  if (!window.MOVIEDROP_STATS_URL) {
    var n = $('note');
    n.hidden = false;
    n.innerHTML = 'No stats backend is configured yet. Paste your Apps Script Web App URL into ' +
                  '<code>assets/config.js</code> — the steps are in the README under <b>Stats</b>.';
    document.querySelector('.lockCard').appendChild(n);
  }
})();
