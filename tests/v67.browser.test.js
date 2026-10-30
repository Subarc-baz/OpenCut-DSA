// v6.7 browser tests: blank transparent PNG canvases (tabs), size in inches + DPI, boundary indicator, copy/paste between tabs, transparent export.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
async function make(p, w, h, d) { await p.click('#btnPng'); await p.fill('#pngW', String(w)); await p.fill('#pngH', String(h)); await p.fill('#pngD', String(d)); await p.click('#pngGo'); }
const px = (p, x, y) => p.evaluate(([x, y]) => { const d = ctx.getImageData(Math.round(x * zoom + panX), Math.round(y * zoom + panY), 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [x, y]);

test('create: size in inches + dpi, presets, validation, transparent checkerboard, orange boundary, indicator bar, tabs', async () => {
  const p = await open(); await p.click('#btnPng'); assert.equal(await p.locator('#pngDlg').isVisible(), true);
  await p.click('#pngDlg .pre button:text("5 × 7")'); assert.equal(await p.inputValue('#pngW'), '5'); assert.equal(await p.inputValue('#pngH'), '7');
  await p.fill('#pngD', '300'); assert.match(await p.textContent('#pngInfo'), /1500 × 2100 px/);
  await p.fill('#pngW', '100'); assert.equal(await p.locator('#pngGo').isDisabled(), true, 'too large is refused'); await p.fill('#pngW', '5');
  await p.click('#pngGo');
  assert.deepEqual(await p.evaluate(() => [matW, matH, __pngMode, __pngDpi]), [480, 672, true, 300]);
  assert.match(await p.textContent('#pngBar'), /PNG CANVAS.*5 × 7 in.*1500 × 2100 px.*transparent/); assert.equal(await p.locator('#docTabs .dt').count(), 2);
  await p.evaluate(() => { gridOn = false; draw(); }); const c = await px(p, 10, 10), d = await px(p, 20, 10); assert.ok(c[0] !== d[0] || c[1] !== d[1], 'checkerboard pattern'); assert.ok(c[0] > 180, 'light, not the mat colour');
  const edge = await p.evaluate(() => { const d = ctx.getImageData(Math.round(panX) - 3, Math.round(panY + 100 * zoom), 6, 80).data; return Array.from(d); }); assert.ok(edge.some((v, i) => i % 4 === 0 && v > 240) && edge.some((v, i) => i % 4 === 2 && v < 80), 'orange boundary drawn');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('copy on the mat, paste into the PNG canvas (and back); tabs keep their own objects and undo; mat untouched', async () => {
  const p = await open();
  await p.evaluate(() => { objects.push({ id: 1, type: 'rect', x: 100, y: 100, w: 80, h: 60, fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }); nextId = 2; selectMany([1]); copySelected(); });
  await make(p, 4, 3, 150); assert.equal(await p.evaluate(() => objects.length), 0, 'new canvas is blank');
  await p.evaluate(() => pasteClipboard()); assert.equal(await p.evaluate(() => objects.length), 1, 'pasted into the PNG canvas');
  await p.evaluate(() => pushUndo()); await p.click('#docTabs .dt[data-kind=mat]'); assert.deepEqual(await p.evaluate(() => [objects.length, matW, __pngMode]), [1, 1152, false]);
  assert.equal(await p.evaluate(() => objects[0].fill), '#ff0000');
  await p.click('#docTabs .dt.png'); assert.deepEqual(await p.evaluate(() => [objects.length, matW, __pngMode, __pngDpi]), [1, 384, true, 150]);
  await p.evaluate(() => { selectMany([objects[0].id]); copySelected(); }); await p.click('#docTabs .dt[data-kind=mat]'); await p.evaluate(() => pasteClipboard()); assert.equal(await p.evaluate(() => objects.length), 2, 'pasted back onto the mat');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('several PNG canvases at once; resize; close tab (confirm); closing never touches the mat; second canvas does not replace the first', async () => {
  const p = await open(); await make(p, 4, 4, 96); await p.evaluate(() => { objects.push({ id: 7, type: 'rect', x: 10, y: 10, w: 50, h: 50, fill: '#00ff00', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 8; });
  await make(p, 6, 2, 200); assert.equal(await p.locator('#docTabs .dt').count(), 3); assert.deepEqual(await p.evaluate(() => [matW, matH]), [576, 192]);
  await p.click('#docTabs .dt >> nth=1'); assert.deepEqual(await p.evaluate(() => [objects.length, matW]), [1, 384], 'first PNG canvas kept its object');
  await p.click('#pngResize'); await p.fill('#pngW', '8'); await p.fill('#pngH', '5'); await p.click('#pngGo'); assert.deepEqual(await p.evaluate(() => [matW, matH]), [768, 480]);
  await p.locator('#docTabs .dt.png i').first().click(); assert.equal(await p.locator('#docTabs .dt').count(), 2); assert.equal(await p.evaluate(() => __pngMode), false, 'back on the mat after closing the active tab');
  await p.locator('#docTabs .dt.png i').first().click(); assert.equal(await p.locator('#docTabs').isVisible(), false, 'tabs hidden when only the mat remains'); assert.equal(await p.locator('#pngBar').isVisible(), false);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('export PNG from a PNG canvas: exact pixel size from inches x dpi, transparent background, content in place', async () => {
  const p = await open(); await make(p, 2, 1, 100); await p.evaluate(() => { objects.push({ id: 1, type: 'rect', x: 0, y: 0, w: 48, h: 96, fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; draw(); });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#pngExport')]); assert.equal(dl.suggestedFilename(), 'canvas.png');
  const buf = fs.readFileSync(await dl.path()), w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); assert.deepEqual([w, h], [200, 100]);
  const info = await p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return [Array.from(x.getImageData(20, 50, 1, 1).data), Array.from(x.getImageData(150, 50, 1, 1).data)]; }, buf.toString('base64'));
  assert.deepEqual(info[0], [255, 0, 0, 255], 'painted area'); assert.equal(info[1][3], 0, 'untouched area fully transparent');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('mat behaviour unchanged: normal PNG export keeps the mat colour, autosave is not overwritten by a PNG canvas', async () => {
  const p = await open(); await p.evaluate(() => { objects.push({ id: 1, type: 'rect', x: 10, y: 10, w: 50, h: 50, fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; });
  await make(p, 3, 3, 96); await p.evaluate(() => { objects.push({ id: 9, type: 'rect', x: 0, y: 0, w: 20, h: 20, fill: '#00ff00', stroke: 'none', strokeW: 0, alpha: 1 }); });
  await p.waitForTimeout(300); const auto = await p.evaluate(() => localStorage.getItem('sitc_autosave') || ''); assert.ok(!auto.includes('#00ff00'), 'PNG canvas content not autosaved over the mat');
  await p.click('#docTabs .dt[data-kind=mat]'); const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportPNG())]); assert.equal(dl.suggestedFilename(), 'design.png');
  const w = fs.readFileSync(await dl.path()).readUInt32BE(16); assert.equal(w, 2304, 'mat export still 2x');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
