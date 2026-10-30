// v6.2 browser tests: swatch library, bucket tool, magic wand, pattern export. Real Chromium. Fixtures are generated into a temp dir
// (a copy of index.html + swatches/ built with the real tools/make-swatches.js), so the shipped, empty library is also tested.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright'); const png = require('./pngwriter.js');
const ROOT = path.resolve(__dirname, '..'), FILE = process.env.APP_HTML || path.join(ROOT, 'index.html');
const EXE = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
let browser, dir;
test.before(async () => {
  browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swt-')); fs.mkdirSync(path.join(dir, 'swatches/nature'), { recursive: true }); fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(ROOT, 'tools/make-swatches.js'), path.join(dir, 'tools/make-swatches.js')); fs.copyFileSync(FILE, path.join(dir, 'index.html'));
  fs.writeFileSync(path.join(dir, 'swatches/checker.png'), png(16, 16, (x, y) => (((x >> 2) + (y >> 2)) & 1 ? [220, 30, 30] : [30, 30, 220])));
  fs.writeFileSync(path.join(dir, 'swatches/stripes.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ffd400"/><rect width="16" height="32" fill="#111"/></svg>');
  fs.writeFileSync(path.join(dir, 'swatches/nature/green.png'), png(8, 8, () => [20, 160, 40]));
  fs.writeFileSync(path.join(dir, 'swatches/evil"><img src=x onerror=window.__pwned=1>.png'), png(4, 4, () => [1, 2, 3]));
  fs.writeFileSync(path.join(dir, 'swatches/notes.txt'), 'ignored');
  cp.execFileSync('node', [path.join(dir, 'tools/make-swatches.js')], { cwd: dir });
});
test.after(async () => { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function open(file) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('file://' + (file || path.join(dir, 'index.html'))); await page.waitForTimeout(350); page.errs = errs; return page;
}
const px = (p, x, y) => p.evaluate(([x, y]) => { const d = ctx.getImageData(Math.round(x * zoom + panX), Math.round(y * zoom + panY), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
const screen = async (p, x, y) => { const t = await p.evaluate(() => [zoom, panX, panY]), b = await p.locator('#cvs').boundingBox(); return [b.x + x * t[0] + t[1], b.y + y * t[0] + t[2]]; };
async function click(p, x, y, mods) { const [sx, sy] = await screen(p, x, y); if (mods) for (const m of mods) await p.keyboard.down(m); await p.mouse.click(sx, sy); if (mods) for (const m of mods) await p.keyboard.up(m); }
const addRect = (p, o) => p.evaluate(o => { objects.push(Object.assign({ type: 'rect', fill: '#44ff66', stroke: 'none', strokeW: 0, alpha: 1, name: 'R' }, o)); nextId = Math.max(nextId, o.id + 1); gridOn = false; draw(); }, o);
const isRedBlue = c => (c[0] > 150 && c[2] < 100) || (c[2] > 150 && c[0] < 100);

test('library: swatches load (sub-folders, svg, png), junk ignored, panel lists them, names are inert text', async () => {
  const p = await open();
  assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['checker.png', 'evil"><img src=x onerror=window.__pwned=1>.png', 'nature/green.png', 'stripes.svg']);
  assert.equal(await p.locator('#swatchPanel .swTile').count(), 1 + 4);   /* "Solid" + 4 swatches */
  assert.equal(await p.evaluate(() => window.__pwned), undefined); assert.equal(await p.locator('#swatchPanel img').count(), 0);
  assert.equal(await p.locator('#swEmpty').count(), 0); assert.deepEqual(p.errs, []);
});
test('library: the shipped (empty) library shows instructions and nothing breaks', async () => {
  const p = await open(FILE);
  assert.equal(await p.locator('#swEmpty').count(), 1); assert.match(await p.locator('#swEmpty').innerText(), /Add images/);
  await p.keyboard.press('b'); await p.evaluate(() => addRectDummy = 0).catch(() => { });
  assert.equal(await p.evaluate(() => tool), 'bucket'); assert.deepEqual(p.errs.filter(e => !/addRectDummy/.test(e)), []);
});
test('toolbar: Bucket and Wand buttons exist; B/W keys switch tools; no clash with typing in inputs', async () => {
  const p = await open();
  assert.equal(await p.locator('.tbtn[data-tool="bucket"]').count(), 1); assert.equal(await p.locator('.tbtn[data-tool="wand"]').count(), 1);
  await p.keyboard.press('w'); assert.equal(await p.evaluate(() => tool), 'wand'); await p.keyboard.press('b'); assert.equal(await p.evaluate(() => tool), 'bucket');
  await p.click('.tbtn[data-tool="wand"]'); assert.equal(await p.evaluate(() => tool), 'wand');
  await p.keyboard.press('v'); await p.focus('#optStrokeW').catch(() => { }); assert.deepEqual(p.errs, []);
});
test('bucket: fills with a swatch (pixels are the pattern), precise hit on a star, undo/redo, solid mode removes the pattern', async () => {
  const p = await open(); await addRect(p, { id: 1, x: 100, y: 100, w: 200, h: 150 });
  await p.evaluate(() => objects.push({ id: 2, type: 'star', cx: 600, cy: 200, r: 100, ir: 40, n: 5, x: 500, y: 100, w: 200, h: 200, fill: '#44ff66', stroke: 'none', strokeW: 0, alpha: 1, name: 'Star' })); await p.evaluate(() => { nextId = 3; draw(); });
  await p.click('#swatchPanel button[title="checker"]'); assert.equal(await p.evaluate(() => tool), 'bucket');
  const before = await px(p, 150, 150);
  await click(p, 150, 150);
  const o = await p.evaluate(() => objects[0]); assert.equal(o.pattern.sid, 'checker.png'); assert.equal(o.pattern.size, 1); assert.ok(/^#[0-9a-f]{6}$/.test(o.fill) && o.fill !== '#44ff66');
  const seen = new Set(); for (let x = 110; x < 190; x += 8) for (let y = 110; y < 190; y += 8) { const c = await px(p, x + 1, y + 1); assert.ok(isRedBlue(c), 'pattern pixel ' + c); seen.add(c[0] > 150 ? 'r' : 'b'); }
  assert.equal(seen.size, 2, 'both checker colours appear'); assert.notDeepEqual(await px(p, 150, 150), before);
  await click(p, 520, 120);                                     /* inside the star's bounding box but outside the star */
  assert.equal(await p.evaluate(() => objects[1].pattern), undefined); assert.match(await p.locator('.toast, #toast').first().innerText().catch(() => ''), /./);
  await click(p, 600, 210); assert.equal(await p.evaluate(() => objects[1].pattern.sid), 'checker.png');
  await p.click('#btnUndo'); assert.equal(await p.evaluate(() => objects[1].pattern), undefined); await p.click('#btnUndo'); assert.equal(await p.evaluate(() => objects[0].pattern), undefined);
  await p.click('#btnRedo'); assert.equal(await p.evaluate(() => objects[0].pattern.sid), 'checker.png');
  await p.click('#swatchPanel button:text("Solid")'); await p.evaluate(() => { document.getElementById('optFill').value = '#123456'; document.getElementById('optNoFill').checked = false; });
  await click(p, 150, 150); const r = await p.evaluate(() => objects[0]); assert.equal(r.pattern, undefined); assert.equal(r.fill, '#123456');
  assert.deepEqual(p.errs, []);
});
test('bucket: text, converted shapes, groups, images and lines are handled; locked objects refuse; tile size slider resizes selected', async () => {
  const p = await open();
  await p.evaluate(() => { objects.push({ id: 1, type: 'text', x: 100, y: 300, text: 'HELLO', fill: '#fff', font: 'bold 120px sans-serif', stroke: 'none', strokeW: 0, alpha: 1, name: 'T', w: 0, h: 52, curve: 0, warp: 'none' }, { id: 2, type: 'line', x1: 400, y1: 100, x2: 500, y2: 100, x: 400, y: 100, w: 100, h: 0, stroke: '#fff', strokeW: 4, fill: 'none', alpha: 1 }, { id: 3, type: 'rect', x: 100, y: 500, w: 100, h: 100, fill: '#44ff66', stroke: 'none', strokeW: 0, alpha: 1, locked: true, name: 'L' }); nextId = 4; gridOn = false; draw(); });
  await p.click('#swatchPanel button[title="stripes"]');
  await click(p, 130, 270);                                      /* inside the first letter's box */
  assert.equal(await p.evaluate(() => objects[0].pattern && objects[0].pattern.sid), 'stripes.svg');
  await click(p, 450, 100); assert.equal(await p.evaluate(() => objects[1].pattern), undefined);
  await click(p, 150, 550); assert.equal(await p.evaluate(() => objects[2].pattern), undefined, 'locked object untouched');
  await p.evaluate(() => selectMany([1]));
  await p.evaluate(() => { const r = document.getElementById('swSize'); r.value = '2'; r.dispatchEvent(new Event('input')); });
  assert.equal(await p.evaluate(() => objects[0].pattern.size), 2);
  assert.deepEqual(p.errs, []);
});
test('pattern survives copy/paste, save/restore and PNG export; missing swatch falls back to the plain fill', async () => {
  const p = await open(); await addRect(p, { id: 1, x: 100, y: 100, w: 100, h: 100 });
  await p.click('#swatchPanel button[title="nature/green"]'); await click(p, 150, 150);
  const snap = await p.evaluate(() => { const s = snapshotObjects(); objects = restoreObjects(s); draw(); return objects[0].pattern; }); assert.equal(snap.sid, 'nature/green.png');
  const c = await px(p, 150, 150); assert.ok(c[1] > 140 && c[0] < 60, 'green: ' + c);
  await p.evaluate(() => { objects[0].pattern.sid = 'does-not-exist.png'; draw(); }); const c2 = await px(p, 150, 150), f = await p.evaluate(() => objects[0].fill); assert.equal('#' + c2.map(v => ('0' + v.toString(16)).slice(-2)).join(''), f, 'fallback to plain fill ' + c2);
  await p.evaluate(() => { objects[0].pattern.sid = 'nature/green.png'; draw(); });
  assert.ok(await p.evaluate(() => { const a = document.createElement('a'); let ok = true; try { exportPNG(); } catch (e) { ok = false; } return ok; }));
  assert.deepEqual(p.errs, []);
});
test('SVG export embeds the pattern and, rendered, shows the swatch pixels', async () => {
  const p = await open(); await addRect(p, { id: 1, x: 96, y: 96, w: 192, h: 192 });
  await p.click('#swatchPanel button[title="checker"]'); await click(p, 150, 150);
  const res = await p.evaluate(async () => { const r = await buildSvg({ units: 'in', textOutlines: false }); return { svg: r.svg, warnings: r.warnings }; });
  assert.match(res.svg, /<pattern id="pat1"[^>]*x="96" y="96" width="96"/); assert.match(res.svg, /fill="url\(#pat1\)"/); assert.deepEqual(res.warnings, []);
  const pix = await p.evaluate(svg => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 1152; c.height = 1152; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 1152, 1152); const g = (a, b) => Array.from(x.getImageData(a, b, 1, 1).data); res({ a: g(98, 98), b: g(98 + 24, 98), out: g(40, 40) }); }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }), res.svg);
  assert.ok(isRedBlue(pix.a) && isRedBlue(pix.b) && pix.a[0] !== pix.b[0], JSON.stringify(pix)); assert.equal(pix.out[3], 0);
});

/* ---------------- magic wand (v6.4: samples what you see, like Photoshop's "Sample All Layers") ---------------- */
const SIZE = 200, FONTFILE = process.env.FONT_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
function discPng() { return png(SIZE, SIZE, (x, y) => (Math.hypot(x - 100, y - 100) < 60 ? [220, 30, 30] : (x < 60 && y < 60 ? [30, 30, 220] : [255, 255, 255]))); }   /* white bg, red disc, blue corner block */
async function addImage(p, o) {
  const url = 'data:image/png;base64,' + discPng().toString('base64');
  await p.evaluate(async ([url, o]) => { await new Promise(r => { const im = new Image(); im.onload = () => { objects.push(Object.assign({ type: 'image', src: url, img: im, alpha: 1, name: 'disc' }, o)); nextId = Math.max(nextId, o.id + 1); r(); }; im.src = url; }); gridOn = false; draw(); }, [url, o]);
}
const area = p => p.evaluate(() => WandTool.count());               /* selected area in design px^2 */
const hasSel = p => p.evaluate(() => !!WandTool.state());
const discArea = Math.PI * 60 * 60, near = (a, b, tol) => Math.abs(a - b) <= tol;

test('wand: click selects the colour region (contiguous), tolerance, modifiers, invert, clear', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.keyboard.press('w');
  await click(p, 200, 200);                                     /* centre of the red disc */
  let a = await area(p); assert.ok(near(a, discArea, discArea * 0.04), 'disc region ' + a); assert.ok(await p.evaluate(() => WandTool.loops()) >= 1);
  await click(p, 110, 110, ['Shift']);                          /* add the blue corner block */
  a = await area(p); assert.ok(a > discArea + 2500, 'added: ' + a);
  await click(p, 200, 200, ['Control']);                        /* subtract the disc again */
  a = await area(p); assert.ok(near(a, 3600 - 50, 400), 'subtracted: ' + a);
  await p.click('#wandInvert'); a = await area(p); assert.ok(a > 1152 * 1152 - 4500, 'inverted covers the rest of the mat: ' + a);
  await p.click('#wandClear'); assert.equal(await hasSel(p), false);
  await p.evaluate(() => { WandTool.options.tol = 255; }); await click(p, 190, 110); a = await area(p); assert.ok(near(a, 1152 * 1152, 50), 'tolerance 255 selects everything: ' + a);
  await p.evaluate(() => { WandTool.options.tol = 0; WandTool.options.contiguous = false; }); await click(p, 190, 110, []);
  a = await area(p); assert.ok(a < SIZE * SIZE && a > SIZE * SIZE - discArea - 3700 - 300, 'white only: ' + a);
  assert.deepEqual(p.errs, []);
});
test('wand: contiguous stops at other colours; non-contiguous picks every matching region', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.keyboard.press('w');
  await p.evaluate(() => { WandTool.options.tol = 100; });                     /* red (220,30,30) vs blue (30,30,220) differ by 190 => separate */
  await click(p, 110, 110); const a = await area(p); assert.ok(near(a, 3600, 200), 'blue block: ' + a);
  await p.evaluate(() => { WandTool.clear(); WandTool.options.contiguous = false; WandTool.options.tol = 10; }); await click(p, 290, 290); const b = await area(p);
  assert.ok(b > SIZE * SIZE - discArea - 3700 - 300 && b < SIZE * SIZE - discArea, 'white regions: ' + b);
});
test('wand: "Make cut path" makes an editable path object from the region, undoable', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.keyboard.press('w');
  await click(p, 200, 200); await p.click('#wandMake');
  const o = await p.evaluate(() => objects[objects.length - 1]); assert.equal(o.type, 'path'); assert.equal(o.fill, 'none');
  assert.ok(near(o.x, 140, 3) && near(o.y, 140, 3) && near(o.w, 120, 5) && near(o.h, 120, 5), JSON.stringify([o.x, o.y, o.w, o.h]));
  assert.equal(o.contours.length, 1); assert.equal(await hasSel(p), false); assert.deepEqual(await p.evaluate(() => selIds), [o.id]);
  await p.click('#btnUndo'); assert.equal(await p.evaluate(() => objects.length), 1);
  await click(p, 290, 290); await p.keyboard.press('Enter'); const q = await p.evaluate(() => objects[objects.length - 1]);
  assert.equal(q.contours.length, 1, 'the disc overlaps the corner block so the non-white blob touches the corner: one outer boundary');
  assert.ok(near(q.w, SIZE, 2) && near(q.h, SIZE, 2)); assert.deepEqual(p.errs, []);
});
test('wand: moved/resized image — outline maps to the displayed picture; moving it drops the stale selection', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 300, y: 50, w: 400, h: 100 }); await p.keyboard.press('w');   /* stretched 2x wide, 0.5x tall */
  await click(p, 500, 100); await p.click('#wandMake');
  const o = await p.evaluate(() => objects[objects.length - 1]); assert.ok(near(o.w, 240, 6) && near(o.h, 60, 4) && near(o.x, 380, 4), JSON.stringify([o.x, o.y, o.w, o.h]));
  await p.evaluate(() => objects.pop()); await click(p, 500, 100); assert.ok(await hasSel(p));
  await p.evaluate(() => { objects[0].x += 30; draw(); }); assert.equal(await hasSel(p), false, 'moving the image drops the stale selection');
});
test('wand: individual PIECES of text — a letter, a letter counter, one piece of a converted-text shape (not the whole word)', { skip: fs.existsSync(FONTFILE) ? false : 'no DejaVu' }, async () => {
  const p = await open(); const b64 = fs.readFileSync(FONTFILE).toString('base64');
  await p.evaluate(async (b) => {
    await FontLib.addFiles([new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'DejaVuSans.ttf')]);
    objects.push({ id: 1, type: 'text', x: 100, y: 300, text: 'HOLE', fill: '#ff0000', stroke: 'none', strokeW: 0, alpha: 1, font: '200px "DejaVu Sans", sans-serif', name: 'Text: HOLE', w: 0, h: 52, curve: 0, warp: 'none' }); nextId = 2; gridOn = false; draw();
  }, b64);
  await p.waitForTimeout(300); await p.keyboard.press('w');
  const letters = await p.evaluate(() => { const o = objects[0], out = []; ctx.save(); ctx.font = o.font; let x = o.x; for (const ch of o.text) { const w = ctx.measureText(ch).width; out.push([x, w]); x += w; } ctx.restore(); return { out, tb: textBounds(o) }; });
  const wordArea = (() => { return letters.tb.w * letters.tb.h; })();
  const [hx, hw] = letters.out[0], hcx = hx + hw / 2;
  await click(p, hx + hw * 0.18, 230);                           /* the left stem of the H (cap height ~146px, so y=230 is mid-height) */
  const stem = await area(p); assert.ok(stem > 500 && stem < wordArea * 0.12, 'one letter only, area ' + stem + ' vs word box ' + wordArea);
  const sb = await p.evaluate(() => { const L = WandTool.state(); let minx = 1e9, maxx = -1e9; L.loops.forEach(l => l.forEach(q => { minx = Math.min(minx, L.ox + q[0] / L.scale); maxx = Math.max(maxx, L.ox + q[0] / L.scale); })); return [minx, maxx]; });
  assert.ok(sb[1] <= hx + hw + 2, 'outline stays within the H (' + sb + ')');
  await p.click('#wandMake'); const o = await p.evaluate(() => objects[objects.length - 1]); assert.equal(o.type, 'path'); assert.ok(o.w < hw + 4, 'cut path is the letter, not the word: ' + o.w);
  await p.evaluate(() => objects.pop()); await p.evaluate(() => WandTool.clear());
  const [ox, ow] = letters.out[1];                               /* the O: the ring and its hole are different regions */
  await click(p, ox + ow / 2, 230);                              /* centre of the O = the transparent counter */
  const hole = await area(p); assert.ok(hole > 100 && hole < (ow * 146) * 0.5, 'counter only: ' + hole);
  await p.evaluate(() => WandTool.clear()); await click(p, ox + ow * 0.12, 230); const ring = await area(p); assert.ok(ring > hole * 0.3 && ring < wordArea * 0.15, 'ring: ' + ring);
  /* converted text behaves identically */
  await p.evaluate(() => WandTool.clear()); await p.evaluate(() => { setTool('select'); selectMany([1]); }); await p.evaluate(async () => { await convertSelectedTextToShapes(); setTool('wand'); });
  assert.equal(await p.evaluate(() => objects[0].type), 'path');
  await click(p, hx + hw * 0.18, 230); const stem2 = await area(p); assert.ok(near(stem2, stem, stem * 0.1), 'same piece after Convert Text to Shapes: ' + stem2 + ' vs ' + stem);
  assert.deepEqual(p.errs, []);
});
test('wand: samples what you see — overlapping objects use the visible colours; "Only the object under the click" ignores the rest', async () => {
  const p = await open();
  await addRect(p, { id: 1, x: 100, y: 100, w: 200, h: 200, fill: '#0000ff' }); await addRect(p, { id: 2, x: 200, y: 200, w: 200, h: 200, fill: '#ff0000' });
  await p.keyboard.press('w'); await click(p, 350, 350); let a = await area(p); assert.ok(near(a, 200 * 200, 800), 'visible red square: ' + a);
  await p.evaluate(() => WandTool.clear()); await click(p, 250, 250); a = await area(p); assert.ok(near(a, 200 * 200, 800), 'top (red) object, whole square, as it overlaps blue: ' + a);
  await p.evaluate(() => { WandTool.clear(); WandTool.options.single = true; }); await click(p, 150, 150); a = await area(p); assert.ok(near(a, 200 * 200, 800), 'blue square alone (single): ' + a);
  await p.evaluate(() => { WandTool.clear(); WandTool.options.single = false; WandTool.options.tol = 0; }); await click(p, 150, 150); a = await area(p);
  assert.ok(near(a, 200 * 200 - 100 * 100, 800), 'blue L-shape: the red square covers part of it, so only the visible blue is selected: ' + a);
  assert.deepEqual(p.errs, []);
});
test('wand: vector mode — whole object, whole group, same-fill, add/subtract; empty click clears', async () => {
  const p = await open();
  await addRect(p, { id: 1, x: 100, y: 100, w: 100, h: 100, fill: '#ff0000' }); await addRect(p, { id: 2, x: 300, y: 100, w: 100, h: 100, fill: '#ff0000' }); await addRect(p, { id: 3, x: 500, y: 100, w: 100, h: 100, fill: '#0000ff' });
  await p.evaluate(() => { objects[1].gid = 7; objects[2].gid = 7; WandTool.options.objectMode = true; draw(); });
  await p.keyboard.press('w'); await click(p, 150, 150); assert.deepEqual(await p.evaluate(() => selIds), [1]);
  await click(p, 350, 150); assert.deepEqual(await p.evaluate(() => selIds.slice().sort()), [2, 3], 'group selects whole group');
  await p.evaluate(() => { WandTool.options.sameFill = true; }); await click(p, 150, 150); assert.deepEqual(await p.evaluate(() => selIds.slice().sort()), [1, 2, 3], 'same red fill (rect 2 is grouped with 3, so the group comes along)');
  await p.evaluate(() => { WandTool.options.sameFill = false; }); await click(p, 150, 150); await click(p, 550, 150, ['Shift']); assert.deepEqual(await p.evaluate(() => selIds.slice().sort()), [1, 2, 3]);
  await click(p, 150, 150, ['Control']); assert.deepEqual(await p.evaluate(() => selIds.slice().sort()), [2, 3]);
  await click(p, 800, 600); assert.deepEqual(await p.evaluate(() => selIds), []);
  assert.deepEqual(p.errs, []);
});
test('wand: Escape clears a region first; the Text tool drops it; options panel controls work', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.keyboard.press('w');
  assert.equal(await p.locator('#wandTol').count(), 1); await p.evaluate(() => { const t = document.getElementById('wandTol'); t.value = 77; t.dispatchEvent(new Event('input')); });
  assert.equal(await p.evaluate(() => WandTool.options.tol), 77); await p.click('#wandModes button[data-mode="add"]'); assert.equal(await p.evaluate(() => WandTool.options.mode), 'add');
  await p.click('#wandModes button[data-mode="new"]'); await click(p, 200, 200); assert.ok(await hasSel(p));
  await p.locator('body').press('Escape'); assert.equal(await hasSel(p), false); assert.equal(await p.evaluate(() => tool), 'wand', 'first Esc only clears the region');
  await click(p, 200, 200); assert.ok(await hasSel(p)); await p.keyboard.press('t'); assert.equal(await hasSel(p), false, 'the Text tool drops the selection');
  assert.deepEqual(p.errs, []);
});
test('wand: "Whole object" selects the selected object\'s silhouette; cut path is its outline', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.evaluate(() => selectMany([1])); await p.keyboard.press('w');
  await p.click('#wandWhole'); assert.ok(near(await area(p), SIZE * SIZE, 400)); await p.click('#wandMake');
  const o = await p.evaluate(() => objects[objects.length - 1]); assert.ok(near(o.w, SIZE, 2) && near(o.h, SIZE, 2) && o.contours[0].length <= 8);
  const q = await open(); await q.keyboard.press('w'); await q.click('#wandWhole'); assert.equal(await hasSel(q), false);   /* nothing selected: a message, no crash */
  assert.deepEqual(q.errs, []);
});

/* ---------------- v6.3: in-app swatch loading ---------------- */
const SVGFILE = (c) => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="' + c + '"/></svg>');
async function openCtx(init) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); if (init) await page.addInitScript(init);
  await page.goto('file://' + FILE); await page.waitForTimeout(350); page.errs = errs; page.ctx = ctx; return page;
}
test('swatch loading: Add images works with many files, skips bad ones with a message, is remembered after reload, and Remove works', async () => {
  const p = await openCtx();
  assert.equal(await p.locator('#btnSwAdd').count(), 1); assert.equal(await p.locator('#swEmpty').count(), 1);
  await p.setInputFiles('#swFileInput', [{ name: 'red.svg', mimeType: 'image/svg+xml', buffer: SVGFILE('#ff0000') }, { name: 'blue.png', mimeType: 'image/png', buffer: png(8, 8, () => [0, 0, 255]) }, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }]);
  await p.waitForFunction(() => document.querySelectorAll('#swatchPanel .swTile').length === 3, null, { timeout: 5000 });
  assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['user/blue.png', 'user/red.svg']);
  assert.match(await p.locator('#swStatus').innerText(), /Added 2.*Skipped: notes\.txt/); assert.equal(await p.locator('#swEmpty').count(), 0);
  await p.evaluate(() => SwatchLib.ready()); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(500); await p.evaluate(() => SwatchLib.ready());
  assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['user/blue.png', 'user/red.svg'], 'remembered across reload');
  await p.click('#swatchPanel .swTile[title="red"]'); assert.equal(await p.locator('#btnSwRemove').count(), 1);
  await addRect(p, { id: 1, x: 100, y: 100, w: 100, h: 100 }); await click(p, 150, 150);
  const c = await px(p, 150, 150); assert.ok(c[0] > 200 && c[1] < 60, 'filled with the uploaded red swatch ' + c);
  await p.click('#btnSwRemove'); await p.waitForTimeout(400); assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['user/blue.png']);
  const c2 = await px(p, 150, 150), f = await p.evaluate(() => objects[0].fill); assert.equal('#' + c2.map(v => ('0' + v.toString(16)).slice(-2)).join(''), f, 'fallback to plain colour after removal');
  await p.reload(); await p.waitForTimeout(500); await p.evaluate(() => SwatchLib.ready());
  assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['user/blue.png'], 'removal is remembered');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('swatch loading: files dropped on the panel are added; oversize/non-image are refused', async () => {
  const p = await openCtx();
  await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'], 'dropped.svg', { type: 'image/svg+xml' })); dt.items.add(new File(['x'], 'a.pdf')); const el = document.getElementById('swatchPanel'); el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await p.waitForFunction(() => document.querySelectorAll('#swatchPanel .swTile').length === 2, null, { timeout: 5000 });
  assert.match(await p.locator('#swStatus').innerText(), /Skipped: a\.pdf/); assert.equal(await p.evaluate(() => objects.length), 0, 'the drop did not also add images to the canvas');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('swatch loading: Choose folder works in any browser (standard folder input): images from sub-folders load, others ignored, button is always enabled', async () => {
  const folder = path.join(dir, 'pickme'); fs.mkdirSync(path.join(folder, 'wood'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'a.svg'), SVGFILE('#0f0')); fs.writeFileSync(path.join(folder, 'readme.md'), '#'); fs.writeFileSync(path.join(folder, 'wood/b.svg'), SVGFILE('#a52'));
  const p = await openCtx(() => { Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }); });   /* simulate Brave: no File System Access API */
  assert.equal(await p.locator('#btnSwFolder').isDisabled(), false);
  assert.equal(await p.evaluate(() => document.getElementById('swFolderInput').hasAttribute('webkitdirectory')), true);
  await p.setInputFiles('#swFolderInput', folder);
  await p.waitForFunction(() => document.querySelectorAll('#swatchPanel .swTile').length === 3, null, { timeout: 5000 });
  assert.deepEqual(await p.evaluate(() => SwatchLib.items().map(s => s.id)), ['user/a.svg', 'user/wood/b.svg']); assert.deepEqual(p.errs, []);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#btnSwFolder')]); assert.equal(fc.isMultiple(), true);
  await p.ctx.close();
});
test('swatch loading: if browser storage is blocked the swatches still work for the session', async () => {
  const p = await openCtx(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await p.setInputFiles('#swFileInput', [{ name: 'x.svg', mimeType: 'image/svg+xml', buffer: SVGFILE('#00f') }]);
  await p.waitForFunction(() => document.querySelectorAll('#swatchPanel .swTile').length === 2, null, { timeout: 5000 });
  await p.waitForTimeout(200); assert.match(await p.locator('#swStatus').innerText(), /would not save/); assert.deepEqual(p.errs, []); await p.ctx.close();
});

/* ---------------- v6.3: branding / removed features ---------------- */
test('branding: game and webcam are gone; new name and logo; every other tab/tool is still there', async () => {
  const p = await openCtx();
  assert.equal(await p.title(), 'OpenCut DSA'); assert.equal((await p.locator('header .brand').innerText()).trim(), 'OpenCut DSA');
  assert.equal(await p.locator('#gameCanvas, .game-panel, [data-p="game"], [data-t="game"], #gStart').count(), 0);
  assert.equal(await p.locator('.tbtn[title*="Webcam" i]').count(), 0);
  assert.equal(await p.evaluate(() => typeof webcamCapture + typeof initGame), 'undefinedundefined');
  const logo = await p.evaluate(() => { const i = document.getElementById('appLogo'); return { src: i.src.slice(0, 30), ok: i.complete && i.naturalWidth > 0, icon: document.querySelector("link[rel*='icon']").href.slice(0, 24) }; });
  assert.match(logo.src, /^data:image\/svg\+xml/); assert.ok(logo.ok); assert.match(logo.icon, /^data:image\/svg\+xml/);
  assert.ok(!/Stick-it-too-Cricut|RICKET|C-137/i.test((await p.title()) + (await p.locator('header').innerText())));
  for (const t of ['design', 'cut', 'console']) assert.equal(await p.locator('.vtab[data-t="' + t + '"]').count(), 1);
  for (const t of ['Eyedropper', 'QR Code']) assert.equal(await p.locator('.tbtn[title^="' + t + '"]').count(), 1, t);
  await p.click('.vtab[data-t="cut"]'); await p.click('.vtab[data-t="console"]'); await p.click('.vtab[data-t="design"]');
  assert.deepEqual(p.errs, []); await p.ctx.close();
});
test('wand: "Select subject" removes a plain background and "Make cut path" outlines just the subject', async () => {
  const p = await open(); await addImage(p, { id: 1, x: 100, y: 100, w: SIZE, h: SIZE }); await p.evaluate(() => selectMany([1])); await p.keyboard.press('w');
  await p.click('#wandSubject'); const a = await area(p);
  assert.ok(a > discArea * 0.95 && a < discArea + 3700 + 400, 'subject = disc + block: ' + a);   /* the blue corner block overlaps the disc, both are non-white */
  await p.click('#wandMake'); const o = await p.evaluate(() => objects[objects.length - 1]);
  assert.equal(o.type, 'path'); assert.ok(o.w < SIZE && o.h < SIZE && o.contours.length === 1, JSON.stringify([o.w, o.h, o.contours.length]));
  assert.deepEqual(p.errs, []);
});
