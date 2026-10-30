/* MaskOps (v6.2) — pure pixel-mask algorithms for the Magic Wand. No DOM.
   mask: Uint8Array(w*h), 1 = selected.  Pixel data: RGBA Uint8ClampedArray (canvas ImageData). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MaskOps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Magic-wand region. Reference colour = average of the (2*sample+1)^2 window around the click (sample 0 = point sample).
     A pixel matches when EVERY channel (R,G,B,A) is within `tol` (0..255) of the reference. Two fully transparent pixels always match.
     contiguous: 4-connected flood from the click; otherwise every matching pixel in the image. */
  function floodMask(d, w, h, sx, sy, tol, contiguous, sample) {
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (!(sx >= 0 && sy >= 0 && sx < w && sy < h)) return null;
    var r = Math.max(0, sample | 0), ref = [0, 0, 0, 0], cnt = 0, x, y, k;
    for (y = Math.max(0, sy - r); y <= Math.min(h - 1, sy + r); y++) for (x = Math.max(0, sx - r); x <= Math.min(w - 1, sx + r); x++) { k = (y * w + x) * 4; ref[0] += d[k]; ref[1] += d[k + 1]; ref[2] += d[k + 2]; ref[3] += d[k + 3]; cnt++; }
    ref = ref.map(function (v) { return v / cnt; });
    tol = Math.max(0, Math.min(255, +tol || 0));
    var mask = new Uint8Array(w * h);
    function ok(i) {
      var p = i * 4;
      if (d[p + 3] === 0 && ref[3] < 1) return true;
      return Math.abs(d[p] - ref[0]) <= tol && Math.abs(d[p + 1] - ref[1]) <= tol && Math.abs(d[p + 2] - ref[2]) <= tol && Math.abs(d[p + 3] - ref[3]) <= tol;
    }
    var seed = sy * w + sx, i;
    if (!contiguous) { for (i = 0; i < w * h; i++) mask[i] = ok(i) ? 1 : 0; mask[seed] = 1; return mask; }
    var stack = new Int32Array(w * h), sp = 0; mask[seed] = 1; stack[sp++] = seed;
    while (sp) {
      i = stack[--sp]; x = i % w; y = (i - x) / w;
      if (x > 0 && !mask[i - 1] && ok(i - 1)) { mask[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && !mask[i + 1] && ok(i + 1)) { mask[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && !mask[i - w] && ok(i - w)) { mask[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && !mask[i + w] && ok(i + w)) { mask[i + w] = 1; stack[sp++] = i + w; }
    }
    return mask;
  }

  /* "Select subject": for cut-out style images (sticker / clip-art on a plain or transparent background).
     Background colour = the most common colour along the image border; the background is every pixel connected to the border
     that is within `tol` of it. The subject is everything else (so interior pieces of the same colour stay part of the subject). */
  function subjectMask(d, w, h, tol) {
    var votes = {}, best = null, bestN = 0, i, x, y, k;
    function key(p) { return d[p + 3] < 16 ? 'T' : (d[p] >> 4) + ',' + (d[p + 1] >> 4) + ',' + (d[p + 2] >> 4); }
    function border(fn) { for (x = 0; x < w; x++) { fn(x, 0); if (h > 1) fn(x, h - 1); } for (y = 1; y < h - 1; y++) { fn(0, y); if (w > 1) fn(w - 1, y); } }
    border(function (bx, by) { k = key((by * w + bx) * 4); votes[k] = (votes[k] || 0) + 1; if (votes[k] > bestN) { bestN = votes[k]; best = k; } });
    var ref = [0, 0, 0, 0], cnt = 0;
    border(function (bx, by) { var p = (by * w + bx) * 4; if (key(p) === best) { ref[0] += d[p]; ref[1] += d[p + 1]; ref[2] += d[p + 2]; ref[3] += d[p + 3]; cnt++; } });
    ref = ref.map(function (v) { return v / (cnt || 1); }); tol = Math.max(0, Math.min(255, +tol || 0));
    function ok(i) { var p = i * 4; if (d[p + 3] === 0 && ref[3] < 1) return true; return Math.abs(d[p] - ref[0]) <= tol && Math.abs(d[p + 1] - ref[1]) <= tol && Math.abs(d[p + 2] - ref[2]) <= tol && Math.abs(d[p + 3] - ref[3]) <= tol; }
    var bg = new Uint8Array(w * h), stack = new Int32Array(w * h), sp = 0;
    border(function (bx, by) { var j = by * w + bx; if (!bg[j] && ok(j)) { bg[j] = 1; stack[sp++] = j; } });
    while (sp) {
      i = stack[--sp]; x = i % w; y = (i - x) / w;
      if (x > 0 && !bg[i - 1] && ok(i - 1)) { bg[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && !bg[i + 1] && ok(i + 1)) { bg[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && !bg[i - w] && ok(i - w)) { bg[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && !bg[i + w] && ok(i + w)) { bg[i + w] = 1; stack[sp++] = i + w; }
    }
    return invert(bg);
  }

  /* mode: 'new' | 'add' | 'sub' | 'int' */
  function combine(oldM, newM, mode) {
    if (!oldM || mode === 'new' || !mode) return newM;
    var out = new Uint8Array(newM.length), i;
    for (i = 0; i < out.length; i++) out[i] = mode === 'add' ? (oldM[i] | newM[i]) : mode === 'sub' ? (oldM[i] & (newM[i] ? 0 : 1)) : (oldM[i] & newM[i]);
    return out;
  }
  /* grow a mask by n pixels (4-neighbour); used so a painted region fully covers the anti-aliased edge of what it replaces */
  function dilate(m, w, h, n) {
    var cur = m, i, x, y;
    for (var k = 0; k < (n || 1); k++) {
      var out = new Uint8Array(cur);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { i = y * w + x; if (cur[i]) continue; if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) out[i] = 1; }
      cur = out;
    }
    return cur;
  }
  function invert(m) { var o = new Uint8Array(m.length); for (var i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o; }
  function count(m) { var c = 0; for (var i = 0; i < m.length; i++) c += m[i]; return c; }

  /* Trace the boundary of the selected pixels into closed loops [[x,y],...] in pixel-corner coordinates (0..w, 0..h).
     Outer boundaries and holes wind in opposite directions, so a nonzero fill leaves holes empty.
     Pixels that only touch diagonally are joined into one loop at the shared corner. Returns null if the mask has too many edges. */
  function maskToLoops(mask, w, h, maxEdges) {
    maxEdges = maxEdges || 3000000;
    var W = w + 1, nv = W * (h + 1), out = new Uint8Array(nv * 2), x, y, i, edges = 0;
    function add(v, dir) { var s = out[v * 2] ? 1 : 0; out[v * 2 + s] = dir + 1; edges++; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!mask[i]) continue;
      if (y === 0 || !mask[i - w]) add(y * W + x, 0);               /* top:    ->  */
      if (x === w - 1 || !mask[i + 1]) add(y * W + x + 1, 1);       /* right:  v   */
      if (y === h - 1 || !mask[i + w]) add((y + 1) * W + x + 1, 2); /* bottom: <-  */
      if (x === 0 || !mask[i - 1]) add((y + 1) * W + x, 3);         /* left:   ^   */
      if (edges > maxEdges) return null;
    }
    function step(v, dir) { return dir === 0 ? v + 1 : dir === 1 ? v + W : dir === 2 ? v - 1 : v - W; }
    function take(v, dir) { for (var s = 0; s < 2; s++) if (out[v * 2 + s] === dir + 1) { out[v * 2 + s] = 0; return true; } return false; }
    var loops = [], v0, s0, dir, v, pts, nd;
    for (v0 = 0; v0 < nv; v0++) for (s0 = 0; s0 < 2; s0++) {
      if (!out[v0 * 2 + s0]) continue;
      dir = out[v0 * 2 + s0] - 1; out[v0 * 2 + s0] = 0; pts = []; v = v0;
      for (;;) {
        pts.push(v % W, (v - v % W) / W);
        v = step(v, dir);
        if (v === v0 && !(out[v * 2] || out[v * 2 + 1])) break;
        nd = -1;                                        /* prefer a left turn, then right, then straight */
        var c = [(dir + 3) % 4, (dir + 1) % 4, dir];
        for (var q = 0; q < 3; q++) if (take(v, c[q])) { nd = c[q]; break; }
        if (nd < 0) break;
        dir = nd;
      }
      /* drop collinear points */
      var P = [], n = pts.length / 2, k;
      for (k = 0; k < n; k++) {
        var ax = pts[((k + n - 1) % n) * 2], ay = pts[((k + n - 1) % n) * 2 + 1], bx = pts[k * 2], by = pts[k * 2 + 1], cx = pts[((k + 1) % n) * 2], cy = pts[((k + 1) % n) * 2 + 1];
        if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) P.push([bx, by]);
      }
      if (P.length >= 3) loops.push(P);
    }
    return loops;
  }

  function area(P) { var a = 0; for (var i = 0, n = P.length; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

  /* Douglas-Peucker on a closed loop. */
  function simplifyClosed(P, eps) {
    var n = P.length; if (n <= 4 || !(eps > 0)) return P.slice();
    var far = 0, fd = -1, i;
    for (i = 1; i < n; i++) { var dd = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (dd > fd) { fd = dd; far = i; } }
    function run(pts) {
      var keep = new Uint8Array(pts.length), st = [[0, pts.length - 1]]; keep[0] = keep[pts.length - 1] = 1;
      while (st.length) {
        var s = st.pop(), a = pts[s[0]], b = pts[s[1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), mx = -1, mi = -1;
        for (var j = s[0] + 1; j < s[1]; j++) {
          var d = L ? Math.abs(dy * (pts[j][0] - a[0]) - dx * (pts[j][1] - a[1])) / L : Math.hypot(pts[j][0] - a[0], pts[j][1] - a[1]);
          if (d > mx) { mx = d; mi = j; }
        }
        if (mx > eps) { keep[mi] = 1; st.push([s[0], mi], [mi, s[1]]); }
      }
      return pts.filter(function (_, j) { return keep[j]; });
    }
    var A = run(P.slice(0, far + 1)), B = run(P.slice(far).concat([P[0]]));
    return A.slice(0, -1).concat(B.slice(0, -1));
  }

  /* One Chaikin corner-cutting pass on a closed loop (rounds pixel stair-steps). */
  function chaikin(P) {
    var out = [], n = P.length; if (n < 3) return P.slice();
    for (var i = 0; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; out.push([.75 * p[0] + .25 * q[0], .75 * p[1] + .25 * q[1]], [.25 * p[0] + .75 * q[0], .25 * p[1] + .75 * q[1]]); }
    return out;
  }

  /* mask -> simplified loops. opts: {eps, smooth, minArea} */
  function maskToPaths(mask, w, h, opts) {
    opts = opts || {}; var loops = maskToLoops(mask, w, h); if (!loops) return null;
    var minA = opts.minArea == null ? 6 : opts.minArea, res = [];
    loops.forEach(function (L) {
      if (Math.abs(area(L)) < minA) return;
      var S = simplifyClosed(L, opts.eps == null ? 0.8 : opts.eps); if (opts.smooth) S = chaikin(S);
      if (S.length >= 3) res.push(S);
    });
    return res;
  }

  return { dilate: dilate, subjectMask: subjectMask, floodMask: floodMask, combine: combine, invert: invert, count: count, maskToLoops: maskToLoops, maskToPaths: maskToPaths, simplifyClosed: simplifyClosed, chaikin: chaikin, area: area };
});
