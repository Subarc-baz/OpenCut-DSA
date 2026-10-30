/* v6.7 PNG canvas: a second, transparent document of any size in inches (any DPI), next to the cutting mat.
   Same tools, same layers, same clipboard: copy on the PNG canvas, switch to the mat (or back), paste. The mat design is kept intact while a PNG canvas is open.
   Indicators: checkerboard (= transparent), orange dashed boundary and a "PNG CANVAS" bar with size, DPI, resize, export and "Back to mat". */
(function () {
  'use strict';
  var conn = document.getElementById('btnConn'); if (!conn || document.getElementById('btnPng')) return;
  var ws = document.querySelector('.workspace');
  var MAX_SIDE = 16000, MAX_PX = 100e6;
  window.__pngMode = false; window.__pngDpi = 300;
  var dpi = 300, chk = null;
  /* documents: docs[0] is always the cutting mat; every PNG canvas is another tab. The active document lives in the app's globals; the others are parked here. */
  var docs = [{ kind: 'mat', name: 'Mat', parked: null }], cur = 0, pngCount = 0;

  window.__paintChecker = function (c) {
    if (!chk) { var k = document.createElement('canvas'); k.width = k.height = 32; var x = k.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#d4d8e4'; x.fillRect(0, 0, 16, 16); x.fillRect(16, 16, 16, 16); chk = c.createPattern(k, 'repeat'); }
    c.fillStyle = chk; c.fillRect(0, 0, matW, matH);
  };
  function park() { return { objects: objects, matW: matW, matH: matH, undo: undoStack, redo: redoStack, zoom: zoom, panX: panX, panY: panY }; }
  function unpark(d) { objects = d.objects; matW = d.matW; matH = d.matH; undoStack = d.undo; redoStack = d.redo; }
  function activate(i) {
    if (i === cur || !docs[i]) return false;
    if (window.WandTool) WandTool.deselect(); selectMany([]);
    docs[cur].parked = park(); docs[cur].dpi = window.__pngDpi;
    var d = docs[i].parked; docs[i].parked = null; unpark(d); cur = i; window.__pngMode = docs[i].kind === 'png'; if (window.__pngMode) window.__pngDpi = docs[i].dpi || dpi;
    zoom = d.zoom; panX = d.panX; panY = d.panY; document.getElementById('stZoom').textContent = Math.round(zoom * 100) + '%';
    refreshLayers(); draw(); badge(); return true;
  }
  function create(wIn, hIn, d) {
    if (window.WandTool) WandTool.deselect(); selectMany([]);
    docs[cur].parked = park(); docs[cur].dpi = window.__pngDpi;
    pngCount++; docs.push({ kind: 'png', name: 'PNG ' + pngCount, dpi: d, parked: null }); cur = docs.length - 1;
    unpark({ objects: [], matW: wIn * 96, matH: hIn * 96, undo: [], redo: [] }); window.__pngMode = true; window.__pngDpi = d; dpi = d;
    zoomFit(); refreshLayers(); draw(); badge(); toast('New PNG canvas ' + wIn + ' x ' + hIn + ' in @ ' + d + ' dpi (transparent). Copy on another tab and paste here.');
  }
  function closeTab(i) {
    var d = docs[i]; if (!d || d.kind === 'mat') return;
    var n = (i === cur ? objects : d.parked.objects).length;
    if (n && !confirm('Close "' + d.name + '"? It has ' + n + ' object' + (n === 1 ? '' : 's') + ' that are not exported.')) return;
    if (i === cur) activate(0);
    var here = docs[cur]; docs.splice(docs.indexOf(d), 1); cur = docs.indexOf(here); badge();
  }
  function toMat() { activate(0); }
  function toPng() { for (var i = docs.length - 1; i > 0; i--) { activate(i); return; } }
  function openTab(i) { if (docs[i] && docs[i].kind === 'png' && cur !== i) activate(i); else if (i === 0) activate(0); }

  /* ---------- indicator bar ---------- */
  var bar = document.createElement('div'); bar.id = 'pngBar'; if (ws) ws.appendChild(bar);
  var st = document.createElement('style');
  st.textContent = '#docTabs{position:absolute;left:72px;top:2px;z-index:86;display:none;gap:4px;align-items:center;font:600 12px var(--ui,system-ui,sans-serif)}#docTabs .dt{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(42,51,80,.97);border:1px solid var(--chrome-line,#4a5a86);color:#e4eaf8;cursor:pointer;white-space:nowrap}#docTabs .dt.on{background:linear-gradient(135deg,#6dffa0,#b5ff3b);color:#04210f;border-color:transparent}#docTabs .dt.png{border-color:#ff9f1c}#docTabs .dt.png.on{background:#ff9f1c;color:#2a1800}#docTabs .dt i{font-style:normal;opacity:.7;padding:0 2px;border-radius:4px}#docTabs .dt i:hover{background:rgba(0,0,0,.2);opacity:1}#docTabs .add{padding:5px 9px;border-radius:8px;border:1px dashed #b6c2e0;background:rgba(42,51,80,.97);color:#e4eaf8;font:600 12px var(--ui,system-ui,sans-serif);cursor:pointer}'
    + '#pngBar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:86;display:none;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;background:rgba(60,38,6,.96);border:1px solid #ff9f1c;color:#ffe2b8;font:600 12px var(--ui,system-ui,sans-serif);box-shadow:0 8px 24px rgba(6,10,24,.45);white-space:nowrap}'
    + '#pngBar b{color:#ff9f1c;letter-spacing:.06em}#pngBar button{padding:4px 9px;border-radius:7px;border:1px solid rgba(255,159,28,.6);background:rgba(255,159,28,.15);color:#ffe2b8;font:600 11px var(--ui,system-ui,sans-serif);cursor:pointer}#pngBar button:hover{background:rgba(255,159,28,.35)}'
    + '#pngDlg{position:fixed;inset:0;z-index:10000;background:rgba(6,10,24,.6);display:flex;align-items:center;justify-content:center}#pngDlg .box{background:#12122a;border:1px solid #2c2c55;border-radius:12px;padding:18px;width:340px;color:#e4eaf8;font:13px var(--ui,system-ui,sans-serif)}'
    + '#pngDlg h3{margin:0 0 10px;color:#ff9f1c}#pngDlg label{display:flex;justify-content:space-between;align-items:center;margin:7px 0}#pngDlg input[type=number]{width:90px;padding:4px;background:#1c1c3a;border:1px solid #3a3a6a;color:#fff;border-radius:6px}'
    + '#pngDlg .pre{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}#pngDlg button{padding:5px 10px;border-radius:7px;border:1px solid #3a3a6a;background:#22224a;color:#e4eaf8;cursor:pointer;font-size:12px}#pngDlg button.go{background:#ff9f1c;color:#2a1800;border-color:#ff9f1c;font-weight:700}#pngDlg .info{margin:8px 0;color:#9a9ab8;min-height:2.6em}#pngDlg .err{color:#ff6b6b}';
  document.head.appendChild(st);
  function fmt(n) { return Math.round(n * 100) / 100; }
  var tabs = document.createElement('div'); tabs.id = 'docTabs'; if (ws) ws.appendChild(tabs);
  function drawTabs() {
    tabs.textContent = ''; tabs.style.display = docs.length > 1 ? 'flex' : 'none'; if (docs.length < 2) return;
    docs.forEach(function (d, i) {
      var t = document.createElement('div'); t.className = 'dt' + (d.kind === 'png' ? ' png' : '') + (i === cur ? ' on' : ''); t.dataset.i = i; t.dataset.kind = d.kind;
      var tw = i === cur ? matW : d.parked.matW, th = i === cur ? matH : d.parked.matH;
      t.appendChild(document.createTextNode((d.kind === 'png' ? '\u25A7 ' : '') + d.name + ' (' + fmt(tw / 96) + '\u00D7' + fmt(th / 96) + ' in)'));
      t.onclick = function () { activate(i); };
      if (d.kind === 'png') { var x = document.createElement('i'); x.textContent = '\u00D7'; x.title = 'Close this PNG canvas'; x.onclick = function (e) { e.stopPropagation(); closeTab(i); }; t.appendChild(x); }
      tabs.appendChild(t);
    });
    var a = document.createElement('button'); a.className = 'add'; a.id = 'docAdd'; a.textContent = '+ PNG'; a.title = 'New transparent PNG canvas'; a.onclick = function () { dialog(false); }; tabs.appendChild(a);
  }
  function badge() {
    drawTabs();
    bar.textContent = ''; bar.style.display = window.__pngMode ? 'flex' : 'none'; if (!window.__pngMode) return;
    function t(tx, tag) { var e = document.createElement(tag || 'span'); e.textContent = tx; bar.appendChild(e); return e; }
    t('PNG CANVAS', 'b'); t(fmt(matW / 96) + ' × ' + fmt(matH / 96) + ' in · ' + Math.round(matW / 96 * window.__pngDpi) + ' × ' + Math.round(matH / 96 * window.__pngDpi) + ' px @ ' + window.__pngDpi + ' dpi · transparent');
    var rs = t('Resize…', 'button'); rs.id = 'pngResize'; rs.onclick = function () { dialog(true); };
    var ex = t('Export PNG', 'button'); ex.id = 'pngExport'; ex.onclick = function () { exportPNG(); };
    var bk = t('⟵ Back to mat', 'button'); bk.id = 'pngBack'; bk.title = 'Return to the cutting mat (this PNG canvas is kept)'; bk.onclick = toMat;
  }

  /* ---------- size dialog ---------- */
  function dialog(resize) {
    if (document.getElementById('pngDlg')) return;
    var o = document.createElement('div'); o.id = 'pngDlg'; var b = document.createElement('div'); b.className = 'box'; o.appendChild(b);
    var cw = resize ? matW / 96 : 6, ch = resize ? matH / 96 : 4, cd = resize ? window.__pngDpi : dpi;
    b.innerHTML = '<h3>' + (resize ? 'Resize PNG canvas' : 'New transparent PNG canvas') + '</h3><div class="pre"></div>'
      + '<label>Width (in)<input type="number" id="pngW" min="0.1" step="0.25" value="' + cw + '"></label><label>Height (in)<input type="number" id="pngH" min="0.1" step="0.25" value="' + ch + '"></label><label>Resolution (dpi)<input type="number" id="pngD" min="10" max="1200" step="1" value="' + cd + '"></label>'
      + '<div class="info" id="pngInfo"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="pngCancel">Cancel</button><button class="go" id="pngGo"></button></div>';
    b.querySelector('#pngGo').textContent = resize ? 'Resize' : 'Create';
    var pre = b.querySelector('.pre'), W = b.querySelector('#pngW'), H = b.querySelector('#pngH'), D = b.querySelector('#pngD'), info = b.querySelector('#pngInfo'), go = b.querySelector('#pngGo');
    [['4 × 4', 4, 4], ['6 × 4', 6, 4], ['5 × 7', 5, 7], ['8.5 × 11', 8.5, 11], ['12 × 12', 12, 12]].forEach(function (p) { var x = document.createElement('button'); x.type = 'button'; x.textContent = p[0]; x.onclick = function () { W.value = p[1]; H.value = p[2]; chkv(); }; pre.appendChild(x); });
    function vals() { return { w: parseFloat(W.value), h: parseFloat(H.value), d: Math.round(parseFloat(D.value)) }; }
    function chkv() {
      var v = vals(), pw = v.w * v.d, ph = v.h * v.d, bad = '';
      if (!(v.w > 0 && v.h > 0 && v.d >= 10)) bad = 'Enter a width, height and dpi.'; else if (pw > MAX_SIDE || ph > MAX_SIDE || pw * ph > MAX_PX) bad = 'Too large for the browser (' + Math.round(pw) + ' × ' + Math.round(ph) + ' px). Lower the size or dpi.';
      info.className = 'info' + (bad ? ' err' : ''); info.textContent = bad || ('Exports at ' + Math.round(pw) + ' × ' + Math.round(ph) + ' px with a transparent background.'); go.disabled = !!bad; return !bad;
    }
    [W, H, D].forEach(function (i) { i.oninput = chkv; });
    function close() { o.remove(); document.removeEventListener('keydown', key, true); }
    function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter') { e.preventDefault(); go.click(); } }
    document.addEventListener('keydown', key, true);
    b.querySelector('#pngCancel').onclick = close;
    go.onclick = function () {
      if (!chkv()) return; var v = vals();
      if (resize) { pushUndo(); matW = v.w * 96; matH = v.h * 96; window.__pngDpi = dpi = v.d; zoomFit(); draw(); badge(); }
      else create(v.w, v.h, v.d);
      close();
    };
    o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
    document.body.appendChild(o); chkv(); W.focus(); W.select();
  }

  /* ---------- header button (added next to Mat; nothing existing moves) ---------- */
  var btn = document.createElement('button'); btn.className = 'hbtn'; btn.id = 'btnPng'; btn.textContent = '\u25A7 PNG';
  btn.title = 'New blank transparent PNG canvas of any size in inches. It opens in its own tab next to the mat; copy on one tab, paste on another.';
  btn.onclick = function () { dialog(false); };
  var anchor = document.getElementById('btnMat') || document.getElementById('btnUndo') || conn; anchor.parentNode.insertBefore(btn, anchor);
  var _b = badge; badge = function () { _b(); };

  /* cutting belongs to the mat */
  var hb = document.getElementById('btnCut'); if (hb) { var oc = hb.onclick; hb.onclick = function (e) { if (window.__pngMode) { toast('Switch back to the mat to cut. A PNG canvas is for pictures.'); return; } return oc && oc.call(this, e); }; }
  window.PngCanvas = { create: create, toMat: toMat, toPng: toPng, activate: activate, close: closeTab, dialog: dialog, count: function () { return docs.length - 1; }, tabs: function () { return docs.map(function (d) { return d.name; }); } };
  badge();
})();
