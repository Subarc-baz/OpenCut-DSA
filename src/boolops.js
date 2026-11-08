/* v6.14: Combine tools - Weld (union), Subtract, Intersect, Slice, Offset path, Line to outline.
   Geometry is done by Clipper (vendored src/vendor/clipper.js, Boost licence) on integer coordinates (pixel x 100).
   Every result is an ordinary `path` object, so drawing, export, print, wand and the machine layer need no changes.
   Rotated shapes are baked into their outline first; text is converted through the font outlines; images are skipped. */
(function () {
  'use strict';
  if (typeof ClipperLib === 'undefined' || window.BoolOps) return;
  var rp = document.getElementById('rpanel'); if (!rp) return;
  var K = 100, CL = ClipperLib;

  function toC(pts) { return pts.map(function (p) { return { X: Math.round(p[0] * K), Y: Math.round(p[1] * K) }; }); }
  function fromC(path) { return path.map(function (p) { return [p.X / K, p.Y / K]; }); }
  function rotPoints(o, pts) {
    if (!isRot(o) || o.type === 'text') return pts;
    var cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = rotRad(o), c = Math.cos(a), s = Math.sin(a);
    return pts.map(function (q) { var dx = q[0] - cx, dy = q[1] - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; });
  }
  /* -> Promise of [{pts, closed}] in world pixels, or null when the object cannot be combined */
  function polysOf(o) {
    if (!o || o.type === 'image') return Promise.resolve(null);
    if (o.type === 'text') {
      if (!window.FontLib) return Promise.resolve(null);
      return FontLib.outlineText(o).then(function (r) { return r.contours.map(function (c) { return { pts: c.points || c, closed: true }; }); }, function () { return null; });
    }
    var lines = ShapeWarp.outline(o), seg = Math.max(1, Math.max(o.w || 0, o.h || 0) / 64);
    return Promise.resolve(lines.map(function (c) { var d = ShapeWarp.densify(c, seg); return { pts: rotPoints(o, d.pts), closed: d.closed }; }));
  }
  function closedPaths(polys) { return polys.filter(function (p) { return p.closed && p.pts.length > 2; }).map(function (p) { return toC(p.pts); }); }
  function area(path) { return Math.abs(CL.Clipper.Area(path)) / (K * K); }

  function exec(type, subj, clip) {
    var c = new CL.Clipper(); c.AddPaths(subj, CL.PolyType.ptSubject, true); c.AddPaths(clip, CL.PolyType.ptClip, true);
    var sol = new CL.Paths(); c.Execute(type, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero); return sol;
  }
  function clean(sol) { return sol.filter(function (p) { return p.length > 2 && area(p) > 0.25; }); }

  function selectedShapes() {
    return selIds.map(function (id) { return objects.find(function (o) { return o.id === id; }); }).filter(Boolean).sort(function (a, b) { return objects.indexOf(a) - objects.indexOf(b); });
  }
  function styleFrom(b, name) {
    var o = { name: name + (b.name ? ': ' + String(b.name).slice(0, 12) : ''), fill: b.fill || '#ff3fc8', stroke: b.stroke || '#ffffff', strokeW: b.strokeW == null ? 2 : b.strokeW, alpha: b.alpha == null ? 1 : b.alpha };
    if (b.pattern) o.pattern = b.pattern; return o;
  }
  function makePath(sol, style) {
    var g = TextPaths.makePathGeometry(sol.map(function (p) { return { points: fromC(p), closed: true }; })); if (!g) return null;
    var o = Object.assign({ id: nextId++, type: 'path' }, style, g); return o;
  }
  /* replace `olds` by `news` (inserted where the lowest old object was) and select the new ones */
  function replace(olds, news) {
    pushUndo(); var at = Math.min.apply(null, olds.map(function (o) { return objects.indexOf(o); }));
    olds.forEach(function (o) { objects.splice(objects.indexOf(o), 1); });
    at = Math.min(at, objects.length); objects.splice.apply(objects, [at, 0].concat(news));
    if (typeof normalizeGroups === 'function') normalizeGroups();
    selectMany(news.map(function (o) { return o.id; })); draw();
  }
  function gather(list) {
    return Promise.all(list.map(polysOf)).then(function (all) {
      var bad = list.filter(function (o, i) { return !all[i]; });
      return { all: all, bad: bad };
    });
  }
  function need(n, what) { var l = selectedShapes(); if (l.length < n) { toast('Select ' + (n === 2 ? 'at least two shapes' : 'a shape') + ' for ' + what); return null; } return l; }
  function skipNote(bad) { return bad.length ? ' (' + bad.length + ' image' + (bad.length > 1 ? 's' : '') + ' skipped)' : ''; }

  /* generic pairwise run: result = base op obj1 op obj2 ... */
  function run(kind, label) {
    var list = need(2, label); if (!list) return Promise.resolve(0);
    return gather(list).then(function (g) {
      var items = list.map(function (o, i) { return { o: o, p: g.all[i] }; }).filter(function (x) { return x.p && closedPaths(x.p).length; });
      if (items.length < 2) { toast('Need at least two closed shapes (images and open lines cannot be combined)'); return 0; }
      var op = kind === 'weld' ? CL.ClipType.ctUnion : kind === 'subtract' ? CL.ClipType.ctDifference : CL.ClipType.ctIntersection;
      var res = closedPaths(items[0].p);
      for (var i = 1; i < items.length; i++) res = clean(exec(op, res, closedPaths(items[i].p)));
      if (!res.length) { toast(label + ': nothing is left (the shapes do not ' + (kind === 'intersect' ? 'overlap' : 'leave anything') + ')'); return 0; }
      var po = makePath(res, styleFrom(items[0].o, label)); if (!po) return 0;
      replace(items.map(function (x) { return x.o; }), [po]);
      toast(label + ' done' + skipNote(g.bad)); return 1;
    });
  }
  function slice() {
    var list = need(2, 'Slice'); if (!list) return Promise.resolve(0);
    if (list.length !== 2) { toast('Slice works on exactly two shapes (the lower one is cut by the upper one)'); return Promise.resolve(0); }
    return gather(list).then(function (g) {
      if (g.bad.length || !g.all.every(function (p) { return closedPaths(p).length; })) { toast('Slice needs two closed shapes'); return 0; }
      var A = closedPaths(g.all[0]), B = closedPaths(g.all[1]), pieces = [
        [clean(exec(CL.ClipType.ctDifference, A, B)), list[0], 'Slice A'], [clean(exec(CL.ClipType.ctIntersection, A, B)), list[0], 'Slice overlap'], [clean(exec(CL.ClipType.ctDifference, B, A)), list[1], 'Slice B']];
      var news = pieces.filter(function (p) { return p[0].length; }).map(function (p) { return makePath(p[0], styleFrom(p[1], p[2])); }).filter(Boolean);
      if (news.length < 2) { toast('Slice: the shapes do not overlap, nothing to slice'); return 0; }
      var gid = nextGid(); news.forEach(function (n) { n.gid = gid; });
      replace(list, news); toast('Sliced into ' + news.length + ' pieces (kept together as a group)'); return news.length;
    });
  }
  function offset(inches) {
    var d = parseFloat(inches) * DPI; if (!isFinite(d) || d === 0) { toast('Enter an offset distance in inches (negative shrinks)'); return Promise.resolve(0); }
    var list = need(1, 'Offset'); if (!list) return Promise.resolve(0);
    return gather(list).then(function (g) {
      var news = [], olds = [];
      list.forEach(function (o, i) {
        var P = g.all[i]; if (!P) return; var cp = closedPaths(P); if (!cp.length) return;
        var co = new CL.ClipperOffset(2, 0.25 * K); co.AddPaths(cp, CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
        var sol = new CL.Paths(); co.Execute(sol, d * K); sol = clean(sol); olds.push(o);
        var po = sol.length ? makePath(sol, Object.assign(styleFrom(o, 'Offset'), { name: (o.name || o.type) + ' offset' })) : null; if (po) { po.__src = o; news.push(po); }
      });
      if (!news.length) { toast('Offset removed the shape (distance too large for its size), or there was no closed shape to offset'); return 0; }
      pushUndo(); var ids = [];
      news.forEach(function (po) { var src = po.__src; delete po.__src; if (src.gid) po.gid = src.gid; objects.splice(objects.indexOf(src) + 1, 0, po); ids.push(po.id); });   /* the original stays, the offset copy goes on top */
      selectMany(ids); draw(); toast('Offset ' + (d > 0 ? 'out' : 'in') + ' by ' + Math.abs(parseFloat(inches)) + ' in' + skipNote(g.bad)); return news.length;
    });
  }
  function outlineLines() {
    var list = selectedShapes().filter(function (o) { return o.type === 'line' || (o.type === 'path' && o.open); });
    if (!list.length) { toast('Select a line to turn into an outline'); return Promise.resolve(0); }
    var olds = [], news = [];
    list.forEach(function (o) {
      var pls = ShapeWarp.outline(o).filter(function (c) { return !c.closed; }); if (!pls.length) return;
      var w = Math.max(0.5, o.strokeW || 2), co = new CL.ClipperOffset(2, 0.25 * K);
      pls.forEach(function (c) { co.AddPath(toC(c.pts), CL.JoinType.jtMiter, CL.EndType.etOpenButt); });
      var sol = new CL.Paths(); co.Execute(sol, w / 2 * K); sol = clean(sol); if (!sol.length) return;
      var po = makePath(sol, { name: (o.name || 'Line') + ' outline', fill: o.stroke && o.stroke !== 'none' ? o.stroke : '#ffffff', stroke: 'none', strokeW: 0, alpha: o.alpha == null ? 1 : o.alpha });
      if (po) { if (o.gid) po.gid = o.gid; olds.push(o); news.push(po); }
    });
    if (!news.length) { toast('Nothing to outline'); return Promise.resolve(0); }
    pushUndo(); news.forEach(function (po, i) { objects[objects.indexOf(olds[i])] = po; });
    selectMany(news.map(function (o) { return o.id; })); draw(); toast('Line turned into a filled outline (the thickness is now real geometry)'); return Promise.resolve(news.length);
  }

  /* ---------- panel ---------- */
  var panel = document.createElement('section');
  panel.id = 'combinePanel'; panel.className = 'spanel'; panel.style.display = 'none';
  panel.innerHTML =
    '<div class="spanel-head" style="cursor:default"><span>Combine</span><span style="font-size:10px;opacity:.7">SELECTED SHAPES</span></div>' +
    '<div class="spanel-body">' +
    '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px">' +
    '<button class="mbtn" id="cbWeld" style="flex:1;padding:5px;font-size:10px;min-width:60px" title="Weld: merge the selected shapes into one outline (the lowest shape sets the colours)">Weld</button>' +
    '<button class="mbtn" id="cbSub" style="flex:1;padding:5px;font-size:10px;min-width:60px" title="Subtract: cut the shapes above away from the lowest selected shape">Subtract</button>' +
    '<button class="mbtn" id="cbInt" style="flex:1;padding:5px;font-size:10px;min-width:60px" title="Intersect: keep only the area all selected shapes share">Intersect</button>' +
    '<button class="mbtn" id="cbSlice" style="flex:1;padding:5px;font-size:10px;min-width:60px" title="Slice: split two overlapping shapes into their separate pieces">Slice</button></div>' +
    '<div class="opt-row"><label for="cbOffV">Offset (in)</label><input id="cbOffV" type="number" class="ninput" step="0.01" value="0.05" style="width:64px" title="Positive grows the outline, negative shrinks it">' +
    '<button class="mbtn" id="cbOff" style="flex:1;padding:5px;font-size:10px" title="Make an offset copy of the selected shapes on top of them">Offset</button></div>' +
    '<div style="display:flex;gap:3px;margin-top:4px"><button class="mbtn" id="cbLine" style="flex:1;padding:5px;font-size:10px" title="Turn a thick line into a real filled outline">Line → Outline</button></div>' +
    '<div style="font-size:10px;line-height:1.5;color:var(--dim);margin-top:5px">Results are normal shapes: undo brings the originals back. Images are skipped.</div></div>';
  var lay = document.getElementById('layerList'); lay = lay && lay.closest('.spanel');
  if (lay && lay.parentNode) lay.parentNode.insertBefore(panel, lay); else rp.appendChild(panel);
  var $ = function (id) { return panel.querySelector('#' + id); };
  $('cbWeld').onclick = function () { run('weld', 'Weld'); }; $('cbSub').onclick = function () { run('subtract', 'Subtract'); };
  $('cbInt').onclick = function () { run('intersect', 'Intersect'); }; $('cbSlice').onclick = slice;
  $('cbOff').onclick = function () { offset($('cbOffV').value); }; $('cbLine').onclick = outlineLines;
  function refresh() {
    var l = selIds.map(function (id) { return objects.find(function (o) { return o.id === id; }); }).filter(function (o) { return o && o.type !== 'image'; });
    panel.style.display = l.length ? 'block' : 'none'; if (!l.length) return;
    var multi = l.length >= 2, hasLine = l.some(function (o) { return o.type === 'line' || (o.type === 'path' && o.open); });
    ['cbWeld', 'cbSub', 'cbInt'].forEach(function (id) { $(id).disabled = !multi; }); $('cbSlice').disabled = l.length !== 2;
    $('cbLine').style.display = hasLine ? '' : 'none';
  }
  var baseRefresh = refreshLayers; refreshLayers = function () { baseRefresh.apply(this, arguments); refresh(); };
  window.BoolOps = { weld: function () { return run('weld', 'Weld'); }, subtract: function () { return run('subtract', 'Subtract'); }, intersect: function () { return run('intersect', 'Intersect'); }, slice: slice, offset: offset, outlineLines: outlineLines, polysOf: polysOf };
  refresh();
})();
