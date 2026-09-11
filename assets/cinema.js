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

  /* ── Parallax + sticky bar ─────────────────────────────────────────────
     Desktop only, transform-only, one rAF per frame.                      */
  (function scrollFx() {
    var topbar = $('topbar');
    var beam = $('beam');
    var leakA = $('leakA');
    var leakB = $('leakB');
    var parallax = fine && !reduced;
    var ticking = false;

    function frame() {
      var y = window.scrollY || 0;
      if (topbar) topbar.classList.toggle('is-stuck', y > 16);

      if (parallax) {
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
      card.style.setProperty('--mx', (((x - r.left) / r.width) * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (((y - r.top) / r.height) * 100).toFixed(1) + '%');
      pending = null;
    }

    grid.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      pending = { card: card, rect: card.getBoundingClientRect(), x: e.clientX, y: e.clientY };
      if (!queued) { queued = true; requestAnimationFrame(apply); }
    }, { passive: true });
  })();
})();
