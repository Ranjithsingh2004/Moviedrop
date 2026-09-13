/* ==========================================================================
   MovieDrop — motion layer

   Presentation only. It never touches the sheet, the poster chain or the
   follow gate; if this file fails to load, the site still works and nothing
   is left invisible (the reveal styles are opt-in via a class this adds).
   ========================================================================== */
(function () {
  'use strict';

  // Declares that the motion layer is live. The reveal styles hide content
  // only under this class, so if this file never runs, nothing is hidden.
  document.documentElement.classList.add('cinema-ready');

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(id) { return document.getElementById(id); }

  /* ── Projector leader ───────────────────────────────────────────────────
     Once per tab. Skipped entirely for reduced motion, and it can never
     strand the page: the element starts hidden and is only shown if we are
     definitely going to take it away again.                                */
  (function leader() {
    var node = $('leader');
    if (!node) return;

    var seen = false;
    try { seen = sessionStorage.getItem('moviedrop.leader') === 'seen'; } catch (e) {}
    if (reduced || seen) { node.remove(); return; }

    try { sessionStorage.setItem('moviedrop.leader', 'seen'); } catch (e) {}

    node.hidden = false;
    document.documentElement.style.overflow = 'hidden';

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      document.documentElement.style.overflow = '';
      node.classList.add('is-out');
      setTimeout(function () { node.classList.add('is-gone'); }, 700);
      setTimeout(function () { if (node.parentNode) node.remove(); }, 1100);
    }

    setTimeout(finish, 1250);
    // Any deliberate input cuts the leader short.
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, finish, { once: true, passive: true });
    });
    // Belt and braces: never leave the page locked.
    setTimeout(function () { document.documentElement.style.overflow = ''; }, 3000);
  })();

  /* ── Scroll reveals ────────────────────────────────────────────────────── */
  (function reveals() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (n, i) {
      n.style.setProperty('--d', Math.min(i, 6) * 70 + 'ms');
      io.observe(n);
    });

    // Cards arrive after the sheet does, so watch the grid for new children.
    var grid = $('grid');
    if (!grid) return;

    var cardIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        cardIo.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.06 });

    new MutationObserver(function () {
      [].slice.call(grid.querySelectorAll('.card:not(.is-in)')).forEach(function (c) {
        cardIo.observe(c);
      });
    }).observe(grid, { childList: true });

    // Last resort. If an observer never fires — an odd in-app browser, a
    // zero-height viewport, a background tab — show everything anyway.
    setTimeout(function () {
      [].slice.call(document.querySelectorAll('[data-reveal]:not(.is-in), .card:not(.is-in)'))
        .forEach(function (n) { n.classList.add('is-in'); });
    }, 4000);
  })();

  /* ── Scroll: the camera pulls back from the hero ───────────────────────
     One scroll-linked moment rather than effects scattered down the page.
     Transform and opacity only, one rAF per frame.                        */
  (function scrollFx() {
    var topbar = $('topbar');
    var hero = document.querySelector('.hero');
    var inner = document.querySelector('.hero__inner');
    var beam = $('beam');
    var leakA = $('leakA');
    var leakB = $('leakB');
    var rich = fine && !reduced;
    var ticking = false;

    function frame() {
      var y = window.scrollY || 0;
      if (topbar) topbar.classList.toggle('is-stuck', y > 16);

      if (hero && inner && !reduced) {
        // 0 while the hero is framed, 1 once it has left the gate.
        var travel = Math.max(hero.offsetHeight * 0.78, 1);
        var p = Math.min(1, Math.max(0, y / travel));
        inner.style.setProperty('--recede', p.toFixed(3));
        // Stop compositing it once it is gone.
        inner.style.visibility = p >= 0.999 ? 'hidden' : '';
      }

      if (rich) {
        if (beam)  beam.style.transform  = 'translate3d(-50%,' + (y * 0.14) + 'px,0)';
        if (leakA) leakA.style.transform = 'translate3d(0,' + (y * -0.05) + 'px,0)';
        if (leakB) leakB.style.transform = 'translate3d(0,' + (y * -0.09) + 'px,0)';
      }
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    }, { passive: true });

    window.addEventListener('resize', frame, { passive: true });
    frame();
  })();

  /* ── Poster lighting follows the cursor ────────────────────────────────
     Desktop only. One listener on the grid, one rAF, no per-card handlers. */
  (function posterLight() {
    if (!fine || reduced) return;

    var grid = $('grid');
    if (!grid) return;

    var pending = null;
    var queued = false;

    function apply() {
      queued = false;
      if (!pending) return;
      var card = pending.card, r = pending.rect, x = pending.x, y = pending.y;
      var fx = (x - r.left) / r.width;
      var fy = (y - r.top) / r.height;
      card.style.setProperty('--mx', (fx * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (fy * 100).toFixed(1) + '%');
      // -1..1 from the centre, for the tilt.
      card.style.setProperty('--tx', (fx * 2 - 1).toFixed(3));
      card.style.setProperty('--ty', (fy * 2 - 1).toFixed(3));
      pending = null;
    }

    grid.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      pending = { card: card, rect: card.getBoundingClientRect(), x: e.clientX, y: e.clientY };
      if (!queued) { queued = true; requestAnimationFrame(apply); }
    }, { passive: true });

    // Settle the print back flat when the pointer leaves it.
    grid.addEventListener('pointerleave', function () {
      [].slice.call(grid.querySelectorAll('.card')).forEach(function (c) {
        c.style.setProperty('--tx', '0');
        c.style.setProperty('--ty', '0');
      });
    }, { passive: true });
  })();

  /* ── Counting a number up ──────────────────────────────────────────────
     Exposed for app.js, which owns the copy around it.                    */
  window.MovieDropTick = function (node, to, prefix, suffix) {
    if (!node) return;
    if (reduced || to <= 1) { node.textContent = prefix + to + suffix; return; }

    var start = null;
    var dur = 620;
    function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = prefix + Math.round(to * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
})();
