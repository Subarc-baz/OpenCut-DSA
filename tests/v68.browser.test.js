// v6.8 browser tests: wand copy only copies the selection, text resize keeps the font, only real fonts are listed, new text is black.
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
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Hi' : undefined)); await p.goto('file://' + FILE); await p.waitForTimeout(350); p.errs = errs; p.ctx = ctx; return p;
}
async function click(p, x, y) { const t = await p.evaluate(() => [zoom, panX, panY]), b = await p.locator('#cvs').boundingBox(); await p.mouse.click(b.x + x * t[0] + t[1], b.y + y * t[0] + t[2]); }
const upload = async p => { await p.evaluate(() => { setTool('text'); document.querySelector('#optFont').parentNode.querySelector('.fl-btn').click(); }); await p.setInputFiles('#fontFileInput', REG); await p.waitForFunction(() => FontLib.faces().length > 0, null, { timeout: 5000 }); await p.keyboard.press('Escape'); await p.evaluate(() => setTool('select')); };

test('wand selection + Ctrl+C copies ONLY the selected pixels; paste on the mat (from a PNC tab) gives a transparent picture of just that region', async () => {
  const p = await open(); await p.click('#btnPng'); await p.fill('#pngW', '4'); await p.fill('#pngH', '4'); await p.click('#pngGo');
  const url = 'data:image/png;base64,' + png(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 60 ? [220, 30, 30] : [255, 255, 255])).toString('base64');
  await p.evaluate(async u => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push({ id: 1, type: 'image', src: u, img: im, x: 50, y: 50, w: 200, h: 200, alpha: 1, name: 'disc' }); nextId = 2; r(); }; im.src = u; }); gridOn = false; draw(); }, url);
  await p.keyboard.press('w'); await click(p, 150, 150); assert.ok(await p.evaluate(() => WandTool.hasSelection()));
  await p.keyboard.press('Control+c'); await p.click('#docTabs .dt[data-kind=mat]'); await p.keyboard.press('Control+v'); await p.waitForTimeout(250);
  const o = await p.evaluate(() => { const l = objects[objects.length - 1]; return { n: objects.length, type: l.type, w: l.w, h: l.h, name: l.name, src: l.src }; });
  assert.equal(o.n, 1); assert.equal(o.type, 'image'); assert.ok(Math.abs(o.w - 120) < 6 && Math.abs(o.h - 120) < 6, 'only the disc, not the 200px picture: ' + o.w);
  const px = await p.evaluate(async s => { const im = new Image(); im.src = s; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const g = (a, b) => Array.from(x.getImageData(a, b, 1, 1).data); return { centre: g(im.width >> 1, im.height >> 1), corner: g(1, 1) }; }, o.src);
  assert.deepEqual(px.centre.slice(0, 3), [220, 30, 30]); assert.equal(px.corner[3], 0, 'outside the selection is transparent (disc corner)');
  /* with NO wand selection, Ctrl+C still copies whole objects */
  await p.evaluate(() => { objects.length = 0; objects.push({ id: 5, type: 'rect', x: 100, y: 100, w: 80, h: 60, fill: '#f00', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }); nextId = 6; selectMany([5]); }); await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v');
  assert.deepEqual(await p.evaluate(() => objects.map(o => o.type)), ['rect', 'rect']); assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('resizing text with the corner handle keeps its font (family, bold, italic) and only changes the size', async () => {
  const p = await open(); await p.evaluate(() => { objects.push({ id: 1, type: 'text', x: 200, y: 300, text: 'Hello', fill: '#000', font: 'italic bold 60px "DejaVu Sans", sans-serif', name: 'T', w: 0, h: 52, curve: 0, warp: 'none', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; selectMany([1]); gridOn = false; draw(); });
  const b = await p.evaluate(() => textBounds(objects[0])), t = await p.evaluate(() => [zoom, panX, panY]), bx = await p.locator('#cvs').boundingBox();
  const sx = (b.x + b.w) * t[0] + t[1] + bx.x, sy = (b.y + b.h) * t[0] + t[2] + bx.y;
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 5, sy + 25, { steps: 5 }); await p.mouse.up();
  const f = await p.evaluate(() => objects[0].font); assert.match(f, /^italic bold \d+px "DejaVu Sans", sans-serif$/, f); assert.ok(parseFloat(f.match(/(\d+)px/)[1]) > 60, 'size grew: ' + f);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('font lists show only fonts that really exist: built-in fallbacks are gone, a placeholder explains, loaded fonts appear and are selected', { skip }, async () => {
  const p = await open(); await p.evaluate(() => setTool('text'));
  let o = await p.$$eval('#optFont option', e => e.map(x => x.textContent)); assert.deepEqual(o, ['No fonts yet – click Fonts…']);
  await p.evaluate(() => setTool('select')); await p.evaluate(() => { objects.push({ id: 1, type: 'text', x: 200, y: 300, text: 'Hi', fill: '#000', font: 'bold 48px sans-serif', name: 'T', w: 0, h: 52, curve: 0, warp: 'none', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; selectMany([1]); });
  o = await p.$$eval('#stTextFont option', e => e.map(x => x.textContent)); assert.ok(!o.includes('Arial') && !o.includes('Impact') && !o.includes('Georgia') && !o.includes('Courier New') && !o.includes('Cursive'), 'no fake fonts: ' + o);
  await upload(p); await p.evaluate(() => setTool('text')); o = await p.$$eval('#optFont option', e => e.map(x => x.textContent)); assert.ok(o.some(x => /DejaVu Sans/.test(x)) && !o.some(x => /No fonts yet/.test(x)), o.join('|'));
  assert.match(await p.inputValue('#optFont'), /DejaVu Sans/, 'first real font is selected');
  /* new text: black by default, uses the real font and can be converted without any "pick a font" error */
  await p.evaluate(() => { objects.length = 0; }); await click(p, 300, 300); await p.waitForTimeout(100);
  const t = await p.evaluate(() => objects[0]); assert.equal(t.fill, '#000000'); assert.match(t.font, /DejaVu Sans/);
  assert.equal(await p.evaluate(() => { selectMany([objects[0].id]); return convertSelectedTextToShapes(); }), 1);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('new text colour: black by default; a colour you picked is used', async () => {
  const p = await open(); await p.evaluate(() => setTool('text')); await click(p, 200, 200); await p.waitForTimeout(80);
  assert.equal(await p.evaluate(() => objects[0].fill), '#000000');
  await p.evaluate(() => { setTool('text'); const f = document.getElementById('optFill'); f.value = '#ff8800'; document.getElementById('optNoFill').checked = false; }); await click(p, 400, 400); await p.waitForTimeout(80);
  assert.equal(await p.evaluate(() => objects[1].fill), '#ff8800'); assert.deepEqual(p.errs, []); await p.ctx.close();
});
