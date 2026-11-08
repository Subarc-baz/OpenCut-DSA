/* v6.13: on-canvas handles, no new buttons.
   - A selected LINE gets two thickness handles (one each side of its middle): drag away from / toward the line to set its thickness.
   - A selected IMAGE or TEXT gets a rotation handle above its box (drag to rotate, Shift = 15 degree steps, double-click the handle = back to 0).
   - Once rotated, the corner handles of an image resize it in its own (rotated) frame; text keeps its corner font-size handle.
   Everything here works on the same object fields the rest of the app reads (o.strokeW, o.rot); undo is one step per drag. */
(function () {
  'use strict';
  var cv = document.getElementById('cvs'); if (!cv || window.__transformHandles) return;
  var GAP = 14, ROT_DIST = 28, op = null;

  function single() { return (typeof sel !== 'undefined' && sel && selIds.length === 1 && !sel.locked && !sel.hidden) ? sel : null; }
  function pt(e) { var r = cv.getBoundingClientRect(); return s2c(e.clientX - r.left, e.clientY - r.top); }
  function rad() { return Math.max(8 / zoom, 6); }

  /* ----- geometry ----- */
  function lineHandles(o) {
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy); if (L < 1e-6) return null;
    var nx = -dy / L, ny = dx / L, mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, d = (o.strokeW || 2) / 2 + GAP / zoom;
    return { nx: nx, ny: ny, mx: mx, my: my, a: [mx + nx * d, my + ny * d], b: [mx - nx * d, my - ny * d] };
  }
  function rotHandle(o) {                       /* world position of the rotation handle + the box edge point it hangs from */
    var b = baseBox(o), top = [b.x + b.w / 2, b.y - 4 / zoom], h = [b.x + b.w / 2, b.y - 4 / zoom - ROT_DIST / zoom];
    if (isRot(o)) { top = rotPt(o, top[0], top[1]); h = rotPt(o, h[0], h[1]); }
    return { top: top, h: h };
  }
  function paddedCorners(o) {                   /* 4px padded box corners in world space (rotated frame) */
    var b = baseBox(o), p = 4 / zoom, cs = [[b.x - p, b.y - p], [b.x + b.w + p, b.y - p], [b.x + b.w + p, b.y + b.h + p], [b.x - p, b.y + b.h + p]];
    return isRot(o) ? cs.map(function (q) { return rotPt(o, q[0], q[1]); }) : cs;
  }

  /* ----- overlay ----- */
  var baseDraw = draw;
  draw = function () {
    baseDraw.apply(this, arguments);
    var o = single(); if (!o || typeof tool !== 'undefined' && tool !== 'select') return;
    ctx.save(); ctx.translate(panX, panY); ctx.scale(zoom, zoom);
    ctx.strokeStyle = '#ff3fc8'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.5 / zoom;
    var hs = 6 / zoom;
    if (o.type === 'line') {
      var H = lineHandles(o);
      if (H) [H.a, H.b].forEach(function (p) { ctx.beginPath(); ctx.roundRect(p[0] - hs * .8, p[1] - hs * .8, hs * 1.6, hs * 1.6, hs * .4); ctx.fill(); ctx.stroke(); });
    } else if (canRot(o)) {
      if (isRot(o)) {
        var cs = paddedCorners(o);
        ctx.setLineDash([6 / zoom, 3 / zoom]); ctx.beginPath(); cs.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        var b = baseBox(o); [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(function (q) {
          var w = rotPt(o, q[0], q[1]); ctx.beginPath(); ctx.arc(w[0], w[1], hs / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }
      var R = rotHandle(o);
      ctx.beginPath(); ctx.moveTo(R.top[0], R.top[1]); ctx.lineTo(R.h[0], R.h[1]); ctx.stroke();
      ctx.fillStyle = '#ff3fc8'; ctx.beginPath(); ctx.arc(R.h[0], R.h[1], hs * .8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = 1.2 / zoom; ctx.beginPath(); ctx.arc(R.h[0], R.h[1], hs * .38, -Math.PI * .8, Math.PI * .55); ctx.stroke();
      if (op && op.kind === 'rot') {
        ctx.fillStyle = '#fff'; ctx.font = (12 / zoom) + 'px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(Math.round((+o.rot || 0) * 10) / 10 + '°', R.h[0] + 12 / zoom, R.h[1]);
      }
    }
    ctx.restore();
  };

  /* ----- interaction ----- */
  function begin(e, o, kind, extra) { e.stopImmediatePropagation(); e.preventDefault(); op = Object.assign({ kind: kind, o: o, snap: snapshotObjects(), moved: false }, extra || {}); }
  function commit() { if (op && !op.moved) { undoStack.push(op.snap); if (undoStack.length > 80) undoStack.shift(); redoStack = []; op.moved = true; } }

  cv.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || e.altKey || (typeof tool !== 'undefined' && tool !== 'select')) return;
    var o = single(); if (!o) return; var p = pt(e), r = rad();
    if (o.type === 'line') {
      var H = lineHandles(o); if (!H) return;
      if (Math.hypot(p.x - H.a[0], p.y - H.a[1]) <= r || Math.hypot(p.x - H.b[0], p.y - H.b[1]) <= r) begin(e, o, 'thick', { H: H });
      return;
    }
    if (!canRot(o)) return;
    var R = rotHandle(o);
    if (Math.hypot(p.x - R.h[0], p.y - R.h[1]) <= r) { begin(e, o, 'rot'); return; }
    if (isRot(o)) {                                           /* corner handles of a rotated object */
      var b = baseBox(o), cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      for (var i = 0; i < 4; i++) {
        var w = rotPt(o, cs[i][0], cs[i][1]);
        if (Math.hypot(p.x - w[0], p.y - w[1]) <= r) {
          if (o.type === 'star' || o.type === 'polygon') begin(e, o, 'imgsize', { h: i, c: Object.assign({}, o), rot: rotRad(o), uniform: true });
          else if (o.type !== 'text') begin(e, o, 'imgsize', { h: i, c: Object.assign({}, o), rot: rotRad(o) });
          else if (i === 3) { var fm = (o.font || 'bold 48px sans-serif').match(/^(.*?)(\d+(?:\.\d+)?)px(.*)$/); begin(e, o, 'txtsize', { start: p, size: fm ? parseFloat(fm[2]) : 48, pre: fm ? fm[1] : 'bold ', suf: fm ? fm[3] : ' sans-serif', tl: rotPt(o, b.x, b.y), rot: rotRad(o) }); }
          else { e.stopImmediatePropagation(); e.preventDefault(); }
          return;
        }
      }
    }
  }, true);

  window.addEventListener('mousemove', function (e) {
    if (!op) return; e.stopImmediatePropagation(); var p = pt(e), o = op.o;
    if (op.kind === 'thick') {
      var d = Math.abs((p.x - op.H.mx) * op.H.nx + (p.y - op.H.my) * op.H.ny), w = Math.max(1, Math.min(600, 2 * (d - GAP / zoom)));
      w = Math.round(w * 2) / 2; if (w === o.strokeW) return; commit(); o.strokeW = w;
    } else if (op.kind === 'rot') {
      var c = rotCenter(o), a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90; a = ((a + 180) % 360 + 360) % 360 - 180;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a * 10) / 10; if (a === 0) a = 0; if (a === (+o.rot || 0)) return; commit(); o.rot = a;
    } else if (op.kind === 'imgsize') {
      var u = [Math.cos(op.rot), Math.sin(op.rot)], v = [-Math.sin(op.rot), Math.cos(op.rot)], c0 = op.c, ctr = [c0.x + c0.w / 2, c0.y + c0.h / 2];
      var hx = (op.h % 2 === 0) ? -1 : 1, hy = (op.h < 2) ? -1 : 1;
      var A = [ctr[0] - hx * (u[0] * c0.w / 2) - hy * (v[0] * c0.h / 2), ctr[1] - hx * (u[1] * c0.w / 2) - hy * (v[1] * c0.h / 2)];
      var dx = p.x - A[0], dy = p.y - A[1], lw = hx * (dx * u[0] + dy * u[1]), lh = hy * (dx * v[0] + dy * v[1]);
      if (e.shiftKey || op.uniform) { var s = Math.max(lw / c0.w, lh / c0.h); lw = c0.w * s; lh = c0.h * s; }
      lw = Math.max(4, lw); lh = Math.max(4, lh); commit();
      var nc = [A[0] + hx * u[0] * lw / 2 + hy * v[0] * lh / 2, A[1] + hx * u[1] * lw / 2 + hy * v[1] * lh / 2];
      o.w = lw; o.h = lh; o.x = nc[0] - lw / 2; o.y = nc[1] - lh / 2;
      if (o.type === 'ellipse') { o.cx = nc[0]; o.cy = nc[1]; o.rx = lw / 2; o.ry = lh / 2; }
      else if (o.type === 'star' || o.type === 'polygon') { o.cx = nc[0]; o.cy = nc[1]; o.r = lw / 2; if (c0.ir !== undefined) o.ir = c0.ir * (lw / c0.w); }
      else if (o.type === 'rect' && c0.cornerR !== undefined) o.cornerR = c0.cornerR * Math.min(lw / c0.w, lh / c0.h);
    } else if (op.kind === 'txtsize') {
      var vv = [-Math.sin(op.rot), Math.cos(op.rot)], dl = (p.x - op.start.x) * vv[0] + (p.y - op.start.y) * vv[1];
      var ns = Math.max(12, Math.min(500, op.size + dl)); commit();
      o.font = op.pre + Math.round(ns) + 'px' + op.suf;
      var now = rotPt(o, baseBox(o).x, baseBox(o).y); o.x += op.tl[0] - now[0]; o.y += op.tl[1] - now[1];   /* keep the top-left corner where it was */
    }
    draw(); updateTransform();
    if (op.kind === 'rot' && window.__refreshTextPanel) window.__refreshTextPanel();
  }, true);
  window.addEventListener('mouseup', function (e) {
    if (!op) return; e.stopImmediatePropagation(); op = null; updateTransform(); draw();
  }, true);

  /* double-click the rotation handle: back to 0 degrees */
  cv.addEventListener('dblclick', function (e) {
    var o = single(); if (!o || !canRot(o) || !isRot(o)) return;
    var p = pt(e), R = rotHandle(o);
    if (Math.hypot(p.x - R.h[0], p.y - R.h[1]) <= rad()) { e.stopImmediatePropagation(); e.preventDefault(); pushUndo(); o.rot = 0; draw(); updateTransform(); }
  }, true);

  /* ----- numeric rotation (Transform panel, "Rot"): shapes/images/text use o.rot, a line turns about its middle ----- */
  var tfR = document.getElementById('tfR');
  function lineAngle(o) { return Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180 / Math.PI; }
  function syncRot() {
    if (!tfR) return; var o = single(), ok = !!o && (canRot(o) || o.type === 'line');
    tfR.disabled = !ok; if (document.activeElement === tfR) return;
    tfR.value = !ok ? '' : (o.type === 'line' ? Math.round(lineAngle(o) * 10) / 10 : Math.round((+o.rot || 0) * 10) / 10);
  }
  if (tfR) tfR.addEventListener('change', function () {
    var o = single(); if (!o) return; var v = parseFloat(tfR.value); if (!isFinite(v)) { syncRot(); return; }
    pushUndo();
    if (o.type === 'line') {
      var d = (v - lineAngle(o)) * Math.PI / 180, mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, c = Math.cos(d), s = Math.sin(d);
      [['x1', 'y1'], ['x2', 'y2']].forEach(function (k) { var dx = o[k[0]] - mx, dy = o[k[1]] - my; o[k[0]] = mx + dx * c - dy * s; o[k[1]] = my + dx * s + dy * c; });
      o.x = Math.min(o.x1, o.x2); o.y = Math.min(o.y1, o.y2); o.w = Math.abs(o.x2 - o.x1); o.h = Math.abs(o.y2 - o.y1);
    } else if (canRot(o)) { v = ((v + 180) % 360 + 360) % 360 - 180; o.rot = v; }
    draw(); updateTransform();
  });
  var baseUT = updateTransform; updateTransform = function () { baseUT.apply(this, arguments); syncRot(); };
  syncRot();

  window.__transformHandles = { lineHandles: lineHandles, rotHandle: rotHandle };
})();
