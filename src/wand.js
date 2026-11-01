/* v6.4 Magic Wand — works like Photoshop's wand with "Sample All Layers":
   it looks at what you SEE (every visible object rendered flat, at 2x for accuracy), picks the connected pixels whose colour is within
   Tolerance of the clicked pixel, and shows them with marching ants. Text, shapes, converted text and images all behave the same way.
   Make cut path (Enter) traces the selection into an editable cut outline. Modes: New / Add / Subtract / Intersect (Shift = add, Ctrl = subtract). */
(function () {
  'use strict';
  var MO = window.MaskOps, TP = window.TextPaths;
  window.__toolHandlers = window.__toolHandlers || {};
  var opt = { tol: 32, contiguous: true, smooth: true, sample: 0, mode: 'new', single: false, objectMode: false, sameFill: false };
  var S = null, RC = null, dash = 0;

  /* ---------- flat rendering of the design (same drawing rules as PNG export) ---------- */
  function drawObjects(x, list) {
    list.forEach(function (o) {
      if (o.hidden) return; x.save(); x.globalAlpha = o.alpha || 1;
      x.fillStyle = (o.pattern && window.patFill && window.patFill(x, o)) || o.fill || 'none'; x.strokeStyle = o.stroke || '#fff'; x.lineWidth = o.strokeW || 2;
      if (o.type === 'rect') { var cr = o.cornerR || 0; if (cr > 0) { x.beginPath(); x.roundRect(o.x, o.y, o.w, o.h, cr); if (o.fill !== 'none') x.fill(); x.stroke(); } else { if (o.fill !== 'none') x.fillRect(o.x, o.y, o.w, o.h); x.strokeRect(o.x, o.y, o.w, o.h); } }
      else if (o.type === 'ellipse') { x.beginPath(); x.ellipse(o.cx, o.cy, o.rx || 1, o.ry || 1, 0, 0, Math.PI * 2); if (o.fill !== 'none') x.fill(); x.stroke(); }
      else if (o.type === 'text') drawTextObject(x, o);
      else if (o.type === 'star') { starPath(x, o.cx, o.cy, o.r, o.ir, o.n); if (o.fill !== 'none') x.fill(); x.stroke(); }
      else if (o.type === 'polygon') { polyPath(x, o.cx, o.cy, o.r, o.n); if (o.fill !== 'none') x.fill(); x.stroke(); }
      else if (o.type === 'line') { x.beginPath(); x.moveTo(o.x1, o.y1); x.lineTo(o.x2, o.y2); x.stroke(); }
      else if (o.type === 'path') drawPathObj(x, o);
      else if (o.type === 'image' && o.img && o.img.complete && o.img.naturalWidth) x.drawImage(o.img, o.x, o.y, o.w, o.h);
      x.restore();
    });
  }
  function sigAll() {
    return matW + 'x' + matH + '#' + objects.map(function (o) {
      return [o.id, o.type, o.x, o.y, o.w, o.h, o.cx, o.cy, o.r, o.ir, o.n, o.rx, o.ry, o.x1, o.y1, o.x2, o.y2, o.fill, o.stroke, o.strokeW, o.alpha, o.hidden ? 1 : 0, o.text, o.font, o.curve, o.warp, o.cornerR,
        o.pattern ? o.pattern.sid + o.pattern.size : '', o.contours ? o.contours.length : '', o.bw, o.bh, o.img && o.img.naturalWidth].join('|');
    }).join(';');
  }
  /* frame = design-space rectangle that is rendered; list = objects to draw. Returns {data,w,h,scale,ox,oy}. Throws if the canvas is tainted. */
  function render(frame, list) {
    var scale = Math.min(2, 2400 / Math.max(frame.w, frame.h)), w = Math.max(1, Math.round(frame.w * scale)), h = Math.max(1, Math.round(frame.h * scale));
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d', { willReadFrequently: true });
    x.scale(w / frame.w, h / frame.h); x.translate(-frame.ox, -frame.oy); drawObjects(x, list);
    return { data: x.getImageData(0, 0, w, h).data, w: w, h: h, scale: w / frame.w, ox: frame.ox, oy: frame.oy };
  }
  function fullFrame() { return { ox: 0, oy: 0, w: matW, h: matH }; }
  function sampleAll(onlyObj) {
    var key = sigAll() + (onlyObj ? '@' + onlyObj.id : '');
    if (RC && RC.key === key) return RC;
    RC = render(fullFrame(), onlyObj ? [onlyObj] : objects); RC.key = key; return RC;
  }

  function sameFrame(a, b) { return a && b && a.ox === b.ox && a.oy === b.oy && a.w === b.w && a.h === b.h && a.scale === b.scale; }
  function setSel(frame, mask, rk) { S = { f: frame, w: frame.w, h: frame.h, scale: frame.scale, ox: frame.ox, oy: frame.oy, mask: mask, key: sigAll(), rk: rk }; recompute(); }
  function count() { return S ? MO.count(S.mask) / (S.scale * S.scale) : 0; }   /* selected area in design px^2 */
  function clear() { if (S) { S = null; draw(); refreshOpts(); } }
  function recompute() {
    if (!S) return; if (!MO.count(S.mask)) { S = null; return; }
    S.loops = MO.maskToPaths(S.mask, S.w, S.h, { eps: 1, smooth: false, minArea: 1 });
    if (!S.loops) { toast('That selection is too complex to outline; try a higher tolerance'); S = null; }
  }
  function stale() { return S && S.key !== sigAll(); }

  /* ---------- clicks ---------- */
  function regionClick(pt, mode) {
    var only = null;
    if (opt.single) { var hi = window.hitShape(pt); if (hi >= 0) only = objects[hi]; }
    var r; try { r = sampleAll(only); } catch (e) { toast('Could not read the design (' + (e && e.name || 'error') + ')'); return; }
    var lx = (pt.x - r.ox) * r.scale, ly = (pt.y - r.oy) * r.scale;
    if (lx < 0 || ly < 0 || lx >= r.w || ly >= r.h) { toast('Click inside the mat'); return; }
    var m = MO.floodMask(r.data, r.w, r.h, lx, ly, opt.tol, opt.contiguous, opt.sample); if (!m) return;
    var prev = (S && !stale() && sameFrame(S.f, r)) ? S.mask : null;
    setSel(r, MO.combine(prev, m, mode), r.key);
    if (!S) toast('Nothing selected'); draw(); refreshOpts();
  }
  function fillKey(o) { return o.pattern ? 'p:' + o.pattern.sid : 'c:' + (o.fill || 'none'); }
  function objectClick(i, mode) {                                   /* optional: select whole objects instead of pixel regions */
    var o = objects[i], ids;
    if (opt.sameFill) { var k = fillKey(o); ids = objects.filter(function (p) { return !p.hidden && !p.locked && p.type !== 'image' && p.type !== 'line' && fillKey(p) === k; }).map(function (p) { return p.id; }); }
    else ids = (o.gid ? objects.filter(function (p) { return p.gid === o.gid; }) : [o]).map(function (p) { return p.id; });
    var cur = selIds.slice(), res;
    if (mode === 'add') res = cur.concat(ids.filter(function (x) { return cur.indexOf(x) < 0; }));
    else if (mode === 'sub') res = cur.filter(function (x) { return ids.indexOf(x) < 0; });
    else if (mode === 'int') res = cur.filter(function (x) { return ids.indexOf(x) >= 0; });
    else res = ids;
    selectMany(res); toast(res.length + ' object' + (res.length === 1 ? '' : 's') + ' selected');
  }
  window.__toolHandlers.wand = function (pt, e) {
    var mode = e.shiftKey ? 'add' : (e.ctrlKey || e.metaKey) ? 'sub' : opt.mode;
    if (opt.objectMode) {
      S = null; var i = window.hitShape(pt);
      if (i < 0) { if (mode === 'new') selectMany([]); refreshOpts(); return; }
      objectClick(i, mode); refreshOpts(); return;
    }
    regionClick(pt, mode);
  };

  /* ---------- actions ---------- */
  function makeCutPath() {
    if (!S) { toast('Click the design with the Magic Wand first'); return false; }
    if (stale()) { S = null; draw(); toast('The design changed; select again'); return false; }
    var loops = MO.maskToPaths(S.mask, S.w, S.h, { eps: 1, smooth: opt.smooth, minArea: 6 });
    if (!loops || !loops.length) { toast('Nothing to outline'); return false; }
    var contours = loops.map(function (L) { return { points: L.map(function (p) { return [S.ox + p[0] / S.scale, S.oy + p[1] / S.scale]; }), closed: true }; });
    var g = TP.makePathGeometry(contours); if (!g) return false;
    pushUndo();
    var po = { id: nextId++, type: 'path', name: 'Wand outline', fill: 'none', stroke: '#ff2d95', strokeW: 2, alpha: 1 };
    Object.assign(po, g); objects.push(po); S = null; selectMany([po.id]); refreshLayers(); draw(); refreshOpts();
    toast('Cut outline created (' + loops.length + ' contour' + (loops.length > 1 ? 's' : '') + ')'); return true;
  }
  function invertSel() { if (!S) { toast('Nothing selected'); return; } S.mask = MO.invert(S.mask); recompute(); draw(); refreshOpts(); }
  function targetObject() { return sel || null; }
  function objectFrame(o) { var b = objBounds(o); return { ox: b.x, oy: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) }; }
  function selectWhole() {                                           /* silhouette of the selected object */
    var o = targetObject(); if (!o) { toast('Select an object first (Select tool), then use Whole object'); return; }
    var r; try { r = render(objectFrame(o), [o]); } catch (e) { toast('Could not read the object'); return; }
    var m = new Uint8Array(r.w * r.h); for (var i = 0; i < m.length; i++) m[i] = r.data[i * 4 + 3] > 8 ? 1 : 0;
    setSel(r, m, 'whole'); if (!S) toast('That object is empty'); draw(); refreshOpts();
  }
  function selectSubject() {                                         /* sticker / clip-art on a plain or transparent background */
    var o = targetObject(); if (!o) { toast('Select an object first (Select tool), then use Select subject'); return; }
    var r; try { r = render(objectFrame(o), [o]); } catch (e) { toast('Could not read the object'); return; }
    setSel(r, MO.subjectMask(r.data, r.w, r.h, opt.tol), 'subject');
    if (!S) toast('No subject found (the whole picture matches its border colour)'); draw(); refreshOpts();
  }
  /* ---------- painting the selection ----------
     Default: the fill really CHANGES the objects under the selection (no overlay layer). A path object that is only partly selected
     (the "T" of a converted "TEXT") is split: the selected pieces become their own object with the new fill, the rest stays as it was.
     "Fill in new layer" (fillSelectionAsLayer) keeps the old behaviour of putting a new filled shape on top. */
  function hasSelection() { if (S && stale()) { S = null; draw(); } return !!S; }
  function pickStyle(color) {
    var t = {}; if (color) t.fill = color; else if (window.SwatchLib) window.SwatchLib.applyFill(t, window.SwatchLib.state.sid, window.SwatchLib.state.size); else t.fill = '#44ff66';
    if (t.fill === 'none') { toast('Fill is set to None. Untick None next to Fill to paint the selection.'); return null; }
    return t;
  }
  function putStyle(o, t) { if (t.pattern) o.pattern = { sid: t.pattern.sid, size: t.pattern.size }; else delete o.pattern; o.fill = t.fill; if (o.type === 'path' && o.stroke === 'none') o.stroke = 'none'; }
  function alphaOf(o, frame) { return render(frame, [Object.assign({}, o, { alpha: 1, hidden: false })]).data; }
  function paintImage(o, t, owned, idx) {
    var im = o.img; if (!im || !im.naturalWidth) return false;
    var nw = im.naturalWidth, nh = im.naturalHeight, c = document.createElement('canvas'); c.width = nw; c.height = nh; var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    var id = x.getImageData(0, 0, nw, nh), d = id.data, q = document.createElement('canvas').getContext('2d'); q.fillStyle = t.fill; q.fillRect(0, 0, 1, 1); var rgb = q.getImageData(0, 0, 1, 1).data, n = 0;
    for (var py = 0; py < nh; py++) for (var px = 0; px < nw; px++) {
      var lx = Math.floor((o.x + (px + .5) * o.w / nw - S.ox) * S.scale), ly = Math.floor((o.y + (py + .5) * o.h / nh - S.oy) * S.scale);
      if (lx < 0 || ly < 0 || lx >= S.w || ly >= S.h) continue; var k = ly * S.w + lx; if (!S.mask[k] || owned[k] !== idx) continue;
      var j = (py * nw + px) * 4; d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; n++;
    }
    if (!n) return false; x.putImageData(id, 0, 0); var src = c.toDataURL('image/png'), ni = new Image(); ni.onload = function () { draw(); }; ni.src = src; o.src = src; o.img = ni; return true;
  }
  function fillSelection(color) {
    if (!hasSelection()) return false;
    var t = pickStyle(color); if (!t) return true;
    var frame = { ox: S.ox, oy: S.oy, w: S.w / S.scale, h: S.h / S.scale }, N = S.w * S.h, owned = new Int32Array(N).fill(-1), alphas = {}, i, k;
    try {
      for (i = objects.length - 1; i >= 0; i--) {
        var o = objects[i]; if (o.hidden || o.type === 'line') continue;
        var r = render(frame, [Object.assign({}, o, { alpha: 1 })]); if (r.w !== S.w || r.h !== S.h) { toast('Could not match the selection to the design; use "Fill in new layer".'); return true; }
        var ad = r.data; alphas[i] = ad; for (k = 0; k < N; k++) if (owned[k] < 0 && ad[k * 4 + 3] > 128) owned[k] = i;
      }
    } catch (e) { toast('Could not read the design; use "Fill in new layer".'); return true; }
    var selN = {}, totN = {}, emptyN = 0, selTotal = 0, em = new Uint8Array(N);
    for (k = 0; k < N; k++) { var w = owned[k]; if (S.mask[k]) { selTotal++; if (w < 0) { em[k] = 1; emptyN++; } } if (w < 0) continue; totN[w] = (totN[w] || 0) + 1; if (S.mask[k]) selN[w] = (selN[w] || 0) + 1; }
    /* Selected pixels that no object covers are EMPTY SPACE (transparent canvas, bare mat). There is nothing there to recolour, so filling them
       creates a new shape behind the objects. Thin anti-aliased rims around a selected object are not treated as empty space. */
    var fillEmpty = emptyN >= 16 && (emptyN >= 0.15 * selTotal || !Object.keys(selN).length);
    if (!fillEmpty) Object.keys(selN).forEach(function (q) { if (selN[q] < 8) delete selN[q]; });
    var targets = Object.keys(selN).map(Number).sort(function (a, b) { return b - a; });   /* high index first so splice inserts keep lower indexes valid */
    if (fillEmpty) Object.keys(selN).forEach(function (q) { if (selN[q] < 8) targets.splice(targets.indexOf(+q), 1); });
    if (!targets.length && !fillEmpty) { toast('Nothing under the selection to fill. Use "Fill in new layer" to paint it anyway.'); return true; }
    var plan = [], refused = 0, locked = 0;
    targets.forEach(function (idx) {
      var o = objects[idx], frac = selN[idx] / totN[idx];
      if (o.locked) { locked++; return; }
      if (frac >= 0.95 || o.type === 'image') { plan.push({ idx: idx, whole: o.type !== 'image' }); return; }
      if (o.type !== 'path') { refused++; return; }
      var pieces = TP.splitPieces(o.contours); if (pieces.length < 2) { plan.push({ idx: idx, whole: true }); return; }
      var chosen = [], rest = [];
      pieces.forEach(function (pc) {
        var tmp = { type: 'path', x: o.x, y: o.y, w: o.w, h: o.h, bw: o.bw, bh: o.bh, fill: '#000', stroke: 'none', strokeW: 0, contours: pc.map(function (ci) { return o.contours[ci]; }) }, d = alphaOf(tmp, frame), a = 0, b = 0;
        for (var q = 0; q < N; q++) if (d[q * 4 + 3] > 8) { a++; if (S.mask[q]) b++; }
        (a && b / a > 0.5 ? chosen : rest).push(pc);
      });
      if (!chosen.length) { refused++; return; }
      plan.push({ idx: idx, whole: !rest.length, chosen: chosen, rest: rest });
    });
    if (!plan.length && !fillEmpty) { toast(refused ? 'That part is not a separate piece of the object. Use "Fill in new layer", or convert the text with "One object per letter".' : 'The selected object is locked.'); return true; }
    pushUndo(); var painted = 0, split = 0;
    plan.forEach(function (p) {
      var o = objects[p.idx];
      if (o.type === 'image') { if (paintImage(o, t, owned, p.idx)) painted++; return; }
      if (p.whole) { putStyle(o, t); painted++; return; }
      var abs = TP.pathObjectPolylines(o), sub = function (list) { return TP.makePathGeometry([].concat.apply([], list.map(function (pc) { return pc.map(function (ci) { return abs[ci]; }); }))); };
      var gPart = sub(p.chosen), gRest = sub(p.rest); if (!gPart || !gRest) return;
      var part = Object.assign({}, JSON.parse(JSON.stringify(o)), gPart, { id: nextId++, name: (o.name || 'Shape') + ' (part)' }); putStyle(part, t);
      Object.assign(o, gRest); objects.splice(p.idx + 1, 0, part); painted++; split++;
    });
    var emptyDone = false;
    if (fillEmpty) {
      var dm = MO.dilate(em, S.w, S.h, 1), el = MO.maskToPaths(dm, S.w, S.h, { eps: 1, smooth: false, minArea: 4 })   /* no corner rounding: edges of the canvas must stay square */, eg = el && el.length && TP.makePathGeometry(el.map(function (L) { return { points: L.map(function (p) { return [S.ox + p[0] / S.scale, S.oy + p[1] / S.scale]; }), closed: true }; }));
      if (eg) { var eo = { id: nextId++, type: 'path', name: 'Filled empty area', fill: '#888888', stroke: 'none', strokeW: 0, alpha: 1 }; Object.assign(eo, eg); putStyle(eo, t); objects.unshift(eo); emptyDone = true; }
    }
    S.key = sigAll(); refreshLayers(); draw(); refreshOpts();
    if (emptyDone) { toast(painted ? 'Filled ' + painted + ' object' + (painted === 1 ? '' : 's') + ' and the empty space (a new shape behind them)' : 'Filled the empty space with a new shape behind your objects (there was no object there to recolour)'); return true; }
    toast(split ? 'Filled the selected part as its own object (' + painted + ' changed, no overlay layer)' : 'Changed the fill of ' + painted + ' object' + (painted === 1 ? '' : 's') + (refused ? '; ' + refused + ' partly selected shape(s) skipped (use "Fill in new layer")' : ''));
    return true;
  }
  function fillSelectionAsLayer(color) {
    if (!hasSelection()) return false;
    var m = MO.dilate(S.mask, S.w, S.h, 1), loops = MO.maskToPaths(m, S.w, S.h, { eps: 1, smooth: opt.smooth, minArea: 4 });
    if (!loops || !loops.length) { toast('Nothing to fill'); return true; }
    var g = TP.makePathGeometry(loops.map(function (L) { return { points: L.map(function (p) { return [S.ox + p[0] / S.scale, S.oy + p[1] / S.scale]; }), closed: true }; })); if (!g) return true;
    var po = { id: nextId++, type: 'path', name: 'Painted region', fill: '#888888', stroke: 'none', strokeW: 0, alpha: 1 }; Object.assign(po, g);
    var t = pickStyle(color); if (!t) return true; putStyle(po, t);
    pushUndo(); objects.push(po); S.key = sigAll(); refreshLayers(); draw(); refreshOpts();
    toast('Painted the selection in a NEW layer on top (the original is untouched)'); return true;
  }
  function fillAt(pt) {
    if (!hasSelection()) return false;
    var lx = Math.floor((pt.x - S.ox) * S.scale), ly = Math.floor((pt.y - S.oy) * S.scale);
    if (lx >= 0 && ly >= 0 && lx < S.w && ly < S.h && S.mask[ly * S.w + lx]) return fillSelection();
    toast('Click inside the selection to paint it, or press Esc to deselect and fill whole shapes.'); return true;
  }

  /* ---------- Ctrl+C with a wand selection copies only the selected pixels (as a transparent picture) ---------- */
  function copyRegion() {
    if (!hasSelection()) return false;
    var frame = { ox: S.ox, oy: S.oy, w: S.w / S.scale, h: S.h / S.scale }, r;
    try { r = render(frame, objects); } catch (e) { toast('Could not read the design to copy it'); return false; }
    if (r.w !== S.w || r.h !== S.h) return false;
    var x0 = S.w, y0 = S.h, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < S.h; y++) for (x = 0; x < S.w; x++) if (S.mask[y * S.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return false;
    var cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = document.createElement('canvas'); c.width = cw; c.height = ch; var cx = c.getContext('2d'), id = cx.createImageData(cw, ch);
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) { var k = (y + y0) * S.w + (x + x0); if (!S.mask[k]) continue; var j = (y * cw + x) * 4, q = k * 4; id.data[j] = r.data[q]; id.data[j + 1] = r.data[q + 1]; id.data[j + 2] = r.data[q + 2]; id.data[j + 3] = r.data[q + 3]; }
    cx.putImageData(id, 0, 0);
    clipboard = [{ id: 0, type: 'image', src: c.toDataURL('image/png'), x: S.ox + x0 / S.scale, y: S.oy + y0 / S.scale, w: cw / S.scale, h: ch / S.scale, fill: 'none', stroke: 'none', strokeW: 0, alpha: 1, name: 'Wand selection' }];
    toast('Copied the selected region only (' + cw + ' × ' + ch + ' px, transparent outside it). Paste with Ctrl+V.'); return true;
  }
  var _copy = copySelected;
  copySelected = function () { if (S && (tool === 'wand' || !selIds.length) && copyRegion()) return; return _copy.apply(this, arguments); };
  window.WandTool = { drawObjects: drawObjects, deselect: clear, fillAsLayer: fillSelectionAsLayer, hasSelection: hasSelection, fillSelection: fillSelection, fillSelectionAsLayer: fillSelectionAsLayer, fillAt: fillAt, options: opt, state: function () { return S; }, count: count, loops: function () { return S && S.loops ? S.loops.length : 0; }, makeCutPath: makeCutPath, invert: invertSel, clear: clear, selectWhole: selectWhole, selectSubject: selectSubject };

  /* ---------- marching ants overlay ---------- */
  var baseDraw = draw;
  draw = function () {
    baseDraw.apply(this, arguments);
    if (!S || !S.loops) return;
    if (stale()) { S = null; return; }
    var inv = 1 / S.scale, lw = 1 / zoom;
    ctx.save(); ctx.translate(panX, panY); ctx.scale(zoom, zoom);
    ctx.beginPath(); S.loops.forEach(function (L) { L.forEach(function (p, i) { var X = S.ox + p[0] * inv, Y = S.oy + p[1] * inv; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); });
    ctx.fillStyle = 'rgba(68,255,102,0.16)'; ctx.fill('nonzero');
    ctx.lineWidth = lw * 1.5; ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.setLineDash([5 * lw, 5 * lw]); ctx.lineDashOffset = -dash * lw; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  };
  var KEEP = { wand: 1, bucket: 1, select: 1, hand: 1 };           /* tools that keep a wand selection alive; text and the drawing tools drop it */
  setInterval(function () { if (S && typeof tool !== 'undefined' && KEEP[tool]) { dash = (dash + 1) % 10; draw(); } }, 120);

  /* ---------- tool options ---------- */
  function refreshOpts() { if (typeof tool !== 'undefined' && tool === 'wand') buildOpts(); }
  function buildOpts() {
    var old = document.getElementById('subOpts'); if (old) old.remove();
    var cont = document.querySelector('.spanel-body'); if (!cont) return;
    var d = document.createElement('div'); d.id = 'subOpts'; d.style.cssText = 'border-top:1px solid var(--bdr);padding-top:8px;margin-top:8px;font-size:11px;color:#c8c8e0';
    function el(tag, props, kids) { var n = document.createElement(tag); Object.keys(props || {}).forEach(function (k) { if (k === 'style') n.style.cssText = props[k]; else n[k] = props[k]; }); (kids || []).forEach(function (c) { n.appendChild(c); }); return n; }
    d.appendChild(el('div', { textContent: 'wand Options', style: 'font:700 9px var(--ui);text-transform:uppercase;letter-spacing:1.5px;color:var(--portal);margin-bottom:6px' }));
    var modes = el('div', { id: 'wandModes', style: 'display:flex;gap:4px;margin-bottom:6px' });
    [['new', 'New'], ['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].forEach(function (m) {
      var b = el('button', { type: 'button', className: 'hbtn', textContent: m[1], title: m[0] === 'add' ? 'Shift+click' : m[0] === 'sub' ? 'Ctrl+click' : m[1], style: 'flex:1;padding:4px 2px;font-size:10px;' + (opt.mode === m[0] ? 'outline:1px solid var(--portal)' : '') });
      b.dataset.mode = m[0]; b.onclick = function () { opt.mode = m[0]; buildOpts(); }; modes.appendChild(b);
    }); d.appendChild(modes);
    var tr = el('input', { type: 'range', id: 'wandTol', min: 0, max: 255, value: opt.tol, style: 'flex:1' }), tv = el('span', { id: 'wandTolV', textContent: opt.tol, style: 'font:11px var(--mono);min-width:28px' });
    tr.oninput = function () { opt.tol = +tr.value; tv.textContent = tr.value; };
    d.appendChild(el('div', { className: 'opt-row' }, [el('label', { textContent: 'Tolerance' }), tr, tv]));
    function chk(id, label, key, title) { var c = el('input', { type: 'checkbox', id: id, checked: !!opt[key] }); c.onchange = function () { opt[key] = c.checked; if (key === 'objectMode') { S = null; draw(); } buildOpts(); }; return el('label', { title: title || '', style: 'display:block;margin:3px 0' }, [c, document.createTextNode(' ' + label)]); }
    d.appendChild(chk('wandContig', 'Contiguous (only touching pixels)', 'contiguous'));
    d.appendChild(chk('wandSmooth', 'Smooth edges on cut outline', 'smooth'));
    d.appendChild(chk('wandSingle', 'Only the object under the click', 'single', 'Ignore everything above or below the clicked object'));
    d.appendChild(chk('wandObjMode', 'Select whole objects instead of regions', 'objectMode'));
    if (opt.objectMode) d.appendChild(chk('wandSame', 'Select all objects with the same fill', 'sameFill'));
    var ss = el('select', { id: 'wandSample' }); [[0, 'Point sample'], [1, '3 x 3 average'], [2, '5 x 5 average']].forEach(function (s) { var o = el('option', { value: s[0], textContent: s[1] }); if (opt.sample === s[0]) o.selected = true; ss.appendChild(o); });
    ss.onchange = function () { opt.sample = +ss.value; };
    d.appendChild(el('div', { className: 'opt-row' }, [el('label', { textContent: 'Sample' }), ss]));
    var row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px' });
    function btn(id, t, fn, title) { var b = el('button', { type: 'button', id: id, className: 'hbtn', textContent: t, title: title || '', style: 'padding:5px 8px;font-size:11px' }); b.onclick = fn; row.appendChild(b); return b; }
    var mk = btn('wandMake', '✂ Make cut path', makeCutPath, 'Turn the selected region into an editable cut outline (Enter)'); mk.disabled = !S; mk.style.opacity = S ? '' : '.45';
    btn('wandInvert', 'Invert', invertSel, 'Invert the selection (select everything else)').disabled = !S;
    var fb = btn('wandFill', '\u25A7 Fill selection', function () { fillSelection(); }, 'Paint the selected region with the current Fill colour or the chosen swatch (same as clicking inside it with the Bucket)'); fb.disabled = !S; fb.style.opacity = S ? '' : '.45';
    var nb = btn('wandFillLayer', '\u29C9 Fill in new layer', function () { fillSelectionAsLayer(); }, 'Paint the selection as a NEW shape on top instead of changing the object itself'); nb.disabled = !S; nb.style.opacity = S ? '' : '.45';
    btn('wandSubject', 'Select subject', selectSubject, 'For the selected sticker/clip-art on a plain or transparent background: selects everything except the background (uses Tolerance)');
    btn('wandWhole', 'Whole object', selectWhole, 'Select the full silhouette of the selected object');
    btn('wandClear', 'Deselect', clear, 'Clear the selection (Esc, Ctrl+Shift+A)');
    d.appendChild(row);
    d.appendChild(el('div', { id: 'wandInfo', style: 'margin-top:6px;color:#9a9ab8;line-height:1.35', textContent: S ? ('Selected ' + (S.loops ? S.loops.length : 0) + ' outline' + ((S.loops && S.loops.length === 1) ? '' : 's') + ', about ' + Math.round(count() / 96 / 96 * 100) / 100 + ' sq in. Shift+click adds, Ctrl+click subtracts, Enter makes the cut path.') : 'Click any part of the design: an image, text, a shape, or one letter. It selects the touching area of similar colour (like Photoshop). Raise Tolerance to include more.' }));
    cont.appendChild(d);
  }
  /* ---------- on-canvas selection bar (always visible while the wand is active or a selection exists) ---------- */
  var bar = null, barKey = '';
  function mkBar() {
    var ws = document.querySelector('.workspace'); if (!ws || bar) return;
    bar = document.createElement('div'); bar.id = 'wandBar'; ws.appendChild(bar);
  }
  function syncBar() {
    mkBar(); if (!bar) return;
    var show = (typeof tool !== 'undefined' && tool === 'wand') || !!S, key = [show, tool, opt.mode, !!S].join();
    if (key === barKey) return; barKey = key; bar.style.display = show ? 'flex' : 'none'; if (!show) return;
    bar.textContent = '';
    function b(label, title, fn, on, dis, id) { var x = document.createElement('button'); x.type = 'button'; x.className = 'wb' + (on ? ' on' : ''); x.textContent = label; x.title = title; if (id) x.id = id; x.disabled = !!dis; x.onclick = function (ev) { ev.stopPropagation(); fn(); }; bar.appendChild(x); return x; }
    [['new', 'New', 'New selection'], ['add', '+ Add', 'Add to the selection (Shift+click)'], ['sub', '\u2212 Subtract', 'Subtract from the selection (Ctrl+click)'], ['int', 'Intersect', 'Keep only the overlap']].forEach(function (m) {
      b(m[1], m[2], function () { opt.mode = m[0]; barKey = ''; syncBar(); refreshOpts(); }, opt.mode === m[0], false, 'wb-' + m[0]);
    });
    var sp = document.createElement('span'); sp.className = 'wsep'; bar.appendChild(sp);
    b('\u2702 Cut path', 'Turn the selection into a cut outline (Enter)', makeCutPath, false, !S, 'wb-cut');
    b('\u25A7 Fill', 'Change the fill of the selected part (no new layer)', function () { fillSelection(); }, false, !S, 'wb-fill');
    b('\u29C9 New layer', 'Paint the selection as a NEW shape on top instead of changing the object', function () { fillSelectionAsLayer(); }, false, !S, 'wb-fill-layer');
    b('Deselect', 'Clear the selection (Esc, Ctrl+Shift+A)', clear, false, !S, 'wb-clear');
  }
  var _draw2 = draw; draw = function () { var r = _draw2.apply(this, arguments); syncBar(); return r; };
  if (typeof updateToolOpts === 'function') { var _u = updateToolOpts; updateToolOpts = function (t) { var r = _u.apply(this, arguments); if (t === 'wand') buildOpts(); return r; }; }

  document.addEventListener('keydown', function (e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf((e.target || {}).tagName) >= 0) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) { setTool('wand'); return; }
    if (S && e.key === 'Escape') { e.stopPropagation(); clear(); return; }
    if (S && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); e.stopPropagation(); clear(); return; }
    if (typeof tool !== 'undefined' && tool === 'wand' && S && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); makeCutPath(); }
  }, true);
  /* clicking empty canvas with the Select tool drops the wand selection (clicking a shape keeps it, so you can still move things) */
  (function () { var cv = document.getElementById('cvs'); if (!cv) return;
    cv.addEventListener('mousedown', function (e) {
      if (!S || e.button !== 0 || tool !== 'select' || e.altKey) return;
      var r = cv.getBoundingClientRect(), pt = s2c(e.clientX - r.left, e.clientY - r.top);
      if (window.hitShape(pt) < 0) clear();
    }, true); })();
  var _st = setTool; setTool = function (t) { var had = !!S; if (S && !KEEP[t]) S = null; var r = _st.apply(this, arguments); if (had && !S) draw(); syncBar(); return r; };
})();
