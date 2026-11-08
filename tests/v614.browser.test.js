// v6.14 browser tests: rotation of every shape, numeric Rot field, Combine tools (Weld / Subtract / Intersect / Slice / Offset / Line to outline).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
const shapes = () => { objects.length = 0; nextId = 1; gridOn = false;
  const base = { fill: '#ff3fc8', stroke: '#ffffff', strokeW: 2, alpha: 1 };
  objects.push(Object.assign({ id: nextId++, type: 'rect', x: 100, y: 100, w: 200, h: 100, name: 'R', cornerR: 0 }, base));
  objects.push(Object.assign({ id: nextId++, type: 'ellipse', cx: 400, cy: 150, rx: 100, ry: 50, x: 300, y: 100, w: 200, h: 100, name: 'E' }, base));
  objects.push(Object.assign({ id: nextId++, type: 'star', cx: 650, cy: 150, r: 70, ir: 30, n: 5, x: 580, y: 80, w: 140, h: 140, name: 'S' }, base));
  objects.push(Object.assign({ id: nextId++, type: 'polygon', cx: 850, cy: 150, r: 60, n: 6, x: 790, y: 90, w: 120, h: 120, name: 'P' }, base));
  objects.push(Object.assign({ id: nextId++, type: 'line', x1: 100, y1: 400, x2: 400, y2: 400, x: 100, y: 400, w: 300, h: 0, fill: 'none', stroke: '#ffffff', strokeW: 10, alpha: 1, name: 'L' }));
  refreshLayers(); draw(); };
const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const pathArea = o => Math.abs(o.contours.reduce((s, c) => s + area(c), 0)) * (o.w / o.bw) * (o.h / o.bh);

test('rotation: every shape type takes a rotation (canvas pixels, bounds, SVG transform, cut paths), line via the Rot field', async () => {
  const p = await open(); await p.evaluate(shapes);
  const r = await p.evaluate(() => {
    const out = {}; objects.slice(0, 4).forEach(o => { o.rot = 90; }); draw();
    /* rect 200x100 at (100,100) rotated 90 about (200,150): now 100 wide, 200 tall: covers x 150..250, y 50..250 */
    out.rb = objBounds(objects[0]); out.hit = [hitTest(200, 70), hitTest(120, 150)];
    const g = (wx, wy) => Array.from(cvs.getContext('2d').getImageData(Math.round(wx * zoom + panX), Math.round(wy * zoom + panY), 1, 1).data);
    out.in = g(200, 70); out.outside = g(120, 150);
    out.svg = SvgExport.build(objects.slice(0, 4), { matW, matH, units: 'in' }); out.svg = typeof out.svg === 'string' ? out.svg : out.svg.svg;
    return out;
  });
  assert.ok(Math.abs(r.rb.w - 100) < 0.01 && Math.abs(r.rb.h - 200) < 0.01); assert.deepEqual(r.hit, [0, -1]);
  assert.ok(r.in[0] > 200 && r.in[1] < 120, 'magenta inside the rotated rect: ' + r.in); assert.notDeepEqual(r.outside.slice(0, 3), r.in.slice(0, 3));
  assert.equal((r.svg.match(/transform="rotate\(90 /g) || []).length, 4, 'each shape carries the rotate transform');
  /* the cut job rotates the rect outline too: its first path spans 100 wide x 200 tall (mm) */
  const jb = await p.evaluate(() => { const job = CricutMachine.prepareJob(objects.slice(0, 1), { matWidthPx: matW, matHeightPx: matH }); const pts = job.paths[0].points, xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
  assert.ok(Math.abs(jb[0] - 100 / 96 * 25.4) < 0.2 && Math.abs(jb[1] - 200 / 96 * 25.4) < 0.2, JSON.stringify(jb));
  /* Rot field: select the rect, type 45 */
  await p.evaluate(() => { objects[0].rot = 0; selectObj(0); }); await p.fill('#tfR', '45'); await p.dispatchEvent('#tfR', 'change'); assert.equal(await p.evaluate(() => objects[0].rot), 45);
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[0].rot || 0), 0);
  /* a line: Rot field turns it about its middle (angle of the line) */
  await p.evaluate(() => { document.activeElement.blur(); selectObj(4); }); assert.equal(await p.inputValue('#tfR'), '0'); await p.fill('#tfR', '90'); await p.dispatchEvent('#tfR', 'change');
  const ln = await p.evaluate(() => { const o = objects[4]; return [o.x1, o.y1, o.x2, o.y2].map(v => Math.round(v)); }); assert.equal(ln[0], ln[2]); assert.equal(Math.abs(ln[1] - ln[3]), 300); assert.equal((ln[0]), 250);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('rotation handle works on rect/ellipse/star/polygon; corner resize of a rotated rect happens in its own frame', async () => {
  const p = await open(); await p.evaluate(shapes);
  const t = await p.evaluate(() => ({ z: zoom, x: panX, y: panY })), bb = await p.locator('#cvs').boundingBox(), s = (x, y) => [bb.x + x * t.z + t.x, bb.y + y * t.z + t.y];
  for (let i = 0; i < 4; i++) {
    await p.evaluate(i => selectObj(i), i); const h = await p.evaluate(() => __transformHandles.rotHandle(sel).h), c = await p.evaluate(() => rotCenter(sel));
    await p.mouse.move(...s(...h)); await p.mouse.down(); await p.keyboard.down('Shift'); await p.mouse.move(...s(c.x + 150, c.y), { steps: 5 }); await p.keyboard.up('Shift'); await p.mouse.up();
    assert.equal(await p.evaluate(i => objects[i].rot, i), 90, 'shape ' + i);
  }
  await p.evaluate(() => { objects[0].rot = 30; selectObj(0); draw(); });
  const before = await p.evaluate(() => ({ w: objects[0].w, h: objects[0].h, tl: rotPt(objects[0], objects[0].x, objects[0].y), br: rotPt(objects[0], objects[0].x + objects[0].w, objects[0].y + objects[0].h) }));
  const u = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  await p.mouse.move(...s(...before.br)); await p.mouse.down(); await p.mouse.move(...s(before.br[0] + u[0] * 50, before.br[1] + u[1] * 50), { steps: 5 }); await p.mouse.up();
  const after = await p.evaluate(() => ({ w: objects[0].w, h: objects[0].h, tl: rotPt(objects[0], objects[0].x, objects[0].y) }));
  assert.ok(Math.abs(after.w - before.w - 50) < 3 && Math.abs(after.h - before.h) < 3, JSON.stringify(after)); assert.ok(Math.hypot(after.tl[0] - before.tl[0], after.tl[1] - before.tl[1]) < 1.5);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Combine: Weld / Subtract / Intersect / Slice give the right areas and undo restores the originals', async () => {
  const p = await open(); await p.evaluate(shapes);
  /* rect (100..300 x 100..200) and ellipse overlap x 300..? -> make them overlap clearly */
  await p.evaluate(() => { const o = objects[1]; o.cx = 280; o.x = 180; selectMany([objects[0].id, objects[1].id]); });
  const ra = 200 * 100, ea = Math.PI * 100 * 50;
  const inter = await p.evaluate(async () => { const n = await BoolOps.intersect(); return { n, o: JSON.parse(JSON.stringify(objects.filter(q => q.type === 'path'))) }; });
  assert.equal(inter.n, 1); const ia = pathArea(inter.o[0]); assert.ok(ia > 1000 && ia < ra, 'intersection area ' + ia);
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects.filter(q => q.type === 'path').length), 0); assert.equal(await p.evaluate(() => objects.length), 5);
  await p.evaluate(() => selectMany([objects[0].id, objects[1].id]));
  const weld = await p.evaluate(async () => { await BoolOps.weld(); return JSON.parse(JSON.stringify(objects.find(q => q.type === 'path'))); });
  assert.ok(Math.abs(pathArea(weld) - (ra + ea - ia)) / (ra + ea) < 0.02, 'weld area ' + pathArea(weld) + ' expected ' + (ra + ea - ia)); assert.equal(weld.fill, '#ff3fc8');
  await p.evaluate(() => undo()); await p.evaluate(() => selectMany([objects[0].id, objects[1].id]));
  const sub = await p.evaluate(async () => { await BoolOps.subtract(); return JSON.parse(JSON.stringify(objects.find(q => q.type === 'path'))); });
  assert.ok(Math.abs(pathArea(sub) - (ra - ia)) / ra < 0.02, 'subtract area ' + pathArea(sub));
  await p.evaluate(() => undo()); await p.evaluate(() => selectMany([objects[0].id, objects[1].id]));
  const sl = await p.evaluate(async () => { const n = await BoolOps.slice(); return { n, g: objects.filter(q => q.type === 'path').map(q => q.gid) }; });
  assert.equal(sl.n, 3); assert.ok(sl.g.every(g => g && g === sl.g[0]));
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Combine: rotated shapes weld in their rotated position; disjoint shapes report nothing instead of breaking', async () => {
  const p = await open(); await p.evaluate(shapes);
  const r = await p.evaluate(async () => { objects[0].rot = 90; selectMany([objects[0].id, objects[1].id]); await BoolOps.weld(); const o = objects.find(q => q.type === 'path'); return { x: o.x, y: o.y, w: o.w, h: o.h }; });
  /* rotated rect covers x 150..250, y 50..250; ellipse x 300..500 y 100..200 -> they do not touch: weld keeps two pieces whose bbox spans x 150..500, y 50..250 */
  assert.ok(Math.abs(r.x - 150) < 1 && Math.abs(r.y - 50) < 1 && Math.abs(r.w - 350) < 1 && Math.abs(r.h - 200) < 1, JSON.stringify(r));
  await p.evaluate(shapes); const n = await p.evaluate(async () => { selectMany([objects[0].id, objects[2].id]); return BoolOps.intersect(); }); assert.equal(n, 0); assert.equal(await p.evaluate(() => objects.length), 5, 'nothing changed');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Offset grows/shrinks a shape by the exact distance and keeps the original; too-large shrink is reported', async () => {
  const p = await open(); await p.evaluate(shapes);
  const g = await p.evaluate(async () => { selectObj(0); await BoolOps.offset(0.1); const o = objects.find(q => q.type === 'path'); return { x: o.x, y: o.y, w: o.w, h: o.h, n: objects.length }; });
  assert.ok(Math.abs(g.x - (100 - 9.6)) < 0.3 && Math.abs(g.y - (100 - 9.6)) < 0.3 && Math.abs(g.w - (200 + 19.2)) < 0.5 && Math.abs(g.h - (100 + 19.2)) < 0.5, JSON.stringify(g)); assert.equal(g.n, 6);
  await p.evaluate(() => undo()); const s = await p.evaluate(async () => { selectObj(0); await BoolOps.offset(-0.2); const o = objects.find(q => q.type === 'path'); return { w: o.w, h: o.h }; });
  assert.ok(Math.abs(s.w - (200 - 38.4)) < 0.5 && Math.abs(s.h - (100 - 38.4)) < 0.5, JSON.stringify(s));
  await p.evaluate(() => undo()); const gone = await p.evaluate(async () => { selectObj(0); const n = await BoolOps.offset(-2); return [n, objects.length]; }); assert.deepEqual(gone, [0, 5]);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Line to outline: a thick line becomes a filled rectangle of the same thickness (real geometry), colour kept, undo works', async () => {
  const p = await open(); await p.evaluate(shapes);
  const r = await p.evaluate(async () => { selectObj(4); const n = await BoolOps.outlineLines(); const o = objects[4]; return { n, t: o.type, x: o.x, y: o.y, w: o.w, h: o.h, fill: o.fill, stroke: o.stroke, open: !!o.open }; });
  assert.equal(r.n, 1); assert.equal(r.t, 'path'); assert.ok(Math.abs(r.w - 300) < 0.2 && Math.abs(r.h - 10) < 0.2 && Math.abs(r.y - 395) < 0.2, JSON.stringify(r)); assert.equal(r.fill, '#ffffff'); assert.equal(r.open, false);
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[4].type), 'line');
  assert.equal(await p.locator('#cbLine').isVisible(), false, 'button only shows with a line selected');
  await p.evaluate(() => selectObj(4)); assert.ok(await p.locator('#cbLine').isVisible()); assert.ok(await p.locator('#combinePanel').isVisible());
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
