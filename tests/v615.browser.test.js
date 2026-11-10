// v6.15 browser tests: maroon theme, Pen tool (corner + smooth points, closing, open paths), node editing, hit-testing of open paths.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx;
  await p.evaluate(() => { gridOn = false; }); return p;
}
const S = async p => { const t = await p.evaluate(() => ({ z: zoom, x: panX, y: panY })), b = await p.locator('#cvs').boundingBox(); return (x, y) => [b.x + x * t.z + t.x, b.y + y * t.z + t.y]; };
const click = async (p, pt) => { await p.mouse.move(...pt); await p.mouse.down(); await p.mouse.up(); };

test('theme is maroon: no magenta left in the chrome, new shapes start maroon, selected tool is maroon with a light icon', async () => {
  const p = await open();
  assert.equal((await p.inputValue('#optFill')).toLowerCase(), '#9c2342');
  const hue = c => { const m = c.match(/\d+/g).map(Number); return m; };
  const bad = await p.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach(el => { if (el.closest('#swatches') || el.closest('#cvs') || el.closest('#matList')) return; const cs = getComputedStyle(el); ['color', 'backgroundColor', 'borderTopColor', 'backgroundImage'].forEach(k => out.push([el.id || el.className || el.tagName, k, cs[k]])); }); return out; });
  const magenta = bad.filter(b => /rgba?\(255, (6\d|7\d|8\d|13\d|14\d), (19\d|20\d|2[23]\d)/.test(b[2]));
  assert.deepEqual(magenta, [], 'old magenta colours: ' + JSON.stringify(magenta.slice(0, 4)));
  await p.keyboard.press('r'); await p.waitForTimeout(500);
  const on = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.tbtn.on')); return { bg: cs.backgroundImage, fg: cs.color }; });
  assert.ok(/179, 48, 79/.test(on.bg) && /138, 28, 56/.test(on.bg), 'maroon gradient: ' + on.bg); assert.deepEqual(hue(on.fg).slice(0, 3), [255, 255, 255], 'white icon on maroon');
  const logo = await p.evaluate(() => decodeURIComponent(LOGO_URI)); assert.ok(/c23a5c/i.test(logo) && !/ff3fc8/i.test(logo));
  assert.ok(await p.evaluate(() => getComputedStyle(document.querySelector('.hbtn.cut')).color) === 'rgb(255, 255, 255)');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Pen tool: corner points make a polygon, click on the first point closes it, result is a normal editable path', async () => {
  const p = await open(); await p.keyboard.press('n'); assert.equal(await p.evaluate(() => tool), 'pen'); const s = await S(p);
  for (const q of [[200, 200], [400, 200], [400, 350], [200, 350]]) await click(p, s(...q));
  await click(p, s(200, 200));                                   /* back on the first point = close */
  const o = await p.evaluate(() => JSON.parse(JSON.stringify(objects[0])));
  assert.equal(objects_len(await p.evaluate(() => objects.length)), 1); assert.equal(o.type, 'path'); assert.equal(o.open, undefined); assert.equal(o.pen[0].c, true); assert.equal(o.pen[0].n.length, 4);
  assert.ok(Math.abs(o.x - 200) < 4 && Math.abs(o.w - 200) < 4 && Math.abs(o.h - 150) < 8, JSON.stringify([o.x, o.y, o.w, o.h])); assert.equal(o.fill, '#9c2342');
  assert.equal(await p.evaluate(() => tool), 'select'); assert.equal(await p.evaluate(() => hitTest(300, 280)), 0);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
const objects_len = n => n;

test('Pen tool: click-drag makes smooth curve points (bezier handles), open path via Enter has no fill and can be clicked on its line', async () => {
  const p = await open(); await p.keyboard.press('n'); const s = await S(p);
  await p.mouse.move(...s(200, 400)); await p.mouse.down(); await p.mouse.move(...s(260, 340), { steps: 4 }); await p.mouse.up();   /* first point with an outgoing handle */
  await click(p, s(450, 400)); await p.keyboard.press('Enter');
  const o = await p.evaluate(() => JSON.parse(JSON.stringify(objects[0])));
  assert.equal(o.open, true); assert.equal(o.fill, 'none'); assert.equal(o.pen[0].c, false); assert.equal(o.pen[0].n.length, 2); assert.equal(o.pen[0].n[0].sm, true);
  assert.ok(o.contours[0].length > 10, 'curve is flattened: ' + o.contours[0].length); assert.ok(o.h > 20, 'the curve bulges up: ' + o.h);
  const pt = await p.evaluate(() => { const c = objects[0].contours[0][Math.floor(objects[0].contours[0].length / 2)]; return [objects[0].x + c[0], objects[0].y + c[1]]; });
  assert.equal(await p.evaluate(q => hitTest(q[0], q[1]), pt), 0, 'click on the curve selects it'); assert.equal(await p.evaluate(() => hitTest(325, 300)), -1, 'empty space inside its bounding box is not a hit');
  /* undo removes it, redo brings it back */
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects.length), 0); await p.evaluate(() => redo()); assert.equal(await p.evaluate(() => objects.length), 1);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('node editing: double-click a rectangle -> points; drag a corner, add a point, Alt+click smooth/corner, Delete removes, Esc leaves; undo steps work', async () => {
  const p = await open(); await p.evaluate(() => { objects.push({ id: nextId++, type: 'rect', x: 200, y: 200, w: 200, h: 100, fill: '#9c2342', stroke: '#fff', strokeW: 2, alpha: 1, name: 'R', cornerR: 0 }); refreshLayers(); draw(); });
  const s = await S(p); await p.mouse.dblclick(...s(300, 250));
  assert.equal(await p.evaluate(() => !!window.__nodeEdit), true); assert.equal(await p.evaluate(() => objects[0].pen[0].n.length), 4); assert.equal(await p.evaluate(() => objects[0].type), 'path');
  /* drag the top-right corner (400,200) to (450,160) */
  await p.mouse.move(...s(400, 200)); await p.mouse.down(); await p.mouse.move(...s(450, 160), { steps: 5 }); await p.mouse.up();
  let g = await p.evaluate(() => { const o = objects[0]; return { x: o.x, y: o.y, w: o.w, h: o.h, n: o.pen[0].n.map(q => [Math.round(o.x + q.x), Math.round(o.y + q.y)]) }; });
  assert.deepEqual(g.n[1], [450, 160]); assert.ok(Math.abs(g.w - 250) < 1 && Math.abs(g.h - 140) < 1, JSON.stringify(g));
  /* double-click the middle of the bottom edge adds a point there */
  await p.mouse.dblclick(...s(300, 300)); assert.equal(await p.evaluate(() => objects[0].pen[0].n.length), 5);
  /* Alt+click that new point makes it smooth (it gets handles) and again makes it a corner */
  await p.keyboard.down('Alt'); await p.mouse.click(...s(300, 300)); await p.keyboard.up('Alt');
  assert.equal(await p.evaluate(() => { const q = objects[0].pen[0].n[3]; return q.sm && (q.ox !== q.x || q.oy !== q.y); }), true);
  /* Delete removes the selected point */
  await p.keyboard.press('Delete'); assert.equal(await p.evaluate(() => objects[0].pen[0].n.length), 4);
  /* Esc leaves node mode, the object stays and is selected */
  await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => !!window.__nodeEdit), false); assert.equal(await p.evaluate(() => objects.length), 1);
  /* undo walks back through the edits to the real rectangle */
  for (let i = 0; i < 6; i++) await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[0].type), 'rect');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('node editing: circle becomes 4 smooth points that still draw a circle; a rotated shape keeps its look (rotation baked); Combine still works on pen paths', async () => {
  const p = await open(); await p.evaluate(() => { objects.push({ id: nextId++, type: 'ellipse', cx: 300, cy: 300, rx: 100, ry: 100, x: 200, y: 200, w: 200, h: 200, fill: '#9c2342', stroke: '#fff', strokeW: 2, alpha: 1, name: 'E' });
    objects.push({ id: nextId++, type: 'rect', x: 600, y: 200, w: 200, h: 100, rot: 90, fill: '#9c2342', stroke: '#fff', strokeW: 2, alpha: 1, name: 'R', cornerR: 0 }); refreshLayers(); draw(); });
  const s = await S(p); await p.mouse.dblclick(...s(300, 300));
  const c = await p.evaluate(() => { const o = objects[0]; const pts = o.contours[0].map(q => [o.x + q[0] - 300, o.y + q[1] - 300]); return { n: o.pen[0].n.length, err: Math.max(...pts.map(q => Math.abs(Math.hypot(...q) - 100))) }; });
  assert.equal(c.n, 4); assert.ok(c.err < 0.6, 'bezier circle is round to ' + c.err + ' px'); await p.keyboard.press('Escape');
  const before = await p.evaluate(() => objBounds(objects[1])); await p.evaluate(() => selectObj(1)); await p.mouse.dblclick(...s(700, 250));
  const after = await p.evaluate(() => { const o = objects[1]; return { b: { x: o.x, y: o.y, w: o.w, h: o.h }, rot: o.rot }; });
  assert.ok(Math.abs(after.b.x - before.x) < 1 && Math.abs(after.b.y - before.y) < 1 && Math.abs(after.b.w - before.w) < 1 && Math.abs(after.b.h - before.h) < 1, JSON.stringify([before, after])); assert.equal(after.rot, undefined);
  await p.keyboard.press('Escape');
  const w = await p.evaluate(async () => { selectMany([objects[0].id, objects[1].id]); return BoolOps.weld(); }); assert.ok(w === 1 || w === 0);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('Arrange: align to each other and distribute evenly (groups move as one), with undo; panel only with 2+ selected', async () => {
  const p = await open(); await p.evaluate(() => { objects.length = 0; nextId = 1; const b = { fill: '#9c2342', stroke: '#fff', strokeW: 2, alpha: 1, cornerR: 0 };
    [[100, 100, 50, 40], [300, 200, 80, 60], [260, 400, 30, 30], [700, 50, 100, 100]].forEach((r, i) => objects.push(Object.assign({ id: nextId++, type: 'rect', x: r[0], y: r[1], w: r[2], h: r[3], name: 'R' + i }, b))); refreshLayers(); draw(); selectObj(0); });
  assert.equal(await p.locator('#arrangePanel').isVisible(), false);
  const r = await p.evaluate(() => { selectMany(objects.slice(0, 3).map(o => o.id)); Arrange.align('left'); const L = objects.slice(0, 3).map(o => o.x); Arrange.align('middle'); const M = objects.slice(0, 3).map(o => o.y + o.h / 2); return { L, M }; });
  assert.ok(r.L.every(v => v === 100), 'left edges: ' + r.L); assert.ok(r.M.every(v => Math.abs(v - r.M[0]) < 1e-6), 'middles: ' + r.M); assert.equal(await p.locator('#arrangePanel').isVisible(), true);
  await p.evaluate(() => undo()); await p.evaluate(() => undo()); assert.deepEqual(await p.evaluate(() => objects.slice(0, 3).map(o => [o.x, o.y])), [[100, 100], [300, 200], [260, 400]]);
  const d = await p.evaluate(() => { selectMany(objects.map(o => o.id)); Arrange.distribute('h'); const u = objects.slice().sort((a, b) => a.x - b.x); return [u[1].x - (u[0].x + u[0].w), u[2].x - (u[1].x + u[1].w), u[3].x - (u[2].x + u[2].w)]; });
  assert.ok(Math.abs(d[0] - d[1]) < 1e-6 && Math.abs(d[1] - d[2]) < 1e-6, 'equal gaps: ' + d);
  /* a group is one unit */
  const g = await p.evaluate(() => { undo(); objects[0].gid = 7; objects[1].gid = 7; selectMany(objects.map(o => o.id)); const before = [objects[1].x - objects[0].x, objects[1].y - objects[0].y]; Arrange.align('top'); return { before, after: [objects[1].x - objects[0].x, objects[1].y - objects[0].y] }; });
  assert.deepEqual(g.before, g.after, 'group keeps its internal layout');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
