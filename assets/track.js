/* ==========================================================================
   MovieDrop — event beacon

   Records the four steps that matter: a visit, a tap on Follow, the unlock,
   and a tap on a film. Fire-and-forget via sendBeacon, so it never delays a
   navigation and never blocks the page. If the endpoint is not configured,
   this file does nothing at all.

   No cookies, no third party, no cross-site identifiers. The session id is a
   random value in sessionStorage that dies with the tab, and exists only so
   one visit is not counted as four.
   ========================================================================== */
(function () {
  'use strict';

  var BASE = (window.MOVIEDROP_STATS_URL || '').replace(/\/+$/, '');
  if (!BASE) return;
  var URL_ = BASE + '/track';

  function sid() {
    try {
      var v = sessionStorage.getItem('moviedrop.sid');
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('moviedrop.sid', v);
      }
      return v;
    } catch (e) { return 'nostore'; }
  }

  // Coarse buckets only — enough to tell a phone from a laptop, and to spot
  // Instagram's in-app browser, which behaves differently from Safari.
  function device() {
    var w = window.innerWidth || 0;
    return w < 620 ? 'phone' : w < 1024 ? 'tablet' : 'desktop';
  }

  function surface() {
    var ua = navigator.userAgent || '';
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/FBAN|FBAV/i.test(ua)) return 'facebook';
    if (/\bWebView\b|\bwv\b/i.test(ua)) return 'in-app';
    return 'browser';
  }

  function source() {
    try {
      var q = new URLSearchParams(location.search).get('src');
      if (q) return q.slice(0, 24);
      if (!document.referrer) return 'direct';
      return new URL(document.referrer).hostname.replace(/^www\./, '').slice(0, 40);
    } catch (e) { return 'direct'; }
  }

  var base = { sid: sid(), device: device(), surface: surface(), source: source() };

  function send(event, detail) {
    var body = JSON.stringify({
      event: event,
      detail: (detail || '').toString().slice(0, 80),
      sid: base.sid, device: base.device, surface: base.surface, source: base.source,
      tz: new Date().getTimezoneOffset()
    });
    try {
      // text/plain keeps it a simple request — no preflight to fail.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(URL_, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        return;
      }
      fetch(URL_, { method: 'POST', mode: 'no-cors', keepalive: true, body: body });
    } catch (e) { /* analytics must never break the page */ }
  }

  send('view');

  // Delegated, so it covers the hero, the repeat ask, the dock and the topbar,
  // and anything added later.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;

    if (/instagram\.com/i.test(a.href)) {
      var where = a.closest('.dock') ? 'dock'
                : a.closest('.encore') ? 'encore'
                : a.closest('.topbar') ? 'topbar'
                : a.closest('.ask') ? 'hero' : 'other';
      send('follow', where);
      return;
    }

    var card = a.closest('.card');
    if (card && a.classList.contains('card__cta')) {
      var t = card.querySelector('.card__title');
      send('watch', t ? t.textContent : '');
    }
  }, true);

  var unlockBtn = document.getElementById('unlockBtn');
  if (unlockBtn) unlockBtn.addEventListener('click', function () {
    if (!unlockBtn.disabled) send('unlock');
  });
})();
