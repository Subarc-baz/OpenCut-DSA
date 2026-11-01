// v6.9 browser tests: wand selections of EMPTY space can be filled (colour and swatch), on a PNG canvas and on the mat; positive space still recolours the object.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const png = require('./pngwriter.js');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
async function click(p, x, y) { const t = await p.evaluate(() => [zoom, panX, panY]), b = await p.locator('#cvs').boundingBox(); await p.mouse.click(b.x + x * t[0] + t[1], b.y + y * t[0] + t[2]); }
const px = (p, x, y) => p.evaluate(([x, y]) => { const d = ctx.getImageData(Math.round(x * zoom + panX), Math.round(y * zoom + panY), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
const near = (c, d, t = 40) => c.every((v, i) => Math.abs(v - d[i]) <= t);
const DISC = 'data:image/png;base64,' + png(120, 120, (x, y) => { const d = Math.hypot(x - 60, y - 60); return d < 50 ? [220, 30, 30, 255] : d < 52 ? [220, 30, 30, Math.round(255 * (52 - d) / 2)] : [0, 0, 0, 0]; }).toString('base64');
async function pngWithDisc(p) {
  await p.click('#btnPng'); await p.fill('#pngW', '4'); await p.fill('#pngH', '4'); await p.click('#pngGo');
  await p.evaluate(async u => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: 1, type: 'image', src: u, img: im, x: 100, y: 100, w: 120, h: 120, alpha: 1, name: 'disc' }); nextId = 2; r(); }; im.src = u; }); gridOn = false; draw(); }, DISC);
}
const setFill = (p, c) => p.evaluate(c => { document.getElementById('optFill').value = c; document.getElementById('optNoFill').checked = false; }, c);

test('empty space around a pasted cut-out is fillable: a new shape goes BEHIND, the picture is untouched, undo removes it', async () => {
  const p = await open(); await pngWithDisc(p); await setFill(p, '#0000ff'); await p.keyboard.press('w'); await click(p, 30, 30);
  assert.ok(await p.evaluate(() => WandTool.hasSelection())); const u0 = await p.evaluate(() => undoStack.length);
  await p.evaluate(() => WandTool.fillSelection());
  const o = await p.evaluate(() => objects.map(x => x.type + ':' + x.name + ':' + x.fill)); assert.deepEqual(o, ['path:Filled empty area:#0000ff', 'image:disc:undefined']);
  assert.equal(await p.evaluate(() => undoStack.length), u0 + 1); await p.keyboard.press('Escape');
  const cc = await px(p, 30, 30); assert.ok(near(cc, [0, 0, 255]), 'empty area now blue ' + cc); assert.ok(near(await px(p, 160, 160), [220, 30, 30], 20), 'disc still red on top');
  await p.keyboard.press('Control+z'); assert.equal(await p.evaluate(() => objects.length), 1); assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('the whole flow: copy the positive space, paste into a blank PNG canvas, select the empty space, fill with a SWATCH', async () => {
  const p = await open();
  await p.evaluate(async u => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: 1, type: 'image', src: u, img: im, x: 200, y: 200, w: 120, h: 120, alpha: 1, name: 'disc' }); nextId = 2; r(); }; im.src = u; }); gridOn = false; draw(); }, DISC);
  await p.keyboard.press('w'); await click(p, 260, 260); await p.keyboard.press('Control+c');
  await p.click('#btnPng'); await p.fill('#pngW', '4'); await p.fill('#pngH', '4'); await p.click('#pngGo'); await p.keyboard.press('Control+v'); await p.waitForTimeout(250);
  assert.equal(await p.evaluate(() => objects.length), 1);
  await p.evaluate(async () => { await SwatchLib.addFiles([{ file: new File(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ff00ff"/></svg>'], 'mag.svg', { type: 'image/svg+xml' }) }]); }); await p.waitForTimeout(300);
  await p.evaluate(() => setTool('wand')); await click(p, 20, 20); assert.ok(await p.evaluate(() => WandTool.hasSelection()));
  await p.click('.swTile[title="mag"]'); await click(p, 20, 20); await p.waitForTimeout(150);
  const o = await p.evaluate(() => objects.map(x => ({ n: x.name, t: x.type, sid: x.pattern && x.pattern.sid })));
  assert.equal(o.length, 2); assert.equal(o[0].n, 'Filled empty area'); assert.equal(o[0].sid, 'user/mag.svg'); assert.equal(o[1].t, 'image');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('positive space still recolours the picture itself (no extra shape); a blank canvas fills as one shape; blank mat works too', async () => {
  const p = await open(); await pngWithDisc(p); await setFill(p, '#00aa00'); await p.keyboard.press('w'); await click(p, 160, 160); await p.evaluate(() => WandTool.fillSelection());
  assert.equal(await p.evaluate(() => objects.length), 1, 'no extra shape for the positive space'); await p.keyboard.press('Escape'); await p.waitForTimeout(80); assert.ok(near(await px(p, 160, 160), [0, 170, 0], 40));
  await p.evaluate(() => { objects.length = 0; draw(); }); await p.evaluate(() => setTool('wand')); await click(p, 200, 200); await p.evaluate(() => WandTool.fillSelection('#123456'));
  const w = await p.evaluate(() => ({ n: objects.length, w: objects[0].w, h: objects[0].h })); assert.equal(w.n, 1); assert.ok(Math.abs(w.w - 384) < 4 && Math.abs(w.h - 384) < 4, 'covers the canvas: ' + w.w);
  await p.click('#docTabs .dt[data-kind=mat]'); await p.evaluate(() => setTool('wand')); await click(p, 300, 300); await p.evaluate(() => WandTool.fillSelection('#654321')); assert.equal(await p.evaluate(() => objects.length), 1);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
