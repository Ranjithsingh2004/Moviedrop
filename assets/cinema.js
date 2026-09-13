/* ==========================================================================
   MovieDrop — motion layer

   Presentation only. It never touches the sheet, the poster chain or the
   follow gate; if this file fails to load, the site still works and nothing
   is left hidden — the reveal styles are opt-in via a class this adds.
   ========================================================================== */
(function () {
  'use strict';

  // Declares that the motion layer is live. The reveal styles hide content
  // only under this class, so if this file never runs, nothing is hidden.
  document.documentElement.classList.add('cinema-ready');

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(id) { return document.getElementById(id); }

  /* ── Scroll reveals ────────────────────────────────────────────────────
     Content is exposed like a frame reaching the gate, not faded up.      */
  (function reveals() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      var grid0 = $('grid');
      if (grid0) new MutationObserver(function () {
        [].slice.call(grid0.querySelectorAll('.card')).forEach(function (c) { c.classList.add('is-in'); });
      }).observe(grid0, { childList: true });
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

    // Last resort: if an observer never fires, show everything anyway.
    setTimeout(function () {
      [].slice.call(document.querySelectorAll('[data-reveal]:not(.is-in), .card:not(.is-in)'))
        .forEach(function (n) { n.classList.add('is-in'); });
    }, 4000);
  })();

  /* ── Scroll: the sticky bar, and the camera pulling back from the hero ── */
  (function scrollFx() {
    var topbar = $('topbar');
    var hero = document.querySelector('.hero');
    var inner = document.querySelector('.hero__inner');
    var beam = $('beam');
    var ticking = false;

    function frame() {
      var y = window.scrollY || 0;
      if (topbar) topbar.classList.toggle('is-stuck', y > 16);

      if (hero && inner && !reduced) {
        var travel = Math.max(hero.offsetHeight * 0.85, 1);
        var p = Math.min(1, Math.max(0, y / travel));
        inner.style.setProperty('--recede', p.toFixed(3));
      }

      if (fine && !reduced && beam) {
        beam.style.transform = 'translate3d(-50%,' + (y * 0.12) + 'px,0)';
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

  /* ── Poster lighting follows the cursor (desktop only) ────────────────── */
  (function posterLight() {
    if (!fine || reduced) return;

    var grid = $('grid');
    if (!grid) return;

    var pending = null, queued = false;

    function apply() {
      queued = false;
      if (!pending) return;
      var card = pending.card, r = pending.rect;
      var fx = (pending.x - r.left) / r.width;
      var fy = (pending.y - r.top) / r.height;
      card.style.setProperty('--mx', (fx * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (fy * 100).toFixed(1) + '%');
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

    grid.addEventListener('pointerleave', function () {
      [].slice.call(grid.querySelectorAll('.card')).forEach(function (c) {
        c.style.setProperty('--tx', '0');
        c.style.setProperty('--ty', '0');
      });
    }, { passive: true });
  })();

  /* ── Dock: rises once the hero's ask has scrolled away ────────────────── */
  (function dock() {
    var node = $('dock');
    var ask = document.querySelector('.ask');
    if (!node || !ask) return;

    function sync() {
      var show = !node.hidden && ask.getBoundingClientRect().bottom < 0;
      node.classList.toggle('is-up', show);
      document.body.classList.toggle('has-dock', show);
    }

    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    // app.js hides the dock outright once unlocked.
    new MutationObserver(sync).observe(node, { attributes: true, attributeFilter: ['hidden'] });
    sync();
  })();

  /* ── Counting a number up. app.js owns the copy around it. ───────────── */
  window.MovieDropTick = function (node, to, prefix, suffix) {
    if (!node) return;
    if (reduced || to <= 1) { node.textContent = prefix + to + suffix; return; }

    var start = null, dur = 620;
    function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      node.textContent = prefix + Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
})();
