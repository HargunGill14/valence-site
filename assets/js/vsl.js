/* Valence home: the video letter. Six scenes of large type play in about 22 seconds while the frame is on
   screen, and loop. Tap the frame or the button to pause. With reduced motion it waits for a tap. */
(function () {
  'use strict';
  var vsl = document.getElementById('vsl'); if (!vsl) return;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var scenes = vsl.querySelectorAll('.vsl__scene');
  var btn = document.getElementById('vsl-btn'), ico = document.getElementById('vsl-ico');
  var fill = document.getElementById('vsl-fill'), time = document.getElementById('vsl-time');
  var durs = Array.prototype.map.call(scenes, function (s) { return +s.getAttribute('data-ms'); });
  var total = durs.reduce(function (a, b) { return a + b; }, 0), pos = 0, playing = false, last = 0, held = false;
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function show() {
    var acc = 0, idx = durs.length - 1;
    for (var i = 0; i < durs.length; i++) { if (pos < acc + durs[i]) { idx = i; break; } acc += durs[i]; }
    for (var j = 0; j < scenes.length; j++) scenes[j].classList.toggle('on', j === idx);
    fill.style.width = (pos / total * 100) + '%';
    time.textContent = fmt(pos) + ' / ' + fmt(total);
  }
  function frame(ts) {
    if (!playing) return;
    pos += Math.min(100, ts - last); last = ts;
    if (pos >= total) pos = 0;
    show(); requestAnimationFrame(frame);
  }
  function setPlay(on) {
    if (on === playing) return;
    playing = on;
    btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    ico.innerHTML = on ? '<path d="M2 1h3v10H2zM7 1h3v10H7z"/>' : '<path d="M2 1l9 5-9 5z"/>';
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); held = playing; setPlay(!playing); });
  vsl.addEventListener('click', function (e) { if (e.target.closest('.vsl__bar')) return; held = playing; setPlay(!playing); });
  show();
  if (!reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { if (!held) setPlay(true); } else setPlay(false);
    }, { threshold: 0.6 }).observe(vsl);
  }
})();
