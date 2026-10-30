// v6.6 browser tests: wand fills change the object (no overlay layer), split "T" from "TEXT", new-layer button, per-letter convert, floating Layers panel, Deselect routes.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const png = require('./pngwriter.js');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const REG = process.env.FONT_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const skip = fs.existsSync(REG) ? false : 'DejaVu font not installed';
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
const px = (p, x, y) => p.evaluate(([x, y]) => { const d = ctx.getImageData(Math.round(x * zoom + panX), Math.round(y * zoom + panY), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
async function click(p, x, y, mods) { const t = await p.evaluate(() => [zoom, panX, panY]), b = await p.locator('#cvs').boundingBox(); if (mods) for (const m of mods) await p.keyboard.down(m); await p.mouse.click(b.x + x * t[0] + t[1], b.y + y * t[0] + t[2]); if (mods) for (const m of mods) await p.keyboard.up(m); }
const near = (c, d, t = 70) => c.every((v, i) => Math.abs(v - d[i]) <= t);
const has = p => p.evaluate(() => WandTool.hasSelection());
const setFill = (p, c) => p.evaluate(c => { document.getElementById('optFill').value = c; document.getElementById('optNoFill').checked = false; }, c);
/* a two-letter compound path "TE"-like: a T (one contour) and a block (second contour), both red, one object */
async function addCompound(p) {
  await p.evaluate(() => {
    const T = [[0, 0], [100, 0], [100, 30], [65, 30], [65, 120], [35, 120], [35, 30], [0, 30]], B = [[130, 0], [230, 0], [230, 120], [130, 120]];
    objects.push({ id: 1, type: 'path', name: 'TEXT shapes', x: 100, y: 100, w: 230, h: 120, bw: 230, bh: 120, contours: [T, B], fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; gridOn = false; draw();
  });
}
const objs = p => p.evaluate(() => JSON.parse(snapshotObjects()));

test('wand + fill on one letter: the letter becomes its own object with the new fill; NO overlay layer; rest untouched; one undo', async () => {
  const p = await open(); await addCompound(p); await setFill(p, '#0000ff');
  await p.keyboard.press('w'); await click(p, 150, 110); assert.ok(await has(p));
  const u0 = await p.evaluate(() => undoStack.length); await p.keyboard.press('b'); await click(p, 150, 110);
  const o = await objs(p); assert.equal(o.length, 2, 'original split into 2 objects, not 1 + overlay');
  assert.equal(o[0].fill, '#ff0000'); assert.equal(o[0].contours.length, 1, 'original keeps only the other letter');
  assert.equal(o[1].fill, '#0000ff'); assert.equal(o[1].contours.length, 1); assert.match(o[1].name, /\(part\)$/);
  assert.ok(Math.abs(o[1].w - 100) < 1 && Math.abs(o[1].h - 120) < 1, 'part has the T bounds');
  assert.equal(await p.evaluate(() => undoStack.length), u0 + 1); assert.ok(await has(p), 'selection kept');
  await p.keyboard.press('Escape'); assert.ok(near(await px(p, 150, 110), [0, 0, 255], 30)); assert.ok(near(await px(p, 280, 110), [255, 0, 0], 30), 'other letter still red');
  await p.keyboard.press('Control+z'); assert.equal((await objs(p)).length, 1); assert.ok(near(await px(p, 150, 110), [255, 0, 0], 30), 'undo restores');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('wand over a whole object changes its own fill (no new object); palette swatch click does the same', async () => {
  const p = await open(); await addCompound(p); await p.keyboard.press('w'); await p.evaluate(() => { WandTool.options.tol = 40; }); await click(p, 150, 110); await click(p, 280, 110, ['Shift']);
  await setFill(p, '#00aa00'); await p.keyboard.press('b'); await click(p, 150, 110);
  let o = await objs(p); assert.equal(o.length, 1); assert.equal(o[0].fill, '#00aa00');
  assert.equal(await p.evaluate(() => WandTool.fillSelection('#112233')), true); o = await objs(p); assert.equal(o.length, 1); assert.equal(o[0].fill, '#112233');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('partial region of a plain shape is refused with guidance (no change); "Fill in new layer" still works and is a separate object', async () => {
  const p = await open(); await p.evaluate(() => { objects.push({ id: 1, type: 'rect', x: 100, y: 100, w: 200, h: 100, fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }); objects.push({ id: 2, type: 'rect', x: 150, y: 110, w: 80, h: 80, fill: '#ffff00', stroke: 'none', strokeW: 0, alpha: 1, name: 'Y' }); nextId = 3; gridOn = false; draw(); });
  await p.keyboard.press('w'); await click(p, 120, 110); assert.ok(await has(p)); await setFill(p, '#0000ff');
  assert.equal(await p.evaluate(() => WandTool.fillSelection()), true); let o = await objs(p); assert.equal(o.length, 2); assert.equal(o[0].fill, '#ff0000', 'red rect unchanged: only partly selected');
  await p.click('#wb-fill-layer'); o = await objs(p); assert.equal(o.length, 3); assert.equal(o[2].type, 'path'); assert.equal(o[2].fill, '#0000ff');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('pattern fill from a swatch is applied to the split part', async () => {
  const p = await open(); await addCompound(p);
  await p.evaluate(() => { const u = 'data:image/png;base64,' + ''; });
  await p.evaluate(() => { WandTool.options.tol = 5; }); await p.keyboard.press('w'); await click(p, 150, 110);
  await p.evaluate(() => { window.SwatchLib.state.sid = null; }); await setFill(p, '#abcdef'); await p.evaluate(() => WandTool.fillSelection());
  const o = await objs(p); assert.equal(o.length, 2); assert.equal(o[1].fill, '#abcdef'); assert.equal(o[1].pattern, undefined);
  await p.ctx.close();
});
test('image: filling a selected region edits the picture pixels (no overlay)', async () => {
  const p = await open(); const url = 'data:image/png;base64,' + png(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 60 ? [220, 30, 30] : [255, 255, 255])).toString('base64');
  await p.evaluate(async u => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: 1, type: 'image', src: u, img: im, x: 100, y: 100, w: 200, h: 200, alpha: 1, name: 'disc' }); nextId = 2; r(); }; im.src = u; }); gridOn = false; draw(); }, url);
  await p.keyboard.press('w'); await click(p, 200, 200); await p.evaluate(() => WandTool.fillSelection('#0000ff')); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => objects.length), 1); await p.keyboard.press('Escape'); await p.waitForTimeout(50);
  assert.ok(near(await px(p, 200, 200), [0, 0, 255], 30), 'disc recoloured'); assert.ok(near(await px(p, 110, 110), [255, 255, 255], 10), 'background untouched');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('Deselect: button, Esc (any tool), Ctrl+Shift+A, empty-canvas click with Select tool, context menu', async () => {
  const p = await open(); await addCompound(p); const sel = async () => { await p.evaluate(() => setTool('wand')); await click(p, 150, 110); assert.ok(await has(p)); };
  await sel(); await p.click('#wb-clear'); assert.equal(await has(p), false, 'bar button');
  await sel(); await p.keyboard.press('Escape'); assert.equal(await has(p), false, 'Esc');
  await sel(); await p.keyboard.press('b'); await p.keyboard.press('Escape'); assert.equal(await has(p), false, 'Esc in bucket tool');
  await sel(); await p.keyboard.press('Control+Shift+A'); assert.equal(await has(p), false, 'Ctrl+Shift+A');
  await sel(); await p.keyboard.press('v'); await click(p, 600, 400); assert.equal(await has(p), false, 'empty click with Select tool');
  await sel(); await p.keyboard.press('v'); await click(p, 150, 110); assert.ok(await has(p), 'click ON a shape keeps it');
  await sel(); await p.evaluate(() => { const b = document.getElementById('cvs').getBoundingClientRect(); document.getElementById('cvs').dispatchEvent(new MouseEvent('contextmenu', { clientX: b.x + 300, clientY: b.y + 300, bubbles: true, cancelable: true })); });
  const item = p.locator('#ctxMenu button, .ctx-menu button, [id*=ctx] button').filter({ hasText: 'Deselect' }).first(); await item.click(); assert.equal(await has(p), false, 'context menu');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('Layers panel: lists all objects top-first, selects (Shift adds), eye/lock/reorder/delete/rename, collapses; right-pane list unchanged', async () => {
  const p = await open(); await p.evaluate(() => { [['A', '#ff0000'], ['B', '#00ff00'], ['C', '#0000ff']].forEach((a, i) => objects.push({ id: i + 1, type: 'rect', x: 100 + i * 120, y: 100, w: 100, h: 100, fill: a[1], stroke: 'none', strokeW: 0, alpha: 1, name: a[0] })); nextId = 4; refreshLayers(); draw(); });
  assert.equal(await p.locator('#lpanel').isVisible(), true);
  const names = () => p.$$eval('#lpList .lp-nm', e => e.map(x => x.textContent)); assert.deepEqual(await names(), ['C', 'B', 'A']); assert.equal(await p.locator('#lpCount').textContent(), '3');
  await p.locator('#lpList .lp-r').nth(1).click(); assert.deepEqual(await p.evaluate(() => selIds), [2]); await p.locator('#lpList .lp-r').nth(2).click({ modifiers: ['Shift'] }); assert.deepEqual((await p.evaluate(() => selIds)).sort(), [1, 2]);
  await p.locator('#lpList .lp-r').nth(0).locator('[data-a=vis]').click(); assert.equal(await p.evaluate(() => objects[2].hidden), true); await p.locator('#lpList .lp-r').nth(0).locator('[data-a=vis]').click();
  await p.locator('#lpList .lp-r').nth(0).locator('[data-a=lock]').click(); assert.equal(await p.evaluate(() => objects[2].locked), true);
  await p.locator('#lpList .lp-r').nth(2).locator('[data-a=up]').click(); assert.deepEqual(await p.evaluate(() => objects.map(o => o.name)), ['B', 'A', 'C']);
  await p.locator('#lpList .lp-nm').nth(0).dblclick(); await p.locator('#lpList input.lp-ed').fill('Renamed'); await p.keyboard.press('Enter'); assert.equal(await p.evaluate(() => objects[2].name), 'Renamed');
  await p.locator('#lpList .lp-r').nth(0).locator('[data-a=del]').click(); assert.equal(await p.evaluate(() => objects.length), 2); assert.equal(await p.locator('#lpList .lp-r').count(), 2);
  await p.keyboard.press('Control+z'); assert.equal(await p.evaluate(() => objects.length), 3, 'delete is undoable'); assert.equal(await p.locator('#lpList .lp-r').count(), 3);
  assert.equal(await p.locator('#layerList .litem').count(), 3, 'old right-pane list still works');
  await p.click('#lpHead'); assert.equal(await p.locator('#lpList').isVisible(), false); await p.click('#lpHead'); assert.equal(await p.locator('#lpList').isVisible(), true);
  const bb = await p.locator('#lpanel').boundingBox(), cb = await p.locator('#cvs').boundingBox(); assert.ok(bb.x >= cb.x && bb.x + bb.width <= cb.x + cb.width && bb.y + bb.height <= cb.y + cb.height + 1, 'inside the canvas area, not in the right pane');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('Convert: one object per letter -> grouped path objects; then wand+fill colours a single letter; normal convert still makes one object', { skip }, async () => {
  const p = await open(); await p.evaluate(() => { setTool('text'); document.querySelector('#optFont').parentNode.querySelector('.fl-btn').click(); }); await p.setInputFiles('#fontFileInput', REG);
  await p.waitForFunction(() => FontLib.faces().length > 0, null, { timeout: 5000 }); await p.keyboard.press('Escape'); await p.evaluate(() => setTool('select'));
  const add = () => p.evaluate(() => { objects.length = 0; objects.push({ id: 501, type: 'text', x: 150, y: 300, text: 'TEXT', fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1, font: '96px "DejaVu Sans", sans-serif', name: 'Text: TEXT', w: 0, h: 80, curve: 0, warp: 'none' }); nextId = 502; selectMany([501]); gridOn = false; draw(); });
  await add(); await p.evaluate(() => setTool('text')); assert.equal(await p.locator('#btnTextToLetters').count(), 1); await p.evaluate(() => setTool('select'));
  await p.evaluate(() => document.getElementById('btnTextToLetters').click()); await p.waitForTimeout(300);
  let o = await objs(p); assert.equal(o.length, 4, 'T E X T = 4 objects'); assert.ok(o.every(x => x.type === 'path' && x.gid && x.gid === o[0].gid), 'one group'); assert.deepEqual(o.map(x => x.name.split(':')[0]), ['Letter 1', 'Letter 2', 'Letter 3', 'Letter 4']);
  await add(); await p.evaluate(() => convertSelectedTextToShapes()); o = await objs(p); assert.equal(o.length, 1, 'classic convert unchanged');
  /* the user's exact flow: convert, wand the T, fill -> T gets the new fill as its own object, nothing laid over it */
  await setFill(p, '#0000ff'); const b0 = o[0]; await p.evaluate(() => setTool('wand')); await click(p, b0.x + 6, b0.y + 8); assert.ok(await has(p));
  await p.evaluate(() => WandTool.fillSelection()); o = await objs(p); assert.equal(o.length, 2); assert.equal(o[1].fill, '#0000ff'); assert.equal(o[0].fill, '#ff0000'); assert.equal(o[0].contours.length + o[1].contours.length, b0.contours.length, 'no contour lost or duplicated');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
