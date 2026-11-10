/* v6.15: Pen tool (N) and node editing.
   Draw: click = corner point, click-drag = smooth point with handles, click the first point = close, Enter / double-click = finish open, Backspace = undo last point, Esc = finish.
   Edit:  double-click a rectangle / circle / star / polygon / line / path with the Select tool to edit its points. Drag points and handles,
          Alt+click a point = smooth / corner, double-click the outline = add a point, Delete = remove the selected point, Esc or click away = done.
   Storage: a pen shape is an ordinary `path` object (contours = the flattened outline, so draw / export / print / wand / machine / Combine / Warp all work)
   plus o.pen = [{c: closed, n: [{x, y, ix, iy, ox, oy, sm}]}] in the same frame as the contours. Open pen paths use o.open. */
(function () {
  'use strict';
  var cv = document.getElementById('cvs'); if (!cv || window.PenTool) return;
  var HIT = 7, KAPPA = 0.5522847498;
  var draft = null, ne = null, drag = null;

  /* ---------- geometry ---------- */
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function isStraight(a, b) { return a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y; }
  function segPoints(a, b, withFirst) {              /* flattened segment a -> b (world coords) */
    var pts = withFirst ? [[a.x, a.y]] : [];
    if (isStraight(a, b)) { pts.push([b.x, b.y]); return pts; }
    var len = Math.hypot(a.ox - a.x, a.oy - a.y) + Math.hypot(b.ix - a.ox, b.iy - a.oy) + Math.hypot(b.x - b.ix, b.y - b.iy);
    var N = Math.max(10, Math.min(48, Math.ceil(len / 5)));
    for (var i = 1; i <= N; i++) {
      var t = i / N, u = 1 - t, x = u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x, y = u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y;
      pts.push([x, y]);
    }
    return pts;
  }
  function flatten(sub) {
    var n = sub.n, out = [], last = sub.c ? n.length : n.length - 1;
    if (!n.length) return out; out.push([n[0].x, n[0].y]);
    for (var i = 0; i < last; i++) { var b = n[(i + 1) % n.length]; var seg = segPoints(n[i], b, false); if (sub.c && i === last - 1) seg.pop(); out = out.concat(seg); }
    return out;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function worldSubs(o) {                            /* o.pen in world pixels (before rotation) */
    var fx = o.w / (o.bw || 1), fy = o.h / (o.bh || 1);
    return o.pen.map(function (s) { return { c: s.c, n: s.n.map(function (p) { return { x: o.x + p.x * fx, y: o.y + p.y * fy, ix: o.x + p.ix * fx, iy: o.y + p.iy * fy, ox: o.x + p.ox * fx, oy: o.y + p.oy * fy, sm: !!p.sm }; }) }; });
  }
  /* write world-coordinate subpaths back into the object (new frame = bounds of the outline) */
  function rebuild(o, subs) {
    var polys = subs.map(flatten), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polys.forEach(function (pl) { pl.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
    if (!isFinite(x0)) return false;
    var w = x1 - x0, h = y1 - y0;
    o.type = 'path'; o.x = x0; o.y = y0; o.w = w; o.h = h; o.bw = w; o.bh = h;
    o.contours = polys.map(function (pl) { return pl.map(function (p) { return [p[0] - x0, p[1] - y0]; }); });
    o.pen = subs.map(function (s) { return { c: !!s.c, n: s.n.map(function (p) { return { x: p.x - x0, y: p.y - y0, ix: p.ix - x0, iy: p.iy - y0, ox: p.ox - x0, oy: p.oy - y0, sm: !!p.sm }; }) }; });
    if (subs.every(function (s) { return !s.c; })) o.open = true; else delete o.open;
    return true;
  }
  function corner(x, y) { return { x: x, y: y, ix: x, iy: y, ox: x, oy: y, sm: false }; }
  function smoothNode(x, y, hx, hy) { return { x: x, y: y, ix: 2 * x - hx, iy: 2 * y - hy, ox: hx, oy: hy, sm: true }; }

  /* ---------- turn an existing shape into editable points (rotation is baked in) ---------- */
  function shapeSubs(o) {
    var subs = [], i, r, a, x, y;
    if (o.type === 'rect') {
      r = Math.max(0, Math.min(o.cornerR || 0, o.w / 2, o.h / 2)); var X = o.x, Y = o.y, W = o.w, H = o.h;
      if (r < 0.5) subs.push({ c: true, n: [corner(X, Y), corner(X + W, Y), corner(X + W, Y + H), corner(X, Y + H)] });
      else {
        var k = r * (1 - KAPPA), n = [];
        function nd(x, y, ix, iy, ox, oy) { return { x: x, y: y, ix: ix, iy: iy, ox: ox, oy: oy, sm: false }; }
        n.push(nd(X + r, Y, X + r, Y, X + r, Y), nd(X + W - r, Y, X + W - r, Y, X + W - k, Y), nd(X + W, Y + r, X + W, Y + k, X + W, Y + r), nd(X + W, Y + H - r, X + W, Y + H - r, X + W, Y + H - k),
          nd(X + W - r, Y + H, X + W - k, Y + H, X + W - r, Y + H), nd(X + r, Y + H, X + r, Y + H, X + k, Y + H), nd(X, Y + H - r, X, Y + H - k, X, Y + H - r), nd(X, Y + r, X, Y + r, X, Y + k));
        subs.push({ c: true, n: n });
      }
    } else if (o.type === 'ellipse') {
      var cx = o.cx, cy = o.cy, rx = o.rx, ry = o.ry, kx = rx * KAPPA, ky = ry * KAPPA;
      subs.push({ c: true, n: [
        { x: cx, y: cy - ry, ix: cx - kx, iy: cy - ry, ox: cx + kx, oy: cy - ry, sm: true }, { x: cx + rx, y: cy, ix: cx + rx, iy: cy - ky, ox: cx + rx, oy: cy + ky, sm: true },
        { x: cx, y: cy + ry, ix: cx + kx, iy: cy + ry, ox: cx - kx, oy: cy + ry, sm: true }, { x: cx - rx, y: cy, ix: cx - rx, iy: cy + ky, ox: cx - rx, oy: cy - ky, sm: true }] });
    } else if (o.type === 'polygon' || o.type === 'star') {
      var pts = [], cnt = o.type === 'star' ? o.n * 2 : o.n;
      for (i = 0; i < cnt; i++) { r = o.type === 'star' ? (i % 2 === 0 ? o.r : o.ir) : o.r; a = (o.type === 'star' ? Math.PI / o.n : 2 * Math.PI / o.n) * i - Math.PI / 2; pts.push(corner(o.cx + r * Math.cos(a), o.cy + r * Math.sin(a))); }
      subs.push({ c: true, n: pts });
    } else if (o.type === 'line') subs.push({ c: false, n: [corner(o.x1, o.y1), corner(o.x2, o.y2)] });
    else if (o.type === 'path') {
      if (o.pen) return worldSubs(o).map(function (s) { return s; });
      var fx = o.w / (o.bw || 1), fy = o.h / (o.bh || 1);
      (o.contours || []).forEach(function (ct) { if (ct.length > 1) subs.push({ c: !o.open, n: ct.map(function (p) { return corner(o.x + p[0] * fx, o.y + p[1] * fy); }) }); });
    }
    if (isRot(o) && o.type !== 'line') {            /* bake the rotation */
      var ccx = o.x + o.w / 2, ccy = o.y + o.h / 2, ang = rotRad(o), cs = Math.cos(ang), sn = Math.sin(ang);
      var rp = function (px, py) { var dx = px - ccx, dy = py - ccy; return [ccx + dx * cs - dy * sn, ccy + dx * sn + dy * cs]; };
      subs.forEach(function (s) { s.n.forEach(function (p) { var q = rp(p.x, p.y), qi = rp(p.ix, p.iy), qo = rp(p.ox, p.oy); p.x = q[0]; p.y = q[1]; p.ix = qi[0]; p.iy = qi[1]; p.ox = qo[0]; p.oy = qo[1]; }); });
    }
    return subs;
  }
  var KEEP = ['id', 'gid', 'name', 'fill', 'stroke', 'strokeW', 'alpha', 'hidden', 'pattern', 'locked'];
  function convertInPlace(o, subs) {
    var keep = {}; KEEP.forEach(function (k) { if (o[k] !== undefined) keep[k] = o[k]; });
    var wasLine = o.type === 'line'; Object.keys(o).forEach(function (k) { delete o[k]; }); Object.assign(o, keep);
    if (wasLine && (!o.fill || o.fill === 'none')) o.fill = 'none';
    return rebuild(o, subs);
  }

  /* ---------- pen drawing ---------- */
  function snapPt(pt) { return { x: (typeof snap === 'function' ? snap(pt.x) : pt.x), y: (typeof snap === 'function' ? snap(pt.y) : pt.y) }; }
  function cursorPt(e) { var r = cv.getBoundingClientRect(); return snapPt(s2c(e.clientX - r.left, e.clientY - r.top)); }
  function finishDraft(close) {
    if (!draft) return; var d = draft; draft = null;
    var n = d.sub.n; if (n.length > 1 && !close) { var a = n[n.length - 1], b = n[n.length - 2]; if (Math.hypot(a.x - b.x, a.y - b.y) < 1.5) n.pop(); }
    if (n.length < 2) { draw(); return; }
    d.sub.c = !!close; if (close && n.length < 3) d.sub.c = false;
    var o = { id: nextId++, type: 'path', name: d.sub.c ? 'Pen shape' : 'Pen path', fill: d.sub.c ? getFill() : 'none', stroke: getStroke(), strokeW: getStrokeW(), alpha: +(document.getElementById('optAlpha') || { value: 1 }).value };
    if (!rebuild(o, [d.sub])) { draw(); return; }
    pushUndo(); objects.push(o); selectObj(objects.length - 1); refreshLayers(); setTool('select'); draw();
  }
  window.__toolHandlers = window.__toolHandlers || {};
  window.__toolHandlers.pen = function (pt, e) {
    var p = snapPt(pt);
    if (!draft) draft = { sub: { c: false, n: [] }, cur: p };
    var n = draft.sub.n;
    if (n.length >= 2 && Math.hypot(p.x - n[0].x, p.y - n[0].y) <= HIT * 1.6 / zoom) { finishDraft(true); return; }
    var node = corner(p.x, p.y); n.push(node); drag = { kind: 'pennode', node: node }; draft.cur = p; draw();
  };
  window.addEventListener('mousemove', function (e) {
    if (draft) {
      var p = cursorPt(e); draft.cur = p;
      if (drag && drag.kind === 'pennode') { var nd = drag.node; if (Math.hypot(p.x - nd.x, p.y - nd.y) > 3 / zoom) { nd.ox = p.x; nd.oy = p.y; nd.ix = 2 * nd.x - p.x; nd.iy = 2 * nd.y - p.y; nd.sm = true; } }
      draw(); if (drag) { e.stopImmediatePropagation(); }
    }
  }, true);
  window.addEventListener('mouseup', function () { if (drag && drag.kind === 'pennode') { drag = null; draw(); } }, true);
  cv.addEventListener('dblclick', function (e) { if (draft && tool === 'pen') { e.stopImmediatePropagation(); finishDraft(false); } }, true);

  /* ---------- node editing ---------- */
  function editable(o) { return !!o && !o.locked && (o.type === 'rect' || o.type === 'ellipse' || o.type === 'star' || o.type === 'polygon' || o.type === 'line' || o.type === 'path'); }
  function enter(o) {
    pushUndo();
    var subs = shapeSubs(o); if (!subs.length || !convertInPlace(o, subs)) return false;
    ne = { o: o, s: 0, i: 0, undone: false }; window.__nodeEdit = true;
    toast('Edit points: drag points and handles. Alt+click a point = smooth/corner, double-click the outline = add a point, Delete = remove a point, Esc = done');
    draw(); return true;
  }
  function leave() { if (!ne) return; ne = null; drag = null; window.__nodeEdit = false; draw(); }
  function curSubs() { return worldSubs(ne.o); }
  function setSubs(subs) { rebuild(ne.o, subs); draw(); updateTransform(); }

  function handlesFor(subs) {                         /* visible handle points: selected anchor + its neighbours */
    var out = [], s = subs[ne.s]; if (!s) return out; var n = s.n, m = n.length;
    [-1, 0, 1].forEach(function (d) { var j = ne.i + d; if (s.c) j = (j + m) % m; else if (j < 0 || j >= m) return; out.push({ s: ne.s, i: j }); });
    return out;
  }
  function hitNode(p, subs) {
    var r = HIT / zoom, k;
    var vis = handlesFor(subs);
    for (k = 0; k < vis.length; k++) {                /* handles first */
      var nd = subs[vis[k].s].n[vis[k].i];
      if (nd.ix !== nd.x || nd.iy !== nd.y) if (Math.hypot(p.x - nd.ix, p.y - nd.iy) <= r) return { kind: 'in', s: vis[k].s, i: vis[k].i };
      if (nd.ox !== nd.x || nd.oy !== nd.y) if (Math.hypot(p.x - nd.ox, p.y - nd.oy) <= r) return { kind: 'out', s: vis[k].s, i: vis[k].i };
    }
    for (var si = 0; si < subs.length; si++) for (var i = 0; i < subs[si].n.length; i++) if (Math.hypot(p.x - subs[si].n[i].x, p.y - subs[si].n[i].y) <= r) return { kind: 'anchor', s: si, i: i };
    return null;
  }
  function hitSegment(p, subs) {                      /* closest point on the outline: {s, i (segment start), t} */
    var best = null, tol = (HIT + 2) / zoom;
    subs.forEach(function (sub, si) {
      var n = sub.n, last = sub.c ? n.length : n.length - 1;
      for (var i = 0; i < last; i++) {
        var a = n[i], b = n[(i + 1) % n.length], N = 30, prev = [a.x, a.y];
        for (var k = 1; k <= N; k++) {
          var t = k / N, u = 1 - t, q = [u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y];
          var d = distToSeg(p.x, p.y, prev[0], prev[1], q[0], q[1]); if (d <= tol && (!best || d < best.d)) best = { d: d, s: si, i: i, t: (k - 0.5) / N }; prev = q;
        }
      }
    });
    return best;
  }
  function splitAt(subs, h) {
    var sub = subs[h.s], n = sub.n, a = n[h.i], b = n[(h.i + 1) % n.length], t = h.t, nn;
    if (isStraight(a, b)) { nn = corner(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
    else {
      var P0 = [a.x, a.y], P1 = [a.ox, a.oy], P2 = [b.ix, b.iy], P3 = [b.x, b.y], A = lerp(P0, P1, t), B = lerp(P1, P2, t), C = lerp(P2, P3, t), D = lerp(A, B, t), E = lerp(B, C, t), F = lerp(D, E, t);
      a.ox = A[0]; a.oy = A[1]; b.ix = C[0]; b.iy = C[1]; nn = { x: F[0], y: F[1], ix: D[0], iy: D[1], ox: E[0], oy: E[1], sm: true };
    }
    n.splice(h.i + 1, 0, nn); return h.i + 1;
  }
  function toggleSmooth(sub, i) {
    var n = sub.n, nd = n[i], m = n.length, prev = n[(i - 1 + m) % m], next = n[(i + 1) % m];
    var hasH = nd.ix !== nd.x || nd.iy !== nd.y || nd.ox !== nd.x || nd.oy !== nd.y;
    if (hasH) { nd.ix = nd.ox = nd.x; nd.iy = nd.oy = nd.y; nd.sm = false; return; }
    var p = (i > 0 || sub.c) ? prev : nd, q = (i < m - 1 || sub.c) ? next : nd, dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
    var l1 = Math.hypot(nd.x - p.x, nd.y - p.y) / 3, l2 = Math.hypot(q.x - nd.x, q.y - nd.y) / 3;
    nd.ix = nd.x - dx / L * l1; nd.iy = nd.y - dy / L * l1; nd.ox = nd.x + dx / L * l2; nd.oy = nd.y + dy / L * l2; nd.sm = true;
  }
  function removeNode() {
    var subs = curSubs(), sub = subs[ne.s]; if (!sub) return; var min = sub.c ? 3 : 2;
    if (sub.n.length <= min) { toast('A ' + (sub.c ? 'closed shape needs at least 3 points' : 'path needs at least 2 points') + ' - delete the object instead'); return; }
    pushUndo(); sub.n.splice(ne.i, 1); ne.i = Math.max(0, ne.i - 1); setSubs(subs);
  }

  cv.addEventListener('mousedown', function (e) {
    if (!ne || e.button !== 0 || e.altKey && false) return;
    if (objects.indexOf(ne.o) < 0) { leave(); return; }
    var r = cv.getBoundingClientRect(), pt = s2c(e.clientX - r.left, e.clientY - r.top), subs = curSubs(), h = hitNode(pt, subs);
    if (!h) { var sg = hitSegment(pt, subs); if (!sg && hitTest(pt.x, pt.y) !== objects.indexOf(ne.o)) { leave(); return; } e.stopImmediatePropagation(); e.preventDefault(); return; }   /* click on the shape body: stay in edit mode */
    e.stopImmediatePropagation(); e.preventDefault();
    if (h.kind === 'anchor') { ne.s = h.s; ne.i = h.i; if (e.altKey) { pushUndo(); toggleSmooth(subs[h.s], h.i); setSubs(subs); return; } }
    drag = { kind: h.kind, s: h.s, i: h.i, start: pt, base: subs, pushed: false };
    draw();
  }, true);
  window.addEventListener('mousemove', function (e) {
    if (!ne || !drag || drag.kind === 'pennode') return; e.stopImmediatePropagation();
    var r = cv.getBoundingClientRect(), pt = s2c(e.clientX - r.left, e.clientY - r.top), dx = pt.x - drag.start.x, dy = pt.y - drag.start.y;
    if (!drag.pushed) { if (Math.hypot(dx, dy) < 1 / zoom) return; pushUndo(); drag.pushed = true; }
    var subs = clone(drag.base), nd = subs[drag.s].n[drag.i], b = drag.base[drag.s].n[drag.i];
    var sn = function (v) { return typeof snap === 'function' && e.ctrlKey ? snap(v) : v; };
    if (drag.kind === 'anchor') { nd.x = sn(b.x + dx); nd.y = sn(b.y + dy); var mx = nd.x - b.x, my = nd.y - b.y; nd.ix = b.ix + mx; nd.iy = b.iy + my; nd.ox = b.ox + mx; nd.oy = b.oy + my; }
    else {
      var which = drag.kind, hx = (which === 'out' ? b.ox : b.ix) + dx, hy = (which === 'out' ? b.oy : b.iy) + dy;
      if (which === 'out') { nd.ox = hx; nd.oy = hy; } else { nd.ix = hx; nd.iy = hy; }
      if (e.altKey) nd.sm = false;
      else if (nd.sm) {                                   /* smooth point: the other handle stays in line, keeping its own length */
        var ox = which === 'out' ? b.ix : b.ox, oy = which === 'out' ? b.iy : b.oy, len = Math.hypot(ox - b.x, oy - b.y), vx = b.x - hx, vy = b.y - hy, vl = Math.hypot(vx, vy) || 1;
        if (which === 'out') { nd.ix = b.x + vx / vl * len; nd.iy = b.y + vy / vl * len; } else { nd.ox = b.x + vx / vl * len; nd.oy = b.y + vy / vl * len; }
      }
    }
    setSubs(subs);
  }, true);
  window.addEventListener('mouseup', function () { if (ne && drag && drag.kind !== 'pennode') { drag = null; draw(); } }, true);

  cv.addEventListener('dblclick', function (e) {
    if (typeof tool === 'undefined' || tool !== 'select') return;
    var r = cv.getBoundingClientRect(), pt = s2c(e.clientX - r.left, e.clientY - r.top);
    if (ne) {                                              /* add a point on the outline */
      var subs = curSubs(), sg = hitSegment(pt, subs); e.stopImmediatePropagation(); e.preventDefault();
      if (sg && !hitNode(pt, subs)) { pushUndo(); ne.i = splitAt(subs, sg); ne.s = sg.s; setSubs(subs); }
      return;
    }
    var i = hitTest(pt.x, pt.y); if (i < 0) return; var o = objects[i];
    if (!editable(o) || selIds.length > 1) return;
    e.stopImmediatePropagation(); e.preventDefault(); selectObj(i); enter(o);
  }, true);

  window.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.stopImmediatePropagation(); setTool('pen'); return; }
    if (draft) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); finishDraft(false); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.stopImmediatePropagation(); e.preventDefault(); draft.sub.n.pop(); if (!draft.sub.n.length) draft = null; draw(); }
    } else if (ne) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.stopImmediatePropagation(); e.preventDefault(); leave(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.stopImmediatePropagation(); e.preventDefault(); removeNode(); }
    }
  }, true);
  var baseSetTool = setTool; setTool = function (t) { if (draft && t !== 'pen') finishDraft(false); if (ne) leave(); baseSetTool.apply(this, arguments); };

  /* ---------- overlay ---------- */
  var baseDraw = draw;
  draw = function () {
    baseDraw.apply(this, arguments);
    if (ne && (objects.indexOf(ne.o) < 0 || sel !== ne.o)) { ne = null; drag = null; window.__nodeEdit = false; baseDraw(); }
    if (!draft && !ne) return;
    ctx.save(); ctx.translate(panX, panY); ctx.scale(zoom, zoom);
    var acc = '#d9506f', hs = 4.5 / zoom, lw = 1.5 / zoom;
    function sq(x, y, filled) { ctx.fillStyle = filled ? acc : '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = lw; ctx.beginPath(); ctx.rect(x - hs, y - hs, hs * 2, hs * 2); ctx.fill(); ctx.stroke(); }
    function dot(x, y) { ctx.fillStyle = '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, hs * .75, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (draft) {
      var sub = draft.sub, n = sub.n, pl = flatten(sub);
      ctx.strokeStyle = acc; ctx.lineWidth = 2 / zoom; ctx.beginPath(); pl.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      if (n.length) { var l = n[n.length - 1], c = draft.cur; var rb = segPoints(l, { x: c.x, y: c.y, ix: c.x, iy: c.y, ox: c.x, oy: c.y }, false); ctx.setLineDash([5 / zoom, 4 / zoom]); rb.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); }
      ctx.stroke(); ctx.setLineDash([]);
      n.forEach(function (nd, i) {
        if (nd.sm) { ctx.strokeStyle = acc; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(nd.ix, nd.iy); ctx.lineTo(nd.ox, nd.oy); ctx.stroke(); dot(nd.ix, nd.iy); dot(nd.ox, nd.oy); }
        sq(nd.x, nd.y, i === 0 && n.length > 2 && Math.hypot(draft.cur.x - nd.x, draft.cur.y - nd.y) <= HIT * 1.6 / zoom);
      });
    }
    if (ne) {
      var subs = curSubs();
      ctx.strokeStyle = acc; ctx.lineWidth = lw;
      subs.forEach(function (s) { var f = flatten(s); ctx.beginPath(); f.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); if (s.c) ctx.closePath(); ctx.stroke(); });
      handlesFor(subs).forEach(function (v) {
        var nd = subs[v.s].n[v.i]; ctx.strokeStyle = acc; ctx.lineWidth = lw;
        if (nd.ix !== nd.x || nd.iy !== nd.y) { ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(nd.ix, nd.iy); ctx.stroke(); dot(nd.ix, nd.iy); }
        if (nd.ox !== nd.x || nd.oy !== nd.y) { ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(nd.ox, nd.oy); ctx.stroke(); dot(nd.ox, nd.oy); }
      });
      subs.forEach(function (s, si) { s.n.forEach(function (nd, i) { sq(nd.x, nd.y, si === ne.s && i === ne.i); }); });
    }
    ctx.restore();
  };

  window.PenTool = { shapeSubs: shapeSubs, rebuild: rebuild, flatten: flatten, enter: enter, leave: leave, finishDraft: finishDraft, state: function () { return { draft: draft, ne: ne }; }, worldSubs: worldSubs };
})();
