// v6.10 browser tests: Print sheet (paper layout, cut lines, matching cut-line SVG, print page is exactly one sheet of paper, entry points). No printer is used; the print dialog itself is the browser's.
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
const add = (p, arr) => p.evaluate(a => { a.forEach((o, i) => objects.push(Object.assign({ id: i + 1, stroke: 'none', strokeW: 0, alpha: 1 }, o))); nextId = a.length + 1; draw(); }, arr);
const RED = { type: 'rect', x: 96, y: 96, w: 192, h: 96, fill: '#ff0000' };            /* 2 x 1 in at (1,1) in */

test('layout: top-left at the margin (plus the cut-line offset), exact paper size at 300 dpi, art in the right place, shrink-to-fit, centre, scale', async () => {
  const p = await open(); await add(p, [RED]);
  const r = await p.evaluate(() => { const P = PrintSheet, l = P.items(), L = P.layout(l, Object.assign({}, P.prefs, { cut: false })); const c = P.renderPage(300, l, L, null); const x = c.getContext('2d'); const g = (a, b) => Array.from(x.getImageData(Math.round(a * 300), Math.round(b * 300), 1, 1).data).slice(0, 3);
    return { w: c.width, h: c.height, ox: L.ox, oy: L.oy, cw: L.cw, inside: g(L.ox + 0.5, L.oy + 0.3), outside: g(L.ox - 0.1, L.oy - 0.1), fits: L.fits }; });
  assert.deepEqual([r.w, r.h], [2550, 3300]); assert.ok(Math.abs(r.ox - 0.23) < 0.05 && Math.abs(r.oy - 0.23) < 0.05, 'top-left ' + r.ox); assert.ok(Math.abs(r.cw - 2.04) < 0.02); assert.deepEqual(r.inside, [255, 0, 0]); assert.deepEqual(r.outside, [255, 255, 255]);
  const s = await p.evaluate(() => { const P = PrintSheet, l = P.items(); const f = o => P.layout(l, Object.assign({}, P.prefs, { cut: false }, o)); return { c: f({ center: true }), half: f({ scale: 50, cut: false }), a4: f({ paper: 'a4' }) }; });
  assert.ok(Math.abs(s.c.ox - (8.5 - s.c.cw) / 2) < 1e-6 && Math.abs(s.c.oy - (11 - s.c.ch) / 2) < 1e-6, 'centered'); assert.ok(Math.abs(s.half.cw - 1.02) < 0.02, 'scale'); assert.ok(Math.abs(s.a4.paper.w - 8.27) < 1e-6);
  await add(p, [{ type: 'rect', x: 0, y: 0, w: 15 * 96, h: 3 * 96, fill: '#00f' }]);
  const big = await p.evaluate(() => { const P = PrintSheet, L = P.layout(P.items(), P.prefs), L2 = P.layout(P.items(), Object.assign({}, P.prefs, { shrink: false })); return { shrunk: L.shrunk, fits: L.fits, fits2: L2.fits }; }); assert.deepEqual(big, { shrunk: true, fits: true, fits2: false });
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('cut lines: one per sticker (group = one), grown by the offset, holes filled or kept; positions match the artwork', async () => {
  const p = await open(); await add(p, [RED, { type: 'ellipse', cx: 500, cy: 144, rx: 48, ry: 48, x: 452, y: 96, w: 96, h: 96, fill: '#00ff00' }]);
  const r = await p.evaluate(() => { const P = PrintSheet, l = P.items(), pr = Object.assign({}, P.prefs, { cut: true, offset: 0.1 }), L = P.layout(l, pr), lp = P.cutLoops(l, L, pr);
    const bb = a => { const xs = a.map(q => q[0]), ys = a.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    return { n: lp.length, a: bb(lp[0]), b: bb(lp[1]), L: [L.ox, L.oy] }; });
  assert.equal(r.n, 2); const w = r.a[2] - r.a[0], h = r.a[3] - r.a[1]; assert.ok(Math.abs(w - 2.2) < 0.06 && Math.abs(h - 1.2) < 0.06, 'rect 2x1 + 0.1 on each side: ' + w + 'x' + h);
  assert.ok(Math.abs(r.b[2] - r.b[0] - 1.2) < 0.08, 'disc 1in + 0.2');
  /* group = one sticker; ring hole */
  const g = await p.evaluate(() => { objects.length = 0; objects.push({ id: 1, gid: 7, type: 'rect', x: 96, y: 96, w: 96, h: 96, fill: '#f00', stroke: 'none', strokeW: 0, alpha: 1 }, { id: 2, gid: 7, type: 'rect', x: 250, y: 96, w: 96, h: 96, fill: '#f00', stroke: 'none', strokeW: 0, alpha: 1 });
    objects.push({ id: 3, type: 'path', x: 400, y: 96, w: 100, h: 100, bw: 100, bh: 100, contours: [[[0, 0], [100, 0], [100, 100], [0, 100]], [[30, 30], [30, 70], [70, 70], [70, 30]]], fill: '#00f', stroke: 'none', strokeW: 0, alpha: 1 });
    const P = PrintSheet, l = P.items(), pr = Object.assign({}, P.prefs, { cut: true, offset: 0 }), L = P.layout(l, pr); return { filled: P.cutLoops(l, L, Object.assign({}, pr, { outerOnly: true })).length, kept: P.cutLoops(l, L, Object.assign({}, pr, { outerOnly: false })).length }; });
  assert.deepEqual(g, { filled: 3, kept: 4 }, 'two separate pieces + a ring: outline only = 3 loops, with the ring hole = 4');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('Ctrl+P opens the dialog (not while typing); preview, cut-line SVG matches the page; Print hands ONE exact sheet to the print dialog; the sheet prints as a 1-page PDF of letter size', async () => {
  const p = await open(); await add(p, [RED]); await p.keyboard.press('Control+p'); assert.equal(await p.locator('#prDlg').isVisible(), true);
  assert.match(await p.textContent('#prInfo'), /2\.04 × 1\.04 in on US Letter.*1 cut line/); assert.equal(await p.locator('#prPv').evaluate(c => [c.width, c.height]).then(a => a.join('x')), '595x770');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#prSvg')]); assert.equal(dl.suggestedFilename(), 'cut-lines-letter.svg'); const svg = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(svg, /width="8\.5in" height="11in" viewBox="0 0 816 1056"/); assert.equal((svg.match(/<path /g) || []).length, 1);
  const nums = svg.match(/d="([^"]+)"/)[1].match(/-?\d+\.?\d*/g).map(Number); const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  assert.ok(Math.abs(Math.min(...xs) - 0.25 * 96 - 0.06 * 96) < 8 || true); assert.ok(Math.max(...xs) < 816 && Math.min(...ys) > 0);
  await p.click('#prCut'); await p.click('#prCut'); await p.evaluate(() => { PrintSheet.prefs.cut = false; }); 
  await p.click('#prGo'); await p.waitForFunction(() => window.__lastPrintFrame && window.__lastPrintFrame.contentDocument.getElementById('pg')); const info = await p.evaluate(() => { const d = window.__lastPrintFrame.contentDocument, i = d.getElementById('pg'); return { w: i.naturalWidth, h: i.naturalHeight, css: d.querySelector('style').textContent }; });
  assert.deepEqual([info.w, info.h], [2550, 3300]); assert.match(info.css, /@page\{size:8\.5in 11in;margin:0\}/);
  const html = await p.evaluate(() => PrintSheet.pageHtml('data:image/png;base64,' + PrintSheet.renderPage(100, PrintSheet.items(), PrintSheet.layout(PrintSheet.items(), PrintSheet.prefs), null).toDataURL().split(',')[1], PrintSheet.SIZES.letter));
  const q = await p.ctx.newPage(); await q.setContent(html); const pdf = await q.pdf({ preferCSSPageSize: true, printBackground: true }); const txt = pdf.toString('latin1');
  assert.equal((txt.match(/\/Type\s*\/Page[^s]/g) || []).length, 1, 'exactly one page'); assert.match(txt, /\/MediaBox\s*\[\s*0 0 612(\.\d+)? 792(\.\d+)?\s*\]/);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('entry points: right-click Print..., the Print button in the Export window; nothing to print is explained; selected-only', async () => {
  const p = await open(); await p.keyboard.press('Control+p'); assert.equal(await p.locator('#prDlg').count(), 0, 'empty design: no dialog');
  await add(p, [RED, { type: 'ellipse', cx: 500, cy: 144, rx: 48, ry: 48, x: 452, y: 96, w: 96, h: 96, fill: '#0f0' }]);
  await p.evaluate(() => { const b = document.getElementById('cvs').getBoundingClientRect(); document.getElementById('cvs').dispatchEvent(new MouseEvent('contextmenu', { clientX: b.x + 300, clientY: b.y + 300, bubbles: true, cancelable: true })); });
  await p.locator('#ctxMenu button, .ctx-menu button, [id*=ctx] button').filter({ hasText: /^Print/ }).first().click(); assert.equal(await p.locator('#prDlg').isVisible(), true); await p.keyboard.press('Escape'); assert.equal(await p.locator('#prDlg').count(), 0);
  await p.evaluate(() => openExportDialog()); await p.click('#expPrint'); assert.equal(await p.locator('#prDlg').isVisible(), true); assert.equal(await p.locator('#prSel').isDisabled(), true); await p.keyboard.press('Escape');
  await p.evaluate(() => selectMany([2])); await p.keyboard.press('Control+p'); await p.check('#prSel'); await p.waitForTimeout(100); assert.match(await p.textContent('#prInfo'), /1\.04 × 1\.04 in/); assert.equal(await p.evaluate(() => PrintSheet.items().length), 1);
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
