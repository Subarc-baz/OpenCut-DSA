// v6.2 unit tests: magic-wand pixel algorithms + SVG pattern export (pure Node, no browser)
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/maskops.js'), SvgExport = require('../src/svgexport.js');

function img(w, h, fn) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] === undefined ? 255 : c[3]; } return d; }
const RED = [255, 0, 0], BLUE = [0, 0, 255], WHITE = [255, 255, 255];

test('flood: tolerance 0 selects exactly the same colour; contiguous stops at other colours', () => {
  const w = 10, h = 4, d = img(w, h, (x) => (x < 4 || x >= 7 ? RED : BLUE));
  const c = M.floodMask(d, w, h, 0, 0, 0, true, 0), n = M.floodMask(d, w, h, 0, 0, 0, false, 0);
  assert.equal(M.count(c), 4 * 4); assert.equal(M.count(n), 4 * 4 + 3 * 4);   /* non-contiguous also takes the right-hand red block */
});
test('flood: tolerance widens the match (per-channel, 0..255)', () => {
  const w = 4, h = 1, d = img(w, h, (x) => [100 + x * 10, 100, 100]);
  assert.equal(M.count(M.floodMask(d, w, h, 0, 0, 9, true, 0)), 1);
  assert.equal(M.count(M.floodMask(d, w, h, 0, 0, 10, true, 0)), 2);
  assert.equal(M.count(M.floodMask(d, w, h, 0, 0, 30, true, 0)), 4);
  assert.equal(M.count(M.floodMask(d, w, h, 0, 0, 255, true, 0)), 4);
});
test('flood: contiguity is 4-connected (diagonal pixels do not leak)', () => {
  const w = 3, h = 3, d = img(w, h, (x, y) => (x === y ? RED : BLUE));
  assert.equal(M.count(M.floodMask(d, w, h, 0, 0, 0, true, 0)), 1);
});
test('flood: transparent pixels match each other; alpha is a channel', () => {
  const d = img(4, 1, (x) => (x < 2 ? [9, 9, 9, 0] : [200, 0, 0, 255]));
  assert.equal(M.count(M.floodMask(d, 4, 1, 0, 0, 0, true, 0)), 2);
  assert.equal(M.count(M.floodMask(d, 4, 1, 3, 0, 5, true, 0)), 2);
});
test('flood: sample average, out-of-range click, seed always selected', () => {
  const d = img(3, 3, (x, y) => (x === 1 && y === 1 ? [0, 0, 0] : [255, 255, 255]));
  assert.equal(M.floodMask(d, 3, 3, -1, 0, 5, true, 0), null); assert.equal(M.floodMask(d, 3, 3, 3, 0, 5, true, 0), null);
  const m = M.floodMask(d, 3, 3, 1, 1, 0, true, 1);                /* average is mostly white; the black seed itself is still selected */
  assert.equal(m[4], 1);
});
test('combine: new/add/subtract/intersect and invert', () => {
  const a = Uint8Array.from([1, 1, 0, 0]), b = Uint8Array.from([0, 1, 1, 0]);
  assert.deepEqual([...M.combine(a, b, 'new')], [0, 1, 1, 0]); assert.deepEqual([...M.combine(a, b, 'add')], [1, 1, 1, 0]);
  assert.deepEqual([...M.combine(a, b, 'sub')], [1, 0, 0, 0]); assert.deepEqual([...M.combine(a, b, 'int')], [0, 1, 0, 0]);
  assert.deepEqual([...M.invert(a)], [0, 0, 1, 1]); assert.deepEqual([...M.combine(null, b, 'add')], [0, 1, 1, 0]);
});
test('loops: a rectangle becomes 4 corners with the right area; a ring gives an outer loop and an opposite-wound hole', () => {
  const w = 8, h = 6, m = new Uint8Array(w * h); for (let y = 1; y < 5; y++) for (let x = 2; x < 7; x++) m[y * w + x] = 1;
  const L = M.maskToLoops(m, w, h); assert.equal(L.length, 1); assert.equal(L[0].length, 4); assert.equal(Math.abs(M.area(L[0])), 20);
  m[2 * w + 4] = 0; m[3 * w + 4] = 0;                                   /* punch a 1x2 hole */
  const R = M.maskToLoops(m, w, h); assert.equal(R.length, 2);
  const areas = R.map(M.area).sort((p, q) => p - q); assert.equal(areas[0], -2); assert.equal(areas[1], 20); /* opposite signs => hole under nonzero fill */
});
test('loops: net signed area equals the selected pixel count (any shape)', () => {
  const w = 20, h = 20, m = new Uint8Array(w * h); let s = 12345; for (let i = 0; i < m.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; m[i] = (s >> 8) % 3 === 0 ? 1 : 0; }
  const L = M.maskToLoops(m, w, h); const net = L.reduce((a, p) => a + M.area(p), 0); assert.equal(Math.abs(net), M.count(m));
});
test('loops: empty mask, full mask, too-complex guard', () => {
  assert.deepEqual(M.maskToLoops(new Uint8Array(9), 3, 3), []);
  const L = M.maskToLoops(new Uint8Array(9).fill(1), 3, 3); assert.equal(L.length, 1); assert.equal(M.area(L[0]), 9);
  assert.equal(M.maskToLoops(new Uint8Array(100).fill(1), 10, 10, 5), null);
});
test('paths: simplification keeps shape within eps; smoothing keeps closed loops; specks are dropped', () => {
  const w = 40, h = 40, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 20, y - 20) < 14) m[y * w + x] = 1;
  m[0] = 1;                                                              /* a 1-pixel speck */
  const raw = M.maskToLoops(m, w, h), P = M.maskToPaths(m, w, h, { eps: 0.8, smooth: false });
  assert.ok(P.length === 1, 'speck removed'); assert.ok(P[0].length < raw.find(l => l.length > 20).length / 2, 'fewer points');
  assert.ok(Math.abs(M.area(P[0])) > Math.PI * 14 * 14 * 0.9 && Math.abs(M.area(P[0])) < Math.PI * 14 * 14 * 1.1);
  const S = M.maskToPaths(m, w, h, { eps: 0.8, smooth: true }); assert.ok(S[0].length >= P[0].length);
});
test('svg: pattern fills become <pattern> defs with embedded image; missing swatch warns and keeps plain fill', () => {
  const objs = [{ id: 1, type: 'rect', x: 10, y: 20, w: 100, h: 50, fill: '#888888', stroke: 'none', strokeW: 0, alpha: 1, pattern: { sid: 'a.png', size: 1 } },
                { id: 2, type: 'rect', x: 0, y: 0, w: 5, h: 5, fill: '#123456', stroke: 'none', strokeW: 0, alpha: 1, pattern: { sid: 'gone.png', size: 1 } },
                { id: 3, type: 'rect', x: 0, y: 0, w: 5, h: 5, fill: '#abcdef', stroke: 'none', strokeW: 0, alpha: 1 }];
  const r = SvgExport.build(objs, { patternFor: o => o.pattern.sid === 'a.png' ? { href: 'data:image/png;base64,AAAA', x: o.x, y: o.y, w: 96, h: 48 } : null });
  assert.match(r.svg, /<defs>[\s\S]*<pattern id="pat1" patternUnits="userSpaceOnUse" x="10" y="20" width="96" height="48">/);
  assert.match(r.svg, /fill="url\(#pat1\)"/); assert.match(r.svg, /fill="#123456"/); assert.match(r.svg, /fill="#abcdef"/);
  assert.equal(r.warnings.length, 1); assert.match(r.warnings[0], /gone\.png/);
  assert.ok(!/<defs>/.test(SvgExport.build([objs[2]], {}).svg));
});

test('subject: plain background removed, interior same-colour pieces stay; transparent backgrounds work; all-background image gives nothing', () => {
  const w = 20, h = 20;
  const d = img(w, h, (x, y) => { const r = Math.hypot(x - 10, y - 10); return r < 7 ? (r < 2 ? WHITE : RED) : WHITE; });   /* red disc with a white centre on white */
  const m = M.subjectMask(d, w, h, 10);
  assert.equal(m[0], 0); assert.equal(m[10 * w + 10], 1, 'white centre is enclosed so it stays in the subject'); assert.equal(m[10 * w + 5], 1);
  assert.ok(M.count(m) > 100 && M.count(m) < 200);
  const t = img(w, h, (x, y) => (Math.hypot(x - 10, y - 10) < 6 ? [10, 200, 10, 255] : [0, 0, 0, 0]));
  const mt = M.subjectMask(t, w, h, 10); assert.equal(mt[0], 0); assert.equal(mt[10 * w + 10], 1);
  assert.equal(M.count(M.subjectMask(img(5, 5, () => BLUE), 5, 5, 10)), 0);
  const L = M.maskToPaths(m, w, h, { eps: 0.5, smooth: false }); assert.equal(L.length, 1);
});
