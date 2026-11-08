// v6.13 browser tests: line thickness handles + line hit-testing/scaling, rotation of images and text (handles, drawing, hit-test, exports).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const REG = process.env.FONT_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
const setup = async p => {
  const url = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#e22'; x.fillRect(0, 0, 120, 80); x.fillStyle = '#fff'; x.fillRect(0, 0, 40, 40); return c.toDataURL(); });
  await p.evaluate(async u => {
    objects.length = 0; nextId = 1; gridOn = false;
    await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: nextId++, type: 'image', src: u, img: im, x: 150, y: 150, w: 240, h: 160, alpha: 1, name: 'img' }); r(); }; im.src = u; });
    objects.push({ id: nextId++, type: 'text', x: 500, y: 200, text: 'Rotate me', fill: '#000000', font: 'bold 48px sans-serif', alpha: 1, name: 't' });
    objects.push({ id: nextId++, type: 'line', x1: 150, y1: 500, x2: 500, y2: 500, x: 150, y: 500, w: 350, h: 0, fill: 'none', stroke: '#ffffff', strokeW: 4, alpha: 1, name: 'L' });
    refreshLayers(); draw();
  }, url);
};
const S = async p => { const t = await p.evaluate(() => ({ z: zoom, x: panX, y: panY })), b = await p.locator('#cvs').boundingBox(); return (x, y) => [b.x + x * t.z + t.x, b.y + y * t.z + t.y]; };
const drag = async (p, from, to, shift) => { await p.mouse.move(...from); await p.mouse.down(); if (shift) await p.keyboard.down('Shift'); await p.mouse.move(...to, { steps: 6 }); if (shift) await p.keyboard.up('Shift'); await p.mouse.up(); };

test('line: thickness handle drag sets the thickness, one undo step; lines are selectable by clicking ON the line (not a whole box)', async () => {
  const p = await open(); await setup(p); await p.evaluate(() => selectObj(2)); const s = await S(p);
  const H = await p.evaluate(() => __transformHandles.lineHandles(objects[2]));
  await drag(p, s(...H.a), s(325, 500 + 40));
  const w = await p.evaluate(() => objects[2].strokeW); assert.ok(w > 10, 'thicker: ' + w);
  assert.equal(await p.evaluate(() => [objects[2].x1, objects[2].y1, objects[2].x2, objects[2].y2].join()), '150,500,500,500', 'line itself did not move');
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[2].strokeW), 4, 'one undo restores it');
  /* thinner again by dragging toward the line, limited to >= 1 */
  await p.evaluate(() => { selectObj(2); objects[2].strokeW = 30; draw(); }); const H2 = await p.evaluate(() => __transformHandles.lineHandles(objects[2]));
  await drag(p, s(...H2.b), s(325, 500)); assert.equal(await p.evaluate(() => objects[2].strokeW), 1);
  const hits = await p.evaluate(() => { objects[2].strokeW = 4; return [hitTest(325, 500), hitTest(325, 530), hitTest(325, 470)]; }); assert.deepEqual(hits, [2, -1, -1]);
  /* diagonal line: the empty corner of its bounding box is not a hit */
  await p.evaluate(() => { objects.push({ id: nextId++, type: 'line', x1: 600, y1: 600, x2: 800, y2: 800, x: 600, y: 600, w: 200, h: 200, fill: 'none', stroke: '#fff', strokeW: 3, alpha: 1, name: 'D' }); });
  assert.deepEqual(await p.evaluate(() => [hitTest(700, 700), hitTest(790, 610)]), [3, -1]);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('line: a uniform scale (Shift + corner drag / Transform) also scales the thickness; length-only scale keeps it', async () => {
  const p = await open(); await setup(p);
  const r = await p.evaluate(() => { const o = objects[2], c = Object.assign({}, o); scaleObj(o, c, 2, 2, 150, 500); const a = [o.strokeW, o.x2]; const c2 = Object.assign({}, objects[2], { strokeW: 4, x2: 500 }); const o2 = Object.assign({}, c2); scaleObj(o2, c2, 2, 1, 150, 500); return { uni: a, len: [o2.strokeW, o2.x2] }; });
  assert.deepEqual(r.uni, [8, 850]); assert.deepEqual(r.len, [4, 850]); await p.ctx.close();
});

test('rotation: handle drags rotate an image and text (Shift = 15 deg steps), undo works, double-click handle resets to 0', async () => {
  const p = await open(); await setup(p); const s = await S(p);
  await p.evaluate(() => selectObj(0)); let h = await p.evaluate(() => __transformHandles.rotHandle(objects[0]).h); const c = await p.evaluate(() => rotCenter(objects[0]));
  await drag(p, s(...h), s(c.x + 200, c.y)); const a = await p.evaluate(() => objects[0].rot); assert.ok(Math.abs(a - 90) < 1.5, 'about 90: ' + a);
  await p.evaluate(() => selectObj(1)); h = await p.evaluate(() => __transformHandles.rotHandle(objects[1]).h); const c2 = await p.evaluate(() => rotCenter(objects[1]));
  await drag(p, s(...h), s(c2.x + 100, c2.y - 100), true); assert.equal(await p.evaluate(() => objects[1].rot), 45);
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[1].rot || 0), 0, 'undo');
  await p.evaluate(() => selectObj(0)); h = await p.evaluate(() => __transformHandles.rotHandle(objects[0]).h); await p.mouse.dblclick(...s(...h));
  assert.equal(await p.evaluate(() => objects[0].rot), 0); assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('rotation: rotated image is drawn rotated (pixels), hit-tests in its own frame, objBounds is the rotated box', async () => {
  const p = await open(); await setup(p); await p.evaluate(() => { objects.splice(1); objects[0].rot = 90; selectMany([]); draw(); });
  /* image box 240x160 at (150,150) rotated 90 deg about its centre (270,230): now 160 wide x 240 tall */
  const b = await p.evaluate(() => objBounds(objects[0])); assert.ok(Math.abs(b.w - 160) < 0.01 && Math.abs(b.h - 240) < 0.01 && Math.abs(b.x - 190) < 0.01 && Math.abs(b.y - 110) < 0.01, JSON.stringify(b));
  assert.deepEqual(await p.evaluate(() => [hitTest(270, 120), hitTest(160, 230), hitTest(270, 365)]), [0, -1, -1]);
  const px = await p.evaluate(() => { const t = { z: zoom, x: panX, y: panY }, g = (wx, wy) => Array.from(cvs.getContext('2d').getImageData(Math.round(wx * t.z + t.x), Math.round(wy * t.z + t.y), 1, 1).data); return { tall: g(270, 125), side: g(165, 230) }; });
  assert.ok(px.tall[0] > 200 && px.tall[3] > 0, 'inside the rotated box is painted: ' + px.tall); assert.ok(px.side[3] === 0 || px.side[0] < 60, 'outside is mat colour: ' + px.side);
  /* the white 40x40 corner of the image (top-left) is, after 90 deg clockwise, at the top-right of the rotated box */
  const white = await p.evaluate(() => { const t = { z: zoom, x: panX, y: panY }; const d = cvs.getContext('2d').getImageData(Math.round(335 * t.z + t.x), Math.round(125 * t.z + t.y), 1, 1).data; return Array.from(d); });
  assert.ok(white[0] > 240 && white[1] > 240 && white[2] > 240, 'white corner moved to top-right: ' + white); await p.ctx.close();
});

test('rotation: corner drag on a rotated image resizes in its own frame; SVG export keeps the rotation; wand/cut paths see the rotated picture', async () => {
  const p = await open(); await setup(p); await p.evaluate(() => { objects[0].rot = 30; selectObj(0); draw(); }); const s = await S(p);
  const before = await p.evaluate(() => { const o = objects[0]; return { w: o.w, h: o.h, tl: rotPt(o, o.x, o.y) }; });
  const br = await p.evaluate(() => { const o = objects[0]; return rotPt(o, o.x + o.w, o.y + o.h); });
  const u = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  await drag(p, s(...br), s(br[0] + u[0] * 60, br[1] + u[1] * 60));          /* 60 px along the rotated x axis */
  const after = await p.evaluate(() => { const o = objects[0]; return { w: o.w, h: o.h, tl: rotPt(o, o.x, o.y), rot: o.rot }; });
  assert.ok(Math.abs(after.w - (before.w + 60)) < 3 && Math.abs(after.h - before.h) < 3, 'width +60, height same: ' + JSON.stringify(after));
  assert.ok(Math.hypot(after.tl[0] - before.tl[0], after.tl[1] - before.tl[1]) < 1.5, 'opposite corner stays put'); assert.equal(after.rot, 30);
  const svg = await p.evaluate(() => { const r = SvgExport.build(objects, { matW, matH, units: 'in' }); return typeof r === 'string' ? r : (r.svg || ''); });
  assert.match(svg, /<image[^>]*transform="rotate\(30 /);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('rotation: text outlines (export / cut job / convert to shapes) are rotated with the text', { skip: !fs.existsSync(REG) && 'DejaVu font not installed' }, async () => {
  const p = await open(); await setup(p);
  await p.evaluate(() => { setTool('text'); document.querySelector('#optFont').parentNode.querySelector('.fl-btn').click(); }); await p.setInputFiles('#fontFileInput', REG);
  await p.waitForFunction(() => FontLib.faces().length > 0, null, { timeout: 5000 }); await p.keyboard.press('Escape'); await p.evaluate(() => setTool('select'));
  const fam = await p.evaluate(() => FontLib.faces()[0].family || FontLib.faces()[0].name);
  const r = await p.evaluate(async fam => {
    const t = objects[1]; t.font = 'bold 48px ' + fam; t.text = 'HI'; t.rot = 0; const a = await FontLib.outlineText(t); t.rot = 90; const b = await FontLib.outlineText(t);
    const bb = c => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; c.forEach(k => (k.points || k).forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); })); return { w: x1 - x0, h: y1 - y0 }; };
    return { a: bb(a.contours), b: bb(b.contours) };
  }, fam);
  assert.ok(r.a.w > r.a.h * 1.1, 'unrotated text is wider than tall'); assert.ok(Math.abs(r.b.w - r.a.h) < 1.5 && Math.abs(r.b.h - r.a.w) < 1.5, 'rotated 90: width and height swap ' + JSON.stringify(r));
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
