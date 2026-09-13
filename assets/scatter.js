/* ==========================================================================
   MovieDrop — the cutting room

   Loose slide mounts you can push around a light table. Ported from
   Aceternity UI's DraggableCard (React + Framer Motion) to vanilla, and
   rebuilt around pointer events so it works with a finger as well as a mouse.

   The mobile problem this has to solve: a draggable area can easily trap the
   page scroll. Two defences —
     1. touch-action:pan-y, so vertical panning always belongs to the browser.
     2. A direction test on the first few pixels: a gesture that reads as a
        scroll is handed straight back before anything is captured.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var box = document.getElementById('lightbox');
  if (!box) return;

  var top = 10;                    // rising z-index for the slide in hand
  var held = null;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function bounds(slide) {
    var b = box.getBoundingClientRect();
    var s = slide.getBoundingClientRect();
    return { maxX: Math.max(0, b.width - s.width), maxY: Math.max(0, b.height - s.height) };
  }

  function place(slide, x, y) {
    var lim = bounds(slide);
    slide.__x = clamp(x, 0, lim.maxX);
    slide.__y = clamp(y, 0, lim.maxY);
    slide.style.setProperty('--x', slide.__x.toFixed(1) + 'px');
    slide.style.setProperty('--y', slide.__y.toFixed(1) + 'px');
  }

  function tilt(slide, tx, ty) {
    slide.style.setProperty('--tx', tx.toFixed(3));
    slide.style.setProperty('--ty', ty.toFixed(3));
    slide.style.setProperty('--glare', Math.min(1, Math.abs(ty) * 1.1).toFixed(2));
  }

  function rest(slide) {
    slide.style.setProperty('--tx', '0');
    slide.style.setProperty('--ty', '0');
    slide.style.setProperty('--glare', '0');
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    var slide = e.target.closest && e.target.closest('.slide');
    if (!slide || held) return;

    held = {
      slide: slide,
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      originX: slide.__x || 0, originY: slide.__y || 0,
      lastX: e.clientX, lastY: e.clientY, lastT: performance.now(),
      vx: 0, vy: 0,
      moved: 0,
      decided: false,      // has the gesture been claimed as a drag yet
      captured: false
    };
    slide.classList.remove('is-settling');
  }

  function onMove(e) {
    if (!held || e.pointerId !== held.id) return;
    var dx = e.clientX - held.startX;
    var dy = e.clientY - held.startY;
    held.moved = Math.max(held.moved, Math.abs(dx) + Math.abs(dy));

    if (!held.decided) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;      // too early to tell
      // Reads as a scroll — let go entirely and leave the page to the browser.
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && e.pointerType !== 'mouse') {
        held = null;
        return;
      }
      held.decided = true;
      held.captured = true;
      try { held.slide.setPointerCapture(held.id); } catch (err) {}
      held.slide.classList.add('is-held');
      held.slide.style.zIndex = ++top;
      document.body.style.cursor = 'grabbing';
    }

    var now = performance.now();
    var dt = Math.max(1, now - held.lastT);
    held.vx = (e.clientX - held.lastX) / dt * 16;        // px per frame
    held.vy = (e.clientY - held.lastY) / dt * 16;
    held.lastX = e.clientX; held.lastY = e.clientY; held.lastT = now;

    place(held.slide, held.originX + dx, held.originY + dy);

    if (!reduced) {
      var r = held.slide.getBoundingClientRect();
      tilt(held.slide,
        clamp(((e.clientY - r.top) / r.height - 0.5) * -2, -1, 1),
        clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1));
    }
  }

  function onUp(e) {
    if (!held || (e && e.pointerId !== held.id)) return;
    var h = held;
    held = null;
    document.body.style.cursor = '';

    if (h.captured) { try { h.slide.releasePointerCapture(h.id); } catch (err) {} }
    h.slide.classList.remove('is-held');
    rest(h.slide);

    // A drag must not also register as a click on the mount's link — but the
    // guard has to expire immediately, or it would swallow the next genuine
    // tap instead of the one this drag produced.
    if (h.moved >= 6) {
      h.slide.__noClick = true;
      setTimeout(function () { h.slide.__noClick = false; }, 0);
    } else {
      return;                        // a tap: let the link do its job
    }

    if (reduced) return;

    // Let it carry, then come to rest.
    var vx = clamp(h.vx, -55, 55), vy = clamp(h.vy, -55, 55);
    var x = h.slide.__x, y = h.slide.__y;
    var lim = bounds(h.slide);

    (function glide() {
      vx *= 0.92; vy *= 0.92;
      x += vx; y += vy;
      if (x <= 0 || x >= lim.maxX) vx *= -0.45;          // bounce off the table edge
      if (y <= 0 || y >= lim.maxY) vy *= -0.45;
      place(h.slide, x, y);
      x = h.slide.__x; y = h.slide.__y;
      if (Math.abs(vx) + Math.abs(vy) > 0.4) requestAnimationFrame(glide);
    })();
  }

  // One permanent guard, rather than a listener per drag.
  box.addEventListener('click', function (e) {
    var slide = e.target.closest && e.target.closest('.slide');
    if (slide && slide.__noClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  box.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });

  // Hover tilt on a mouse, without dragging.
  box.addEventListener('pointermove', function (e) {
    if (held || reduced || e.pointerType !== 'mouse') return;
    var slide = e.target.closest && e.target.closest('.slide');
    if (!slide) return;
    var r = slide.getBoundingClientRect();
    tilt(slide,
      clamp(((e.clientY - r.top) / r.height - 0.5) * -2, -1, 1),
      clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1));
  }, { passive: true });

  box.addEventListener('pointerout', function (e) {
    var slide = e.target.closest && e.target.closest('.slide');
    if (slide && !held) rest(slide);
  }, { passive: true });

  // Deterministic scatter: a pile, not a grid, and the same pile every time.
  window.MovieDropScatter = function () {
    var slides = [].slice.call(box.querySelectorAll('.slide'));
    if (!slides.length) return;
    var b = box.getBoundingClientRect();

    slides.forEach(function (slide, i) {
      var s = slide.getBoundingClientRect();
      var n = slides.length;
      // Fan across the middle, alternating above and below the line.
      var t = n === 1 ? 0.5 : i / (n - 1);
      var x = (b.width - s.width) * (0.08 + t * 0.84);
      var y = (b.height - s.height) * (0.5 + Math.sin(i * 1.9) * 0.3);
      slide.style.setProperty('--r', (Math.sin(i * 2.7) * 9).toFixed(1) + 'deg');
      slide.style.zIndex = 10 + i;
      place(slide, x, y);
    });
    top = 10 + slides.length;
  };

  window.addEventListener('resize', function () {
    if (window.MovieDropScatter) window.MovieDropScatter();
  }, { passive: true });
})();
