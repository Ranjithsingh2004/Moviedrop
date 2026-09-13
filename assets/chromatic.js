/* ==========================================================================
   MovieDrop — chromatic poster

   A WebGL pass over the Now Showing posters: the colour channels separate and
   the frame weaves as you move across it. That is not a glitch effect here —
   it is what a misregistered print does going through a projector gate.

   Shader approach adapted from Aceternity UI's ChromaticImage (React/WebGL),
   ported to vanilla and retuned for film rather than generic distortion.

   Strictly an enhancement:
   - Desktop pointers only, and never under prefers-reduced-motion.
   - Only on frames that resolved a real poster photograph. Generated posters
     keep their crisp vector typography, which rasterising would destroy.
   - Any failure — no WebGL, a tainted texture, a lost context — leaves the
     original poster exactly as it was.
   ========================================================================== */
(function () {
  'use strict';

  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  var VERT =
    'attribute vec2 p;varying vec2 v;' +
    'void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uImg;',
    'uniform vec2 uPtr;',
    'uniform float uImgA, uCanA, uProg;',
    'varying vec2 v;',
    // Cover-fit, so the poster never distorts to the canvas box.
    'vec2 cover(vec2 uv){',
    '  if(uImgA > uCanA){ uv.x = (uv.x-0.5)*uCanA/uImgA + 0.5; }',
    '  else { uv.y = (uv.y-0.5)*uImgA/uCanA + 0.5; }',
    '  return uv;',
    '}',
    'void main(){',
    '  float s = uProg;',
    '  vec2 move = (uPtr - vec2(0.5)) * vec2(uCanA, 1.0);',
    '  vec2 dir = move / max(length(move), 0.2);',
    // Gate weave: a slow horizontal wobble with a finer ripple riding on it.
    '  vec2 uv = mix(v, vec2(0.5), 0.055 * s);',
    '  float weave = sin(v.y * 22.0 + uPtr.x * 4.0);',
    '  float fine  = sin(v.y * 68.0 - uPtr.y * 3.0);',
    '  uv.x += (weave * 0.74 + fine * 0.26) * s * 0.0062;',
    '  uv.y += dir.y * s * 0.0045;',
    '  uv = cover(uv);',
    // Channel separation, strongest away from the pointer.
    '  vec2 split = dir * s * 0.0042;',
    '  split.x += weave * s * 0.0014;',
    '  float r = texture2D(uImg, clamp(uv + split, 0.0, 1.0)).r;',
    '  float g = texture2D(uImg, clamp(uv, 0.0, 1.0)).g;',
    '  float b = texture2D(uImg, clamp(uv - split, 0.0, 1.0)).b;',
    '  gl_FragColor = vec4(r, g, b, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function ease(cur, tgt, speed, dt) { return cur + (tgt - cur) * (1 - Math.exp(-speed * dt)); }

  // Browsers cap live WebGL contexts; the marquee is small, but stay polite.
  var MAX = 4;
  var made = 0;
  var seen = [];

  function attach(frame, url) {
    if (made >= MAX || seen.indexOf(frame) !== -1) return;

    var host = frame.querySelector('.poster__frame');
    var poster = frame.querySelector('.poster');
    if (!host || !poster) return;
    seen.push(frame);

    var canvas = document.createElement('canvas');
    canvas.className = 'poster__gl';
    canvas.setAttribute('aria-hidden', 'true');

    var gl;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    } catch (e) { return; }
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var loc = gl.getAttribLocation(prog, 'p');
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var u = {
      img:  gl.getUniformLocation(prog, 'uImg'),
      ptr:  gl.getUniformLocation(prog, 'uPtr'),
      imgA: gl.getUniformLocation(prog, 'uImgA'),
      canA: gl.getUniformLocation(prog, 'uCanA'),
      prog: gl.getUniformLocation(prog, 'uProg')
    };
    gl.uniform1i(u.img, 0);

    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.clearColor(0.04, 0.03, 0.03, 1);

    var ptr = { x: .5, y: .5 }, target = { x: .5, y: .5 };
    var p = 0, pTarget = 0;
    var loaded = false, running = false, raf = 0, prev = 0;

    function size() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch;
        gl.viewport(0, 0, cw, ch);
      }
      gl.uniform1f(u.canA, w / h);
    }

    function frameLoop(t) {
      var dt = Math.min((t - prev) / 1000, 0.05);
      prev = t;
      p = ease(p, pTarget, 10, dt);
      ptr.x = ease(ptr.x, target.x, 26, dt);
      ptr.y = ease(ptr.y, target.y, 26, dt);

      gl.uniform1f(u.prog, p);
      gl.uniform2f(u.ptr, ptr.x, ptr.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (loaded) gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Stop the loop once it has settled; idle posters cost nothing.
      if (Math.abs(p - pTarget) < 0.001 &&
          Math.abs(ptr.x - target.x) < 0.001 &&
          Math.abs(ptr.y - target.y) < 0.001) {
        running = false;
      } else {
        raf = requestAnimationFrame(frameLoop);
      }
    }

    function run() {
      if (running) return;
      running = true;
      prev = performance.now();
      raf = requestAnimationFrame(frameLoop);
    }

    // A separate request with CORS, so a refusal costs the effect and never
    // the poster the visitor can already see.
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = function () {
      if (!img.naturalWidth) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) { return; }            // tainted or oversized — give up quietly
      gl.uniform1f(u.imgA, img.naturalWidth / img.naturalHeight);
      loaded = true;
      made++;
      host.appendChild(canvas);
      size();
      run();
      requestAnimationFrame(function () { canvas.classList.add('is-ready'); });
    };
    img.onerror = function () { /* poster stays exactly as it was */ };
    img.src = url;

    poster.addEventListener('pointermove', function (e) {
      var r = poster.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1 - (e.clientY - r.top) / r.height;
      pTarget = 1;
      run();
    }, { passive: true });

    poster.addEventListener('pointerleave', function () {
      target.x = .5; target.y = .5; pTarget = 0;
      run();
    }, { passive: true });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { size(); run(); }).observe(poster);
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      canvas.classList.remove('is-ready');
    });
  }

  // app.js calls this once a real poster has decoded onto a marquee frame.
  window.MovieDropChroma = function (node, url) {
    if (!node || !url) return;
    var frame = node.closest ? node.closest('.frame') : null;
    if (frame) attach(frame, url);
  };
})();
