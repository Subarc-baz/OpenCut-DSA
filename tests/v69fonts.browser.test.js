// v6.9 fonts folder: "Save fonts to app folder" writes fonts-bundle.js; placed in fonts/ next to index.html the fonts load on every start (fresh browser profile, file://).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const REG = process.env.FONT_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', BOLD = process.env.FONT_BOLD_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const skip = fs.existsSync(REG) && fs.existsSync(BOLD) ? false : 'DejaVu fonts not installed';
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] }); });
test.after(async () => { await browser.close(); });
async function page(file, init) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); if (init) await p.addInitScript(init); await p.goto('file://' + file); await p.waitForTimeout(500); p.errs = errs; p.ctx = ctx; return p;
}
test('no bundle present: starts normally, no errors, no fonts', async () => {
  const p = await page(FILE); assert.equal(await p.evaluate(() => FontLib.faces().length), 0); assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('save bundle -> put in fonts/ -> a brand-new browser profile loads the fonts at start; they list, convert, and are marked as coming from the fonts folder', { skip }, async () => {
  const p = await page(FILE); await p.evaluate(() => FontLib.openDialog()); await p.setInputFiles('#fontFileInput', [REG, BOLD]); await p.waitForFunction(() => FontLib.faces().length === 2, null, { timeout: 5000 });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnSaveFontBundle')]); assert.equal(dl.suggestedFilename(), 'fonts-bundle.js'); const bundle = fs.readFileSync(await dl.path());
  assert.match(await p.textContent('#fontsDialog div:nth-child(2)'), /Saved fonts-bundle\.js \(2 font file/); await p.ctx.close();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocdsa-')); fs.mkdirSync(path.join(dir, 'fonts')); fs.copyFileSync(FILE, path.join(dir, 'index.html')); fs.writeFileSync(path.join(dir, 'fonts', 'fonts-bundle.js'), bundle);
  const q = await page(path.join(dir, 'index.html')); await q.waitForFunction(() => FontLib.faces().length === 2, null, { timeout: 8000 });
  assert.equal(await q.evaluate(() => FontLib.faces().every(f => f.bundled)), true);
  await q.evaluate(() => setTool('text')); assert.ok((await q.$$eval('#optFont option', e => e.map(x => x.textContent))).some(x => /DejaVu Sans/.test(x)));
  await q.evaluate(() => { setTool('select'); objects.push({ id: 1, type: 'text', x: 200, y: 300, text: 'Hi', fill: '#000', font: 'bold 48px "DejaVu Sans", sans-serif', name: 'T', w: 0, h: 52, curve: 0, warp: 'none', stroke: 'none', strokeW: 0, alpha: 1 }); nextId = 2; selectMany([1]); });
  assert.equal(await q.evaluate(() => convertSelectedTextToShapes()), 1);
  await q.evaluate(() => FontLib.openDialog()); assert.match(await q.textContent('#fontsDialog div:nth-child(2)'), /load automatically from the fonts folder/); assert.match(await q.textContent('#fontList'), /fonts folder/); assert.equal(await q.locator('#fontList button:text("Remove")').count(), 0, 'folder fonts cannot be removed from the dialog');
  assert.deepEqual(q.errs, []); await q.ctx.close(); fs.rmSync(dir, { recursive: true, force: true });
});
test('when the browser refuses to store fonts the dialog says so and points to the fonts folder; saving with no fonts explains', { skip }, async () => {
  const p = await page(FILE, () => { const o = indexedDB.open.bind(indexedDB); indexedDB.open = function (n) { if (n === 'sitc_fonts') throw new Error('blocked'); return o.apply(this, arguments); }; });
  await p.evaluate(() => FontLib.openDialog()); await p.click('#btnSaveFontBundle'); await p.waitForTimeout(150); assert.match(await p.textContent('#fontsDialog div:nth-child(2)'), /Add some fonts first/);
  await p.setInputFiles('#fontFileInput', REG); await p.waitForTimeout(1200); assert.match(await p.textContent('#fontsDialog div:nth-child(2)'), /would not store these fonts.*fonts folder/s);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
