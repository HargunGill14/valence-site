/* Valence home: switches the hero card to the ticker variant with ?hero=ticker.
   Both cards are static: the HTML shows each one's finished state. */
(function () {
  'use strict';
  if (!/[?&]hero=ticker\b/.test(location.search)) return;
  var split = document.getElementById('hero-split');
  var ticker = document.getElementById('hero-ticker');
  if (split && ticker) { split.hidden = true; ticker.hidden = false; }
})();
