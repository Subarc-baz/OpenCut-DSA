/* v6.12: Shape Warp. Same idea as the text Warp style + Curve controls, for rect / ellipse / star / polygon / line / path objects.
   The object becomes an ordinary `path` object (so drawing, SVG/PNG export, print, wand, machine layer all work unchanged) and keeps
   the ORIGINAL geometry in o.wsrc, so choosing "None" restores the real shape, and the effect can be changed at any time.
   Lines become open paths (o.open = true). Images and text are not handled here (text has its own warp). */
(function () {
  'use strict';
  var rp = document.getElementById('rpanel');
  if (!rp || document.getElementById('shapeWarpPanel')) return;
  var STYLES = [['none', 'None'], ['arch', 'Arch'], ['inverted-arch', 'Inverted arch'], ['bulge', 'Bulge'], ['wave', 'Wave'], ['slant', 'Slant'], ['squeeze', 'Squeeze']];
  var OK = { rect: 1, ellipse: 1, star: 1, polygon: 1, line: 1, path: 1 };

  /* ---------- outline -> polylines ---------- */
  function clone(o) { var c = JSON.parse(JSON.stringify(o, function (k, v) { return (k === 'img') ? undefined : v; })); return c; }
  function rrect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    var pts = [], k, a, N = 8, cs = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
    cs.forEach(function (c) { for (k = 0; k <= N; k++) { a = c[2] + (Math.PI / 2) * k / N; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } });
    return pts;
  }
  function outline(o) {                       /* [{pts, closed}] in absolute pixels */
    var out = [], i, a, r, pts;
    if (o.type === 'rect') out.push({ pts: rrect(o.x, o.y, o.w, o.h, o.cornerR), closed: true });
    else if (o.type === 'ellipse') { pts = []; for (i = 0; i < 128; i++) { a = 2 * Math.PI * i / 128; pts.push([o.cx + o.rx * Math.cos(a), o.cy + o.ry * Math.sin(a)]); } out.push({ pts: pts, closed: true }); }
    else if (o.type === 'polygon') { pts = []; for (i = 0; i < o.n; i++) { a = 2 * Math.PI / o.n * i - Math.PI / 2; pts.push([o.cx + o.r * Math.cos(a), o.cy + o.r * Math.sin(a)]); } out.push({ pts: pts, closed: true }); }
    else if (o.type === 'star') { pts = []; for (i = 0; i < o.n * 2; i++) { r = i % 2 === 0 ? o.r : o.ir; a = Math.PI / o.n * i - Math.PI / 2; pts.push([o.cx + r * Math.cos(a), o.cy + r * Math.sin(a)]); } out.push({ pts: pts, closed: true }); }
    else if (o.type === 'line') out.push({ pts: [[o.x1, o.y1], [o.x2, o.y2]], closed: false });
    else if (o.type === 'path') {
      var fx = o.w / (o.bw || 1), fy = o.h / (o.bh || 1);
      (o.contours || []).forEach(function (ct) { out.push({ pts: ct.map(function (p) { return [o.x + p[0] * fx, o.y + p[1] * fy]; }), closed: !o.open }); });
    }
    return out;
  }
  function densify(c, maxSeg) {
    var P = c.pts, n = P.length, out = [], last = c.closed ? n : n - 1, i, j, p, q, len, k;
    for (i = 0; i < last; i++) {
      p = P[i]; q = P[(i + 1) % n]; len = Math.hypot(q[0] - p[0], q[1] - p[1]); k = Math.max(1, Math.ceil(len / maxSeg));
      for (j = 0; j < k; j++) out.push([p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k]);
    }
    if (!c.closed) out.push(P[n - 1].slice());
    return { pts: out, closed: c.closed };
  }

  /* ---------- warp ---------- */
  function warpPoint(style, k, p, B) {
    var nx = (p[0] - B.cx) / B.hw, ny = (p[1] - B.cy) / B.hh, x = p[0], y = p[1], t;
    switch (style) {
      case 'arch': y -= k * 0.5 * B.A * (1 - nx * nx); break;
      case 'inverted-arch': y += k * 0.5 * B.A * (1 - nx * nx); break;
      case 'bulge': t = 1 - nx * nx; x = B.cx + (x - B.cx) * (1 + 0.25 * k * (1 - ny * ny)); y = B.cy + (y - B.cy) * (1 + 0.6 * k * t); break;
      case 'wave': y += k * 0.3 * B.A * Math.sin(nx * Math.PI * 2); break;
      case 'slant': x += -ny * k * 0.35 * B.W; break;
      case 'squeeze': y = B.cy + (y - B.cy) * Math.max(0.04, 1 - 0.7 * k * Math.abs(nx)); break;
    }
    return [x, y];
  }
  /* returns { x,y,w,h,bw,bh,contours,open } for a path object built from `src` warped by style/amount */
  function warpLine(src, style, amt) {         /* straight lines bend along their own direction, whatever the angle */
    var dx = src.x2 - src.x1, dy = src.y2 - src.y1, L = Math.hypot(dx, dy) || 1, nxv = dy / L, nyv = -dx / L, A = 0.3 * L;
    var k = Math.max(-1, Math.min(1, (+amt || 0) / 100)), N = 64, pts = [], i, u, off;
    for (i = 0; i <= N; i++) {
      u = 2 * i / N - 1;
      off = style === 'arch' ? 0.5 * A * (1 - u * u) : style === 'inverted-arch' ? -0.5 * A * (1 - u * u) : style === 'bulge' ? 0.3 * A * (1 - u * u) : style === 'wave' ? 0.3 * A * Math.sin(u * Math.PI * 2) : 0;
      pts.push([src.x1 + dx * i / N + nxv * off * k, src.y1 + dy * i / N + nyv * off * k]);
    }
    return pts;
  }
  function buildWarped(src, style, amt) {
    var lines = src.type === 'line' ? [{ closed: false, pts: warpLine(src, style, amt) }] : outline(src); if (!lines.length) return null;
    var isLine = src.type === 'line';
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    lines.forEach(function (c) { c.pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
    var w = x1 - x0, h = y1 - y0, big = Math.max(w, h, 1);
    var B = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: Math.max(w / 2, 0.5), hh: Math.max(h / 2, 0.5), A: Math.max(h, 0.3 * w), W: Math.max(w, 0.3 * h) };
    var k = Math.max(-1, Math.min(1, (+amt || 0) / 100)), seg = Math.max(1, big / 48);
    var res = lines.map(function (c) { if (isLine) return c; var d = densify(c, seg); return { closed: c.closed, pts: d.pts.map(function (p) { return warpPoint(style, k, p, B); }) }; });
    var X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    res.forEach(function (c) { c.pts.forEach(function (p) { X0 = Math.min(X0, p[0]); Y0 = Math.min(Y0, p[1]); X1 = Math.max(X1, p[0]); Y1 = Math.max(Y1, p[1]); }); });
    var W = X1 - X0, H = Y1 - Y0;
    return { x: X0, y: Y0, w: W, h: H, bw: W, bh: H, open: !res[0].closed,
      contours: res.map(function (c) { return c.pts.map(function (p) { return [p[0] - X0, p[1] - Y0]; }); }) };
  }

  /* ---------- keep the stored original in step with moves/resizes made after warping ---------- */
  function currentSource(o) {
    var src = clone(o.wsrc), wb = o.wbox || { x: o.x, y: o.y, w: o.w, h: o.h };
    var sx = wb.w > 1e-9 ? o.w / wb.w : 1, sy = wb.h > 1e-9 ? o.h / wb.h : 1;
    if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9) { var c = Object.assign({}, src); scaleObj(src, c, sx, sy, wb.x, wb.y); }
    var dx = o.x - wb.x, dy = o.y - wb.y;
    if (dx || dy) translateObj(src, dx, dy);
    return src;
  }
  var KEEP = ['id', 'gid', 'name', 'fill', 'stroke', 'strokeW', 'alpha', 'hidden', 'pattern', 'locked', 'rot'];
  function replaceWith(o, nu) { Object.keys(o).forEach(function (k) { delete o[k]; }); Object.assign(o, nu); }

  function apply(style, amt) {
    var o = sel; if (!o || !OK[o.type]) return;
    if (style === 'none') {
      if (!o.wsrc) return;
      var src = currentSource(o), nu = Object.assign({}, src);
      KEEP.forEach(function (k) { if (o[k] !== undefined) nu[k] = o[k]; else delete nu[k]; });
      delete nu.wsrc; delete nu.wbox; delete nu.wstyle; delete nu.wamt;
      replaceWith(o, nu);
    } else {
      var base = o.wsrc ? currentSource(o) : clone(o);
      var g = buildWarped(base, style, amt); if (!g) return;
      var nu2 = { type: 'path', x: g.x, y: g.y, w: g.w, h: g.h, bw: g.bw, bh: g.bh, contours: g.contours };
      if (g.open) nu2.open = true;
      KEEP.forEach(function (k) { if (o[k] !== undefined) nu2[k] = o[k]; });
      if (g.open && (!nu2.stroke || nu2.stroke === 'none')) nu2.stroke = base.stroke;
      if (g.open) nu2.fill = 'none';
      nu2.wsrc = base; nu2.wbox = { x: g.x, y: g.y, w: g.w, h: g.h }; nu2.wstyle = style; nu2.wamt = +amt || 0;
      replaceWith(o, nu2);
    }
    draw(); updateTransform(); refresh();
  }

  /* ---------- panel ---------- */
  var panel = document.createElement('section');
  panel.id = 'shapeWarpPanel'; panel.className = 'spanel'; panel.style.display = 'none';
  panel.innerHTML =
    '<div class="spanel-head" style="cursor:default"><span>Shape Warp</span><span style="font-size:10px;opacity:.7">SELECTED SHAPE</span></div>' +
    '<div class="spanel-body">' +
    '<div class="opt-row"><label for="swStyle">Warp style</label><select id="swStyle" style="flex:1;min-width:0">' + STYLES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="opt-row"><label for="swAmt">Amount</label><input id="swAmt" type="range" min="-100" max="100" step="1" value="50" style="flex:1;min-width:70px"><input id="swAmtV" type="number" min="-100" max="100" value="50" style="width:54px" class="ninput"></div>' +
    '<div style="font-size:10px;line-height:1.5;color:var(--dim);margin-top:5px">Bends the selected shape. The original shape is kept: choose None to restore it. Negative amounts warp the other way. Lines bend with Arch, Inverted arch, Bulge or Wave.</div>' +
    '</div>';
  var lay = document.getElementById('layerList'); lay = lay && lay.closest('.spanel');
  if (lay && lay.parentNode) lay.parentNode.insertBefore(panel, lay); else rp.appendChild(panel);
  var selStyle = panel.querySelector('#swStyle'), slider = panel.querySelector('#swAmt'), num = panel.querySelector('#swAmtV');

  function refresh() {
    var o = (sel && OK[sel.type] && selIds.length < 2) ? sel : null;
    panel.style.display = o ? 'block' : 'none';
    if (!o) return;
    var ln = (o.wsrc ? o.wsrc.type : o.type) === 'line';
    Array.prototype.forEach.call(selStyle.options, function (op) { op.disabled = ln && (op.value === 'slant' || op.value === 'squeeze'); });
    selStyle.value = o.wsrc ? (o.wstyle || 'none') : 'none';
    var a = o.wsrc ? (+o.wamt || 0) : 50;
    if (document.activeElement !== slider) slider.value = a;
    if (document.activeElement !== num) num.value = a;
    slider.disabled = num.disabled = selStyle.value === 'none';
  }
  var pushed = false;
  selStyle.addEventListener('change', function () {
    if (!sel || !OK[sel.type]) return;
    var v = this.value, amt = sel.wsrc ? (+sel.wamt || 0) : 50; if (v !== 'none' && amt === 0) amt = 50;
    pushUndo(); apply(v, amt);
  });
  function onAmt(v) {
    v = Math.max(-100, Math.min(100, +v || 0)); slider.value = v; num.value = v;
    if (!sel || !sel.wsrc || selStyle.value === 'none') return;
    apply(selStyle.value, v);
  }
  slider.addEventListener('pointerdown', function () { pushed = false; });
  slider.addEventListener('input', function () { if (!pushed) { pushUndo(); pushed = true; } onAmt(this.value); });
  slider.addEventListener('change', function () { pushed = false; });
  num.addEventListener('change', function () { pushUndo(); onAmt(this.value); });

  var baseRefresh = refreshLayers; refreshLayers = function () { baseRefresh.apply(this, arguments); refresh(); };
  var baseSelect = selectObj; selectObj = function (i) { baseSelect(i); refresh(); };
  window.__refreshShapeWarp = refresh;
  window.ShapeWarp = { apply: apply, buildWarped: buildWarped, STYLES: STYLES, OK: OK, outline: outline, densify: densify };
  refresh();
})();
