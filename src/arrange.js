/* v6.15: Arrange panel - align the selection to itself and distribute it evenly. Groups move as one unit. Shown when two or more objects are selected. */
(function () {
  'use strict';
  var rp = document.getElementById('rpanel'); if (!rp || window.Arrange) return;

  function units() {
    var list = selIds.map(function (id) { return objects.find(function (o) { return o.id === id; }); }).filter(function (o) { return o && !o.locked; }), map = {}, out = [];
    list.forEach(function (o) {
      var k = o.gid ? 'g' + o.gid : 'o' + o.id; if (!map[k]) { map[k] = { items: [] }; out.push(map[k]); } map[k].items.push(o);
    });
    out.forEach(function (u) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      u.items.forEach(function (o) { var b = objBounds(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
      u.x = x0; u.y = y0; u.w = x1 - x0; u.h = y1 - y0;
    });
    return out;
  }
  function move(u, dx, dy) { if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return; u.items.forEach(function (o) { translateObj(o, dx, dy); }); }
  function align(how) {
    var us = units(); if (us.length < 2) return 0;
    var L = Math.min.apply(null, us.map(function (u) { return u.x; })), R = Math.max.apply(null, us.map(function (u) { return u.x + u.w; })),
        T = Math.min.apply(null, us.map(function (u) { return u.y; })), B = Math.max.apply(null, us.map(function (u) { return u.y + u.h; }));
    pushUndo();
    us.forEach(function (u) {
      if (how === 'left') move(u, L - u.x, 0); else if (how === 'right') move(u, R - (u.x + u.w), 0); else if (how === 'center') move(u, (L + R) / 2 - (u.x + u.w / 2), 0);
      else if (how === 'top') move(u, 0, T - u.y); else if (how === 'bottom') move(u, 0, B - (u.y + u.h)); else if (how === 'middle') move(u, 0, (T + B) / 2 - (u.y + u.h / 2));
    });
    draw(); updateTransform(); return us.length;
  }
  function distribute(axis) {                          /* equal gaps between the units, outer two stay where they are */
    var us = units(); if (us.length < 3) { toast('Distribute needs at least three objects'); return 0; }
    var h = axis === 'h', pos = h ? 'x' : 'y', size = h ? 'w' : 'h';
    us.sort(function (a, b) { return a[pos] - b[pos]; });
    var first = us[0], last = us[us.length - 1], span = last[pos] + last[size] - first[pos], total = us.reduce(function (s, u) { return s + u[size]; }, 0), gap = (span - total) / (us.length - 1);
    pushUndo(); var cur = first[pos] + first[size] + gap;
    for (var i = 1; i < us.length - 1; i++) { var d = cur - us[i][pos]; if (h) move(us[i], d, 0); else move(us[i], 0, d); cur += us[i][size] + gap; }
    draw(); updateTransform(); return us.length;
  }

  var panel = document.createElement('section'); panel.id = 'arrangePanel'; panel.className = 'spanel'; panel.style.display = 'none';
  var btn = function (id, label, title) { return '<button class="mbtn" id="' + id + '" title="' + title + '" style="flex:1;padding:5px;font-size:10px;min-width:30px">' + label + '</button>'; };
  panel.innerHTML = '<div class="spanel-head" style="cursor:default"><span>Arrange</span><span style="font-size:10px;opacity:.7">ALIGN &amp; SPACE</span></div><div class="spanel-body">' +
    '<div style="font:700 9px var(--ui);text-transform:uppercase;letter-spacing:1.5px;color:var(--portal);margin-bottom:4px">Align to each other</div>' +
    '<div style="display:flex;gap:3px;flex-wrap:wrap">' + btn('arL', 'L', 'Align left edges') + btn('arC', 'C', 'Align centres horizontally') + btn('arR', 'R', 'Align right edges') + btn('arT', 'T', 'Align top edges') + btn('arM', 'M', 'Align centres vertically') + btn('arB', 'B', 'Align bottom edges') + '</div>' +
    '<div style="font:700 9px var(--ui);text-transform:uppercase;letter-spacing:1.5px;color:var(--portal);margin:8px 0 4px">Space evenly (3 or more)</div>' +
    '<div style="display:flex;gap:3px">' + btn('arDH', 'Across', 'Equal gaps left to right') + btn('arDV', 'Down', 'Equal gaps top to bottom') + '</div></div>';
  var lay = document.getElementById('layerList'); lay = lay && lay.closest('.spanel');
  if (lay && lay.parentNode) lay.parentNode.insertBefore(panel, lay); else rp.appendChild(panel);
  var $ = function (id) { return panel.querySelector('#' + id); };
  [['arL', 'left'], ['arC', 'center'], ['arR', 'right'], ['arT', 'top'], ['arM', 'middle'], ['arB', 'bottom']].forEach(function (a) { $(a[0]).onclick = function () { align(a[1]); }; });
  $('arDH').onclick = function () { distribute('h'); }; $('arDV').onclick = function () { distribute('v'); };
  function refresh() { panel.style.display = selIds.length >= 2 ? 'block' : 'none'; var n = units().length; $('arDH').disabled = $('arDV').disabled = n < 3; }
  var baseRefresh = refreshLayers; refreshLayers = function () { baseRefresh.apply(this, arguments); refresh(); };
  window.Arrange = { align: align, distribute: distribute, units: units }; refresh();
})();
