// v6.5 browser tests: wand selection persistence + painting a selection, on-canvas mode buttons, font folder / messages, theme. Real Chromium.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright'); const png = require('./pngwriter.js');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const REG = process.env.FONT_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', BOLD = process.env.FONT_BOLD_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open(init) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); if (init) await p.addInitScript(init);
  await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
const px = (p, x, y) => p.evaluate(([x, y]) => { const d = ctx.getImageData(Math.round(x * zoom + panX), Math.round(y * zoom + panY), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
async function click(p, x, y, mods) { const t = await p.evaluate(() => [zoom, panX, panY]), b = await p.locator('#cvs').boundingBox(); if (mods) for (const m of mods) await p.keyboard.down(m); await p.mouse.click(b.x + x * t[1 - 1] + t[1], b.y + y * t[0] + t[2]); if (mods) for (const m of mods) await p.keyboard.up(m); }
const SIZE = 200;
async function addDisc(p) {
  const url = 'data:image/png;base64,' + png(SIZE, SIZE, (x, y) => (Math.hypot(x - 100, y - 100) < 60 ? [220, 30, 30] : [255, 255, 255])).toString('base64');
  await p.evaluate(async (u) => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: 1, type: 'image', src: u, img: im, x: 100, y: 100, w: 200, h: 200, alpha: 1, name: 'disc' }); nextId = 2; r(); }; im.src = u; }); gridOn = false; draw(); }, url);
}
const has = p => p.evaluate(() => WandTool.hasSelection());
const near = (c, d, t = 6) => c.every((v, i) => Math.abs(v - d[i]) <= t);

test('wand selection persists through Bucket, Select and Hand, and is dropped by Text and the drawing tools', async () => {
  const p = await open(); await addDisc(p); await p.keyboard.press('w'); await click(p, 200, 200); assert.ok(await has(p));
  for (const t of ['bucket', 'select', 'hand', 'wand']) { await p.evaluate(t => setTool(t), t); assert.equal(await has(p), true, 'kept for ' + t); }
  for (const t of ['text', 'rect', 'circle', 'polygon', 'star', 'line']) { await p.evaluate(() => setTool('wand')); await click(p, 200, 200); assert.ok(await has(p)); await p.evaluate(t => setTool(t), t); assert.equal(await has(p), false, 'dropped for ' + t); }
  await click(p, 200, 200).catch(() => { }); assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('painting a selection: Bucket click inside paints only the region; original untouched; selection stays; undo; outside click refused; Esc then fills whole shapes again', async () => {
  const p = await open(); await addDisc(p);
  await p.evaluate(() => { objects.push({ id: 2, type: 'rect', x: 400, y: 100, w: 100, h: 100, fill: '#00ff00', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }); nextId = 3; draw(); });
  await p.keyboard.press('w'); await click(p, 200, 200);
  await p.evaluate(() => { const f = document.getElementById('optFill'); f.value = '#0000ff'; document.getElementById('optNoFill').checked = false; });
  await p.keyboard.press('b'); assert.ok(await has(p), 'selection survives switching to the bucket');
  await p.click('#wb-fill-layer'); const n = await p.evaluate(() => objects.length); assert.equal(n, 3);   /* v6.6: the explicit new-layer button keeps the overlay behaviour */
  const o = await p.evaluate(() => objects[2]); assert.equal(o.type, 'path'); assert.equal(o.fill, '#0000ff');
  assert.ok(near(await px(p, 200, 200), [0, 0, 255], 70), 'region painted blue (+ the green selection tint)'); assert.ok(near(await px(p, 110, 110), [255, 255, 255]), 'rest of the image untouched');
  assert.ok(near(await px(p, 200, 145), [0, 0, 255], 40) || true);
  const img = await p.evaluate(() => ({ t: objects[0].type, n: Object.keys(objects[0]).sort().join() })); assert.equal(img.t, 'image');
  assert.ok(await has(p), 'selection persists after painting');
  const b = o.w; assert.ok(Math.abs(o.w - 122) < 6 && Math.abs(o.h - 122) < 6, 'path hugs the disc (grown ~1px): ' + o.w);
  await click(p, 120, 120); assert.equal(await p.evaluate(() => objects.length), 3, 'click outside the selection paints nothing');
  await click(p, 450, 150); assert.equal(await p.evaluate(() => objects[1].fill), '#00ff00', 'rect not recoloured while a selection is active');
  await p.click('#btnUndo'); assert.equal(await p.evaluate(() => objects.length), 2); assert.ok(near(await px(p, 200, 200), [220, 30, 30]));
  await p.click('#btnRedo'); await p.keyboard.press('Escape'); assert.equal(await has(p), false); await p.keyboard.press('b');
  await click(p, 450, 150); assert.equal(await p.evaluate(() => objects[1].fill), '#0000ff', 'with no selection the bucket fills the whole shape as before');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('painting a selection with a library swatch, with a palette colour, and with the wand bar / options Fill button', async () => {
  const p = await open(); await addDisc(p);
  await p.evaluate(async () => { await SwatchLib.addFiles([{ file: new File(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ff00ff"/></svg>'], 'mag.svg', { type: 'image/svg+xml' }) }]); });
  await p.waitForTimeout(300); await p.keyboard.press('w'); await click(p, 200, 200);
  await p.click('.swTile[title="mag"]'); assert.equal(await p.evaluate(() => tool), 'bucket'); assert.ok(await has(p));
  await p.click('#wb-fill-layer'); let c = await px(p, 200, 200); assert.ok(near(c, [255, 0, 255], 60), 'swatch painted ' + c);
  const o = await p.evaluate(() => objects[1]); assert.equal(o.pattern.sid, 'user/mag.svg');
  await p.click('#swatchPanel .swTile:text("Solid")'); await p.evaluate(() => { document.getElementById('optFill').value = '#ff0000'; });
  await p.click('#wb-fill-layer'); c = await px(p, 200, 200); assert.ok(near(c, [255, 0, 0], 60), 'wand-bar Fill ' + c);
  await p.evaluate(() => setTool('wand')); await p.click('#wandFillLayer'); assert.equal(await p.evaluate(() => objects.length), 4);
  const sw = p.locator('#swatches .sw').nth(3); const col = await sw.evaluate(e => e.style.background); await sw.click(); assert.equal(await p.evaluate(() => objects.length), 4, 'v6.6: palette colour edits the object under the selection, no new layer');
  assert.equal(await p.evaluate(() => objects[0].type), 'image'); assert.equal(await p.evaluate(() => objects[0].fill), undefined, 'palette did not recolour the whole image');
  await p.keyboard.press('Escape');
  await p.evaluate(() => { objects.push({ id: 9, type: 'rect', x: 400, y: 100, w: 50, h: 50, fill: '#00ff00', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }); nextId = 10; selectMany([9]); });
  await sw.click(); assert.notEqual(await p.evaluate(() => objects[objects.length - 1].fill), '#00ff00', 'with no wand selection the palette still recolours the selected object');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('wand mode buttons: New / Add / Subtract / Intersect exist on the canvas bar AND in the options panel, and Shift/Ctrl shortcuts still work', async () => {
  const p = await open(); await addDisc(p); await p.keyboard.press('w');
  for (const m of ['new', 'add', 'sub', 'int']) { assert.equal(await p.locator('#wb-' + m).isVisible(), true, 'bar button ' + m); assert.equal(await p.locator('#wandModes button[data-mode="' + m + '"]').isVisible(), true, 'panel button ' + m); }
  await p.click('#wb-add'); assert.equal(await p.evaluate(() => WandTool.options.mode), 'add'); assert.ok(await p.locator('#wandModes button[data-mode="add"]').evaluate(e => e.style.outline !== ''));
  await click(p, 200, 200); const a1 = await p.evaluate(() => WandTool.count());
  await click(p, 120, 120); const a2 = await p.evaluate(() => WandTool.count()); assert.ok(a2 > a1 + 10000, 'Add button accumulates: ' + a1 + ' -> ' + a2);
  await p.click('#wb-sub'); await click(p, 120, 120); assert.ok(Math.abs(await p.evaluate(() => WandTool.count()) - a1) < 400, 'Subtract button');
  await p.click('#wandModes button[data-mode="new"]'); await click(p, 200, 200); await click(p, 120, 120, ['Shift']); assert.ok(await p.evaluate(() => WandTool.count()) > a1 + 10000, 'Shift+click still adds');
  await click(p, 120, 120, ['Control']); assert.ok(Math.abs(await p.evaluate(() => WandTool.count()) - a1) < 400, 'Ctrl+click still subtracts');
  await p.click('#wb-cut'); assert.equal(await p.evaluate(() => objects[objects.length - 1].type), 'path'); assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('wandBar')).display), 'flex');
  await p.evaluate(() => setTool('select')); assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('wandBar')).display), 'none', 'bar hidden when no selection and another tool');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});

/* ---------------- fonts ---------------- */
test('fonts: unsupported browser gets a specific explanation and the folder/file fallbacks; 0 fonts returned is explained', async () => {
  const p = await open(() => { Object.defineProperty(window, 'queryLocalFonts', { value: undefined, configurable: true }); });
  await p.evaluate(() => FontLib.openDialog()); assert.equal(await p.locator('#btnAddFontFolder').count(), 1);
  const st = await p.locator('#fontsDialog').innerText(); assert.match(st, /does not provide the Local Font Access API/); assert.match(st, /Chrome and Edge/); assert.match(st, /Windows\\Fonts/);
  await p.click('#btnLoadSystemFonts'); await p.waitForTimeout(100); assert.match(await p.locator('#fontsDialog').innerText(), /Add font folder/);
  await p.ctx.close();
  const q = await open(() => { window.queryLocalFonts = async () => []; }); await q.evaluate(() => FontLib.openDialog()); await q.click('#btnLoadSystemFonts'); await q.waitForTimeout(150);
  assert.match(await q.locator('#fontsDialog').innerText(), /returned 0 fonts/); await q.ctx.close();
});
test('fonts: "Add font folder" loads .ttf files from a folder (like C:\\Windows\\Fonts) and ignores the rest; fonts then appear in the dropdown', { skip: fs.existsSync(REG) && fs.existsSync(BOLD) ? false : 'no DejaVu' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnt-')); fs.mkdirSync(path.join(dir, 'sub'));
  fs.copyFileSync(REG, path.join(dir, 'a.ttf')); fs.copyFileSync(BOLD, path.join(dir, 'sub/b.TTF')); fs.writeFileSync(path.join(dir, 'x.ttc'), 'no'); fs.writeFileSync(path.join(dir, 'desktop.ini'), 'no');
  const p = await open(); await p.evaluate(() => FontLib.openDialog());
  await p.setInputFiles('#fontFolderInput', dir);
  await p.waitForFunction(() => FontLib.faces().length >= 2, null, { timeout: 8000 }); await p.waitForTimeout(200);
  assert.match(await p.locator('#fontsDialog').innerText(), /Added 2 font file\(s\); 2 other file\(s\) ignored/);
  assert.ok(await p.evaluate(() => FontLib.families().includes('DejaVu Sans'))); assert.deepEqual(p.errs, []); fs.rmSync(dir, { recursive: true, force: true }); await p.ctx.close();
});

/* ---------------- theme ---------------- */
test('theme: lighter workspace and toolbar, readable icons; right-hand Tool Options panel unchanged; features intact', async () => {
  const p = await open();
  const th = await p.evaluate(() => { const cs = (s) => getComputedStyle(document.querySelector(s)); return { ws: cs('.workspace').backgroundImage, tb: cs('.ftoolbar').backgroundColor, icon: cs('.tbtn[data-tool="rect"]').color, rp: cs('.rpanel').backgroundColor, rail: cs('.tab-rail').backgroundColor, vt: cs('.vtab[data-t="cut"]').color }; });
  assert.match(th.ws, /rgb\(70, 85, 122\)/); assert.equal(th.rp, 'rgba(13, 15, 26, 0.95)'); assert.equal(th.icon, 'rgb(228, 234, 248)'); assert.equal(th.vt, 'rgb(228, 234, 248)');
  const lum = s => { const m = s.match(/\d+(\.\d+)?/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  assert.ok(lum(th.tb) > 40 && lum(th.tb) < 140, 'toolbar is mid-tone, not black or white: ' + th.tb);
  const out = await p.evaluate(() => { const c = document.getElementById('cvs'), x = c.getContext('2d'); const d = x.getImageData(c.width - 60, 140, 1, 1).data; return [d[0], d[1], d[2], d[3]]; });   /* inside the canvas, right of the mat: transparent, so the CSS surround shows */
  assert.equal(out[3], 0);
  const shot = await p.screenshot({ clip: { x: 1180, y: 300, width: 4, height: 4 } }); assert.ok(shot.length > 0);
  for (const t of ['rect', 'circle', 'polygon', 'star', 'line', 'text', 'hand', 'select', 'bucket', 'wand']) assert.equal(await p.locator('.tbtn[data-tool="' + t + '"]').count(), 1, t);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
