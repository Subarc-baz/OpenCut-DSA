/* v6.10 Print sheet: print your design (stickers) from the app to any printer, with optional cut lines, and save the matching cut-line SVG.
   Real printing goes through the browser's print dialog (the operating system's printer drivers), not through any machine protocol.
   The page is drawn once at 300 dpi at exact paper size, so what the preview shows is what the printer gets (the printer's own margins aside).
   Cut lines are traced from what each sticker (an object or a group) looks like, optionally grown by an offset and with holes filled. */
(function () {
  'use strict';
  var MO = window.MaskOps, SIZES = { letter: { w: 8.5, h: 11, name: 'US Letter 8.5 × 11 in' }, a4: { w: 8.27, h: 11.69, name: 'A4 210 × 297 mm' } };
  var prefs = { paper: 'letter', margin: 0.25, scale: 100, shrink: true, center: false, selOnly: false, cut: true, offset: 0.04, outerOnly: true };
  var CUT_COLOR = '#ff00aa', CUT_DPI = 150;

  function items() {                                   /* the objects that will print, in stacking order */
    var sel = prefs.selOnly && selIds.length ? selIds : null;
    return objects.filter(function (o) { return !o.hidden && (!sel || sel.indexOf(o.id) >= 0); });
  }
  function stickers(list) {                            /* each group, or each lone object, is one sticker */
    var m = {}, out = [];
    list.forEach(function (o) { var k = o.gid ? 'g' + o.gid : 'o' + o.id; if (!m[k]) { m[k] = []; out.push(m[k]); } m[k].push(o); });
    return out;
  }
  function unionB(list) {
    var b = null; list.forEach(function (o) { var q = objBounds(o); if (!q || !isFinite(q.x)) return; if (!b) b = { x: q.x, y: q.y, x2: q.x + q.w, y2: q.y + q.h }; else { b.x = Math.min(b.x, q.x); b.y = Math.min(b.y, q.y); b.x2 = Math.max(b.x2, q.x + q.w); b.y2 = Math.max(b.y2, q.y + q.h); } });
    return b ? { x: b.x - 2, y: b.y - 2, w: b.x2 - b.x + 4, h: b.y2 - b.y + 4 } : null;
  }
  /* where the artwork lands on the page, in inches */
  function layout(list, o) {
    o = o || prefs; var P = SIZES[o.paper] || SIZES.letter, b = unionB(list); if (!b) return null;
    var pad = o.cut ? Math.max(0, +o.offset || 0) + 0.02 : 0, m = Math.max(0, +o.margin || 0), sc = Math.max(1, +o.scale || 100) / 100;
    var availW = P.w - 2 * m - 2 * pad, availH = P.h - 2 * m - 2 * pad, cw = b.w / 96 * sc, ch = b.h / 96 * sc, shrunk = false;
    if (o.shrink && (cw > availW || ch > availH)) { var f = Math.min(availW / cw, availH / ch); sc *= f; cw *= f; ch *= f; shrunk = true; }
    var ox = o.center ? (P.w - cw) / 2 : m + pad, oy = o.center ? (P.h - ch) / 2 : m + pad;
    return { paper: P, b: b, sc: sc, ox: ox, oy: oy, cw: cw, ch: ch, shrunk: shrunk, pad: pad, margin: m, fits: cw <= availW + 1e-6 && ch <= availH + 1e-6 };
  }
  /* design px -> page inches */
  function toPage(L, x, y) { return [L.ox + (x - L.b.x) / 96 * L.sc, L.oy + (y - L.b.y) / 96 * L.sc]; }

  /* ---------- cut lines ---------- */
  function fillHoles(m, w, h) {                        /* everything not reachable from the border becomes inside */
    var out = new Uint8Array(m), q = new Int32Array(w * h), qh = 0, qt = 0, seen = new Uint8Array(w * h), i, x, y;
    function push(k) { if (!seen[k] && !m[k]) { seen[k] = 1; q[qt++] = k; } }
    for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) { i = q[qh++]; x = i % w; y = (i - x) / w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
    for (i = 0; i < w * h; i++) if (!m[i] && !seen[i]) out[i] = 1;
    return out;
  }
  function cutLoops(list, L, o) {                      /* -> [[ [xIn,yIn] ... ]] closed loops in page inches */
    o = o || prefs; var loops = [], offPx = Math.round((+o.offset || 0) * CUT_DPI);
    stickers(list).forEach(function (grp) {
      var b = unionB(grp); if (!b) return;
      var padPx = offPx + 3, k = CUT_DPI / 96, w = Math.max(2, Math.ceil(b.w * k) + 2 * padPx), h = Math.max(2, Math.ceil(b.h * k) + 2 * padPx);
      if (w * h > 36e6) return;
      var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d', { willReadFrequently: true });
      x.setTransform(k, 0, 0, k, padPx - b.x * k, padPx - b.y * k); WandTool.drawObjects(x, grp);
      var d = x.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h), i; for (i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 8 ? 1 : 0;
      if (o.outerOnly) m = fillHoles(m, w, h); if (offPx > 0) m = MO.dilate(m, w, h, offPx);
      var paths = MO.maskToPaths(m, w, h, { eps: 0.8, smooth: true, minArea: 6 }); if (!paths) return;
      paths.forEach(function (P) { loops.push(P.map(function (p) { var dx = b.x + (p[0] - padPx) / k, dy = b.y + (p[1] - padPx) / k; return toPage(L, dx, dy); })); });
    });
    return loops;
  }

  /* ---------- the page ---------- */
  function renderPage(dpi, list, L, loops) {
    var P = L.paper, c = document.createElement('canvas'); c.width = Math.round(P.w * dpi); c.height = Math.round(P.h * dpi); var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    var k = dpi / 96 * L.sc; x.save(); x.setTransform(k, 0, 0, k, L.ox * dpi - L.b.x * k, L.oy * dpi - L.b.y * k); WandTool.drawObjects(x, list); x.restore();
    if (loops && loops.length) {
      x.strokeStyle = CUT_COLOR; x.lineWidth = Math.max(1, 0.012 * dpi); x.setLineDash([0.07 * dpi, 0.045 * dpi]); x.lineJoin = 'round';
      loops.forEach(function (Lp) { x.beginPath(); Lp.forEach(function (p, i) { if (i) x.lineTo(p[0] * dpi, p[1] * dpi); else x.moveTo(p[0] * dpi, p[1] * dpi); }); x.closePath(); x.stroke(); });
    }
    return c;
  }
  function cutSvg(L, loops) {
    var P = L.paper, s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.w + 'in" height="' + P.h + 'in" viewBox="0 0 ' + Math.round(P.w * 96 * 100) / 100 + ' ' + Math.round(P.h * 96 * 100) / 100 + '">\n<!-- cut lines in the same position as the printed sheet (96 units = 1 inch, paper ' + P.name + ') -->\n';
    loops.forEach(function (Lp, i) { s += '<path id="cut' + (i + 1) + '" fill="none" stroke="' + CUT_COLOR + '" stroke-width="1" d="' + Lp.map(function (p, j) { return (j ? 'L' : 'M') + (Math.round(p[0] * 96 * 100) / 100) + ' ' + (Math.round(p[1] * 96 * 100) / 100); }).join(' ') + ' Z"/>\n'; });
    return s + '</svg>\n';
  }
  function pageHtml(dataUrl, P) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>OpenCut DSA print</title><style>@page{size:' + P.w + 'in ' + P.h + 'in;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:' + P.w + 'in;height:' + P.h + 'in}</style></head><body><img id="pg" src="' + dataUrl + '"></body></html>';
  }
  function sendToPrinter(canvas, P) {
    var fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'; document.body.appendChild(fr);
    var d = fr.contentWindow.document; d.open(); d.write(pageHtml(canvas.toDataURL('image/png'), P)); d.close();
    var img = d.getElementById('pg'), go = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Could not open the print dialog: ' + (e && e.message || e)); } setTimeout(function () { fr.remove(); }, 60000); };
    if (img.complete) go(); else img.onload = go;
    window.__lastPrintFrame = fr;
  }

  /* ---------- dialog ---------- */
  var st = document.createElement('style');
  st.textContent = '#prDlg{position:fixed;inset:0;z-index:10000;background:rgba(6,10,24,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}#prDlg .box{background:var(--bg3,#12122a);border:1px solid var(--bdr2,#2c2c55);border-radius:14px;padding:18px;width:640px;max-width:96vw;max-height:94vh;overflow:auto;color:var(--txt,#e4eaf8);font:13px var(--ui,system-ui,sans-serif);display:flex;gap:16px;flex-wrap:wrap}'
    + '#prDlg h3{margin:0 0 8px;color:var(--portal,#44ff66);font-size:16px}#prDlg .col{flex:1;min-width:240px}#prDlg label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 0}#prDlg label.ck{justify-content:flex-start}'
    + '#prDlg input[type=number],#prDlg select{width:90px;padding:4px;background:#1c1c3a;border:1px solid #3a3a6a;color:#fff;border-radius:6px}#prDlg select{width:150px}#prDlg .info{margin:8px 0;color:#9a9ab8;min-height:3em;font-size:12px;line-height:1.45}#prDlg .warn{color:#ffb454}'
    + '#prDlg .pv{background:#e9ecf3;border-radius:6px;padding:6px;text-align:center}#prDlg canvas{max-width:100%;box-shadow:0 2px 10px rgba(0,0,0,.4);background:#fff}#prDlg .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}';
  document.head.appendChild(st);

  function openDialog() {
    if (document.getElementById('prDlg')) return;
    if (!items().length) { toast('Nothing to print yet'); return; }
    var hasSel = selIds.length > 0, o = document.createElement('div'); o.id = 'prDlg'; var b = document.createElement('div'); b.className = 'box'; o.appendChild(b);
    b.innerHTML = '<div class="col"><h3>Print sheet</h3>'
      + '<label>Paper<select id="prPaper"><option value="letter">US Letter 8.5 × 11 in</option><option value="a4">A4 210 × 297 mm</option></select></label>'
      + '<label>Printer margin (in)<input type="number" id="prMargin" min="0" max="2" step="0.05"></label>'
      + '<label>Size (%)<input type="number" id="prScale" min="5" max="500" step="5"></label>'
      + '<label class="ck"><input type="checkbox" id="prShrink"> Shrink to fit the page if too big</label>'
      + '<label class="ck"><input type="checkbox" id="prCenter"> Center on the page (otherwise top-left)</label>'
      + '<label class="ck" id="prSelRow"><input type="checkbox" id="prSel"> Selected objects only</label>'
      + '<label class="ck"><input type="checkbox" id="prCut"> Print cut lines around each sticker</label>'
      + '<label>Cut line offset (in)<input type="number" id="prOff" min="0" max="0.5" step="0.01"></label>'
      + '<label class="ck"><input type="checkbox" id="prOuter"> Outline only (fill holes, like a sticker)</label>'
      + '<div class="info" id="prInfo"></div></div>'
      + '<div class="col"><div class="pv"><canvas id="prPv"></canvas></div><div class="info">Dashed pink lines are the cut lines. A sticker is each object or group. Printers cannot print right to the paper edge.</div>'
      + '<div class="row"><button class="mbtn" id="prSvg" style="width:auto" title="Cut lines only, same position as the printed sheet">Save cut-line SVG</button><button class="mbtn" id="prCancel" style="width:auto">Cancel</button><button class="mbtn go" id="prGo" style="width:auto">Print…</button></div></div>';
    var $ = function (s) { return b.querySelector(s); };
    function load() { $('#prPaper').value = prefs.paper; $('#prMargin').value = prefs.margin; $('#prScale').value = prefs.scale; $('#prShrink').checked = prefs.shrink; $('#prCenter').checked = prefs.center; $('#prSel').checked = hasSel && prefs.selOnly; $('#prSel').disabled = !hasSel; $('#prSelRow').style.opacity = hasSel ? 1 : .5; $('#prCut').checked = prefs.cut; $('#prOff').value = prefs.offset; $('#prOuter').checked = prefs.outerOnly; }
    function read() { prefs.paper = $('#prPaper').value; prefs.margin = parseFloat($('#prMargin').value) || 0; prefs.scale = parseFloat($('#prScale').value) || 100; prefs.shrink = $('#prShrink').checked; prefs.center = $('#prCenter').checked; prefs.selOnly = $('#prSel').checked; prefs.cut = $('#prCut').checked; prefs.offset = parseFloat($('#prOff').value) || 0; prefs.outerOnly = $('#prOuter').checked; }
    var cache = { key: '', loops: null }, L = null, list = null;
    function refresh() {
      read(); list = items(); L = layout(list, prefs); var info = $('#prInfo'), go = $('#prGo'), svg = $('#prSvg');
      if (!L) { info.textContent = 'Nothing to print.'; go.disabled = svg.disabled = true; return; }
      var key = [prefs.paper, prefs.margin, prefs.scale, prefs.shrink, prefs.center, prefs.cut, prefs.offset, prefs.outerOnly, prefs.selOnly, sigObjs(list)].join('|');
      if (prefs.cut) { if (cache.key !== key) { cache.loops = cutLoops(list, L, prefs); cache.key = key; } } else { cache.loops = null; cache.key = ''; }
      var c = renderPage(70, list, L, prefs.cut ? cache.loops : null), pv = $('#prPv'); pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0);
      var m = L.margin, g = pv.getContext('2d'); g.save(); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(0,120,255,.55)'; g.strokeRect(m * 70, m * 70, c.width - 2 * m * 70, c.height - 2 * m * 70); g.restore();
      var msg = 'Artwork ' + (Math.round(L.cw * 100) / 100) + ' × ' + (Math.round(L.ch * 100) / 100) + ' in on ' + L.paper.name + (L.shrunk ? ' (shrunk to fit: ' + Math.round(L.sc * 100) + '%)' : '') + '. ' + (prefs.cut ? (cache.loops ? cache.loops.length : 0) + ' cut line(s).' : '');
      if (!L.fits) msg += ' <span class="warn">It is bigger than the printable area; the edges will be cut off. Enable Shrink to fit or lower Size.</span>';
      info.innerHTML = msg; go.disabled = false; svg.disabled = !prefs.cut || !(cache.loops && cache.loops.length);
    }
    function sigObjs(l) { return l.map(function (q) { return [q.id, q.x, q.y, q.w, q.h, q.cx, q.cy, q.rx, q.ry, q.r, q.fill, q.stroke, q.text, q.font, q.contours ? q.contours.length : '', q.pattern && q.pattern.sid].join(','); }).join(';'); }
    load(); b.querySelectorAll('input,select').forEach(function (i) { i.oninput = i.onchange = function () { setTimeout(refresh, 0); }; });
    function close() { o.remove(); document.removeEventListener('keydown', key, true); }
    function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', key, true); $('#prCancel').onclick = close; o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
    $('#prGo').onclick = function () { refresh(); if (!L) return; var c = renderPage(300, list, L, prefs.cut ? cache.loops : null); close(); sendToPrinter(c, L.paper); toast('Opening the print dialog… choose your printer and print at 100% (no "fit to page").'); };
    $('#prSvg').onclick = function () {
      refresh(); if (!L || !cache.loops) return; var a = document.createElement('a'), u = URL.createObjectURL(new Blob([cutSvg(L, cache.loops)], { type: 'image/svg+xml' })); a.href = u; a.download = 'cut-lines-' + (prefs.paper === 'a4' ? 'a4' : 'letter') + '.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000); toast('Saved the cut lines (same position as the print)');
    };
    document.body.appendChild(o); refresh();
  }
  window.PrintSheet = { open: openDialog, prefs: prefs, layout: layout, items: items, cutLoops: cutLoops, renderPage: renderPage, cutSvg: cutSvg, stickers: stickers, pageHtml: pageHtml, SIZES: SIZES };

  /* entry points: Ctrl+P and the Print button in the Export window (the right-click menu item is patched in tools/patch_core.py) */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) { if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf((e.target || {}).tagName) >= 0) return; e.preventDefault(); e.stopPropagation(); openDialog(); }
  }, true);
})();
