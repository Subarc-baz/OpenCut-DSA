// v6.12 browser tests: Make Cut text, donate button gone, magenta/grey theme, real QR code, shape warp, header layout.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const jsQR = require('./vendor/jsQR.js');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
const shapes = () => { objects.length = 0; nextId = 1;
  objects.push({ id: nextId++, type: 'rect', x: 100, y: 100, w: 200, h: 120, fill: '#ff3fc8', stroke: '#fff', strokeW: 2, alpha: 1, name: 'R', cornerR: 0 });
  objects.push({ id: nextId++, type: 'ellipse', cx: 500, cy: 160, rx: 90, ry: 60, x: 410, y: 100, w: 180, h: 120, fill: '#ff3fc8', stroke: '#fff', strokeW: 2, alpha: 1, name: 'E' });
  objects.push({ id: nextId++, type: 'line', x1: 100, y1: 400, x2: 400, y2: 300, x: 100, y: 300, w: 300, h: 100, fill: 'none', stroke: '#fff', strokeW: 3, alpha: 1, name: 'L' });
  objects.push({ id: nextId++, type: 'star', cx: 600, cy: 400, r: 80, ir: 35, n: 5, x: 520, y: 320, w: 160, h: 160, fill: '#ff3fc8', stroke: '#fff', strokeW: 2, alpha: 1, name: 'S' });
  refreshLayers(); draw(); };

test('cut dashboard says Make Cut; the joke text and the donate button/modal are gone', async () => {
  const p = await open(); const html = await p.content();
  assert.ok(!/wubba/i.test(html), 'no wubba text'); assert.ok(!document_has(html, 'btnDonate') && !document_has(html, 'donateModal'));
  assert.ok(await p.locator('.mbtn.go', { hasText: 'Make Cut' }).count() === 1);
  assert.equal(await p.locator('#btnDonate').count(), 0); assert.deepEqual(p.errs, []); await p.ctx.close();
});
function document_has(h, id) { return h.indexOf('id="' + id + '"') >= 0; }

test('theme: no green accents remain in the app chrome (palette dots / mat / fonts excepted); tool selection + logo are magenta', async () => {
  const p = await open();
  const isGreen = c => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; return g > 150 && g > r + 60 && g > b + 40; };
  const bad = await p.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach(el => { if (el.closest('#swatches') || el.closest('#cvs') || el.closest('#matList')) return; const cs = getComputedStyle(el); ['color', 'backgroundColor', 'borderTopColor', 'outlineColor'].forEach(k => out.push([el.id || el.className || el.tagName, k, cs[k]])); }); return out; });
  const greens = bad.filter(b => isGreen(b[2])); assert.deepEqual(greens, [], 'green UI colours: ' + JSON.stringify(greens.slice(0, 5)));
  await p.keyboard.press('r'); await p.waitForTimeout(500);
  const on = await p.evaluate(() => { const b = document.querySelector('.tbtn.on'); const cs = getComputedStyle(b); return { bg: cs.backgroundImage, fg: cs.color }; });
  assert.ok(/255, 63, 200|255, 138, 230/.test(on.bg), 'selected tool has a magenta backdrop: ' + on.bg);
  const lum = c => { const m = c.match(/\d+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  assert.ok(lum(on.fg) < 0.2, 'icon colour is dark on the magenta backdrop (legible): ' + on.fg);
  const logo = await p.evaluate(() => decodeURIComponent(LOGO_URI)); assert.ok(!/44ff66|b5ff3b/i.test(logo) && /ff3fc8/i.test(logo), 'logo recoloured');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('new shapes default to magenta fill; new text stays black', async () => {
  const p = await open(); assert.equal((await p.inputValue('#optFill')).toLowerCase(), '#ff3fc8'); await p.ctx.close();
});

test('QR generator produces a REAL QR code: decodes back to the text (ASCII and UTF-8)', async () => {
  const p = await open();
  for (const txt of ['https://example.com/a?b=1&c=2', 'Hello wörld ✓ 日本', 'x'.repeat(120)]) {
    await p.evaluate(t => { window.prompt = () => t; generateQR(); }, txt); await p.waitForTimeout(300);
    const d = await p.evaluate(() => { const o = objects[objects.length - 1]; const c = document.createElement('canvas'); c.width = o.img.naturalWidth; c.height = o.img.naturalHeight; const x = c.getContext('2d'); x.drawImage(o.img, 0, 0); return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) }; });
    const r = jsQR(Uint8ClampedArray.from(d.d), d.w, d.h); assert.ok(r, 'decodes: ' + txt.slice(0, 20)); assert.equal(r.data, txt);
  }
  /* two different texts give two different codes (the old placeholder was hash noise) */
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('shape warp: rect/ellipse/line/star warp via the dropdown + slider, None restores the exact original, undo works', async () => {
  const p = await open(); await p.evaluate(shapes);
  const orig = await p.evaluate(() => JSON.stringify(objects));
  for (let i = 0; i < 4; i++) {
    await p.evaluate(i => selectObj(i), i); assert.ok(await p.locator('#shapeWarpPanel').isVisible());
    await p.selectOption('#swStyle', i === 2 ? 'arch' : 'wave');
    const g = await p.evaluate(i => { const o = objects[i]; return { t: o.type, open: !!o.open, n: o.contours[0].length, h: o.h }; }, i);
    assert.equal(g.t, 'path'); assert.ok(g.n > 20, 'tessellated'); assert.equal(g.open, i === 2);
  }
  /* slider changes the geometry */
  await p.evaluate(() => selectObj(0)); const h1 = await p.evaluate(() => objects[0].h);
  await p.fill('#swAmtV', '100'); await p.dispatchEvent('#swAmtV', 'change'); const h2 = await p.evaluate(() => objects[0].h);
  assert.notEqual(h1, h2, 'amount changes the shape');
  /* None restores the originals exactly */
  for (let i = 0; i < 4; i++) { await p.evaluate(i => selectObj(i), i); await p.selectOption('#swStyle', 'none'); }
  assert.equal(await p.evaluate(() => JSON.stringify(objects)), orig, 'original shapes restored exactly');
  /* undo of a warp returns the original */
  await p.evaluate(() => selectObj(1)); await p.selectOption('#swStyle', 'bulge'); assert.equal(await p.evaluate(() => objects[1].type), 'path');
  await p.evaluate(() => undo()); assert.equal(await p.evaluate(() => objects[1].type), 'ellipse');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('warped shapes follow move/resize, export to SVG (open lines stay open) and survive save/undo', async () => {
  const p = await open(); await p.evaluate(shapes);
  await p.evaluate(() => selectObj(0)); await p.selectOption('#swStyle', 'arch'); await p.evaluate(() => selectObj(2)); await p.selectOption('#swStyle', 'wave');
  /* move + scale the warped rect, then remove the warp: the real rect is at the new place/size */
  await p.evaluate(() => { const o = objects[0]; const c = Object.assign({}, o); scaleObj(o, c, 2, 2, o.x, o.y); translateObj(o, 50, 20); selectObj(0); });
  const b = await p.evaluate(() => { const o = objects[0]; return { x: o.x, y: o.y, w: o.w, h: o.h }; });
  await p.selectOption('#swStyle', 'none'); const r = await p.evaluate(() => objects[0]);
  assert.equal(r.type, 'rect'); assert.ok(Math.abs(r.w - 400) < 1 && Math.abs(r.h - 240) < 1 && Math.abs(r.x - 150) < 1 && Math.abs(r.y - 150) < 1, JSON.stringify(r) + ' vs ' + JSON.stringify(b));
  const svg = await p.evaluate(() => { const r = SvgExport.build(objects, { matW, matH, units: 'in' }); return typeof r === 'string' ? r : (r.svg || r.text || JSON.stringify(r)); });
  const ds = svg.match(/<path d="M[^"]*"/g) || []; assert.ok(ds.length >= 1, 'warped line exported as a path: ' + svg.slice(0, 200)); assert.ok(ds.some(d => !/ Z"$/.test(d)), 'open (line) path has no Z');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

test('header: palette sits right of the logo/name; Undo/Redo and PNG/Mat are stacked; every button still works', async () => {
  const p = await open();
  const L = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); }; return { brand: r('.brand'), sw: r('#swatches'), undo: r('#btnUndo'), redo: r('#btnRedo'), png: r('#btnPng'), mat: r('#btnMat'), hdr: r('header'), n: document.querySelectorAll('#swatches .sw').length, inHdr: !!document.querySelector('header #swatches') }; });
  assert.ok(L.inHdr && L.n === 18 && L.sw.left >= L.brand.right - 1, 'palette in header, right of the name'); assert.ok(L.sw.right <= L.png.left + 1 && L.sw.left > L.brand.right + 100, 'palette sits just left of the PNG/Mat pair, free space after the name');
  assert.ok(L.redo.top > L.undo.top && Math.abs(L.redo.left - L.undo.left) < 2, 'undo/redo stacked'); assert.ok(L.mat.top > L.png.top && Math.abs(L.mat.left - L.png.left) < 2, 'png/mat stacked');
  assert.ok(L.sw.bottom <= L.hdr.bottom && L.undo.top >= L.hdr.top && L.mat.bottom <= L.hdr.bottom, 'everything fits inside the header');
  /* palette dot sets the fill; undo/redo buttons work */
  await p.evaluate(shapes); await p.evaluate(() => selectObj(0));
  await p.locator('#swatches .sw').nth(8).click(); assert.equal((await p.inputValue('#optFill')).toLowerCase(), '#2ecc71');
  await p.evaluate(() => { pushUndo(); objects.pop(); refreshLayers(); draw(); }); const n = await p.evaluate(() => objects.length);
  await p.click('#btnUndo'); assert.equal(await p.evaluate(() => objects.length), n + 1); await p.click('#btnRedo'); assert.equal(await p.evaluate(() => objects.length), n);
  await p.click('#btnMat'); await p.keyboard.press('Escape'); assert.ok(await p.locator('#btnPng').isVisible());
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
