(function () {
  'use strict';
  const target = new URL('./vagabond2026/help.html', location.href);
  target.search = location.search;
  target.hash = location.hash;
  const link = document.getElementById('help-link');
  if (link) link.href = target.href;
  location.replace(target.href);
})();
