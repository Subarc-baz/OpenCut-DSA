/* ============================================================
   FontLib (v6) — system fonts, uploaded fonts, and text -> cut-path conversion.
   - System fonts: Local Font Access API (window.queryLocalFonts). Chromium-family browsers only;
     it asks the user for permission; not verified in Brave. Face data is fetched lazily, only
     when outlines are needed.
   - Uploaded fonts (.ttf .otf .woff): registered with the FontFace API so the canvas can draw
     them, parsed with opentype.js for outlines, and stored in IndexedDB so they survive reloads.
   - Font names/metadata come from files and are untrusted: they are only ever inserted via
     textContent / value, never innerHTML.
   Depends on: opentype (vendor), TextPaths, and editor globals.
   ============================================================ */
(function () {
  'use strict';
  var TP = window.TextPaths, ot = window.opentype;
  var faces = [];                                   // {key,family,style,bold,italic,source,fd?,buffer?,parsed?,fontFace?,filename?}
  var state = { systemSupported: typeof window.queryLocalFonts === 'function', systemLoaded: false };
  var MAX_FILE = 40 * 1024 * 1024;
  var $ = function (id) { return document.getElementById(id); };

  function FontError(code, message) { var e = new Error(message); e.name = 'FontError'; e.code = code; return e; }

  /* ---------- IndexedDB (best effort; private windows may refuse) ---------- */
  function idb(fn) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('sitc_fonts', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('faces', { keyPath: 'key' }); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () { var db = rq.result; try { fn(db, function (v) { try { db.close(); } catch (e) { } res(v); }); } catch (e) { try { db.close(); } catch (e2) { } res(null); } };
      } catch (e) { res(null); }
    });
  }
  function dbPut(rec) { return idb(function (db, done) { var tx = db.transaction('faces', 'readwrite'); tx.objectStore('faces').put(rec); tx.oncomplete = function () { done(true); }; tx.onerror = function () { done(false); }; }); }
  function dbDelete(key) { return idb(function (db, done) { var tx = db.transaction('faces', 'readwrite'); tx.objectStore('faces').delete(key); tx.oncomplete = function () { done(true); }; tx.onerror = function () { done(false); }; }); }
  function dbAll() { return idb(function (db, done) { var rq = db.transaction('faces').objectStore('faces').getAll(); rq.onsuccess = function () { done(rq.result || []); }; rq.onerror = function () { done([]); }; }); }

  /* ---------- parsing ---------- */
  function sniff(buf) {
    var t = String.fromCharCode.apply(null, new Uint8Array(buf, 0, 4));
    if (t === 'wOF2') throw FontError('UNSUPPORTED_FORMAT', 'WOFF2 files cannot be converted to cut paths. Use the .ttf, .otf or .woff version of this font.');
    if (t === 'ttcf') throw FontError('UNSUPPORTED_FORMAT', 'TrueType Collections (.ttc) are not supported. Extract a single .ttf/.otf face from it.');
    return t;
  }
  function parseBuffer(buf) {
    sniff(buf);
    try { return ot.parse(buf); } catch (e) { throw FontError('PARSE_FAILED', 'This file is not a readable font (' + (e && e.message || e) + ').'); }
  }
  function ensureParsed(face) {
    if (face.parsed) return Promise.resolve(face.parsed);
    if (face._p) return face._p;
    face._p = Promise.resolve().then(function () {
      if (face.buffer) return face.buffer;
      if (face.fd && face.fd.blob) return face.fd.blob().then(function (b) { return b.arrayBuffer(); });
      throw FontError('NO_FONT_DATA', 'No font data is available for "' + face.family + '".');
    }).then(function (buf) { face.parsed = parseBuffer(buf); return face.parsed; })
      .catch(function (e) { face._p = null; throw (e && e.name === 'FontError') ? e : FontError('NO_FONT_DATA', 'Could not read the font data for "' + face.family + '": ' + (e && e.message || e)); });
    return face._p;
  }

  /* ---------- system fonts ---------- */
  function browserName() {
    var ua = navigator.userAgent || '';
    if (navigator.brave) return 'Brave'; if (/Firefox\//.test(ua)) return 'Firefox'; if (/Edg\//.test(ua)) return 'Edge'; if (/OPR\//.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua)) return 'Chrome'; if (/Safari\//.test(ua)) return 'Safari'; return 'this browser';
  }
  function unsupportedMessage() {
    var n = browserName();
    return n + ' does not provide the Local Font Access API, so it cannot list the fonts installed on your computer. Only Chrome and Edge (version 103 or newer, on a computer) offer it; Firefox and Safari do not, and Brave may block it. ' +
      'You can still use your fonts: click "Add font folder\u2026" and choose your fonts folder (Windows: C:\\Windows\\Fonts, or %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts for ones you installed; Mac: /Library/Fonts; Linux: /usr/share/fonts), or "Add font file(s)\u2026".';
  }
  function loadSystemFonts() {
    if (!state.systemSupported && typeof window.queryLocalFonts === 'function') state.systemSupported = true;
    if (!state.systemSupported) return Promise.reject(FontError('UNSUPPORTED', unsupportedMessage()));
    return Promise.resolve().then(function () { return window.queryLocalFonts(); }).then(function (list) {
      faces = faces.filter(function (f) { return f.source !== 'system'; });
      (list || []).forEach(function (fd) {
        var fl = TP.styleFlags(fd.style);
        faces.push({ key: 'system:' + (fd.postscriptName || fd.fullName), family: fd.family, style: fd.style || 'Regular', bold: fl.bold, italic: fl.italic, source: 'system', fd: fd });
      });
      if (!(list || []).length) throw FontError('NO_FONTS', 'The browser allowed access but returned 0 fonts (some privacy settings or managed computers do this). Use "Add font folder\u2026" or "Add font file(s)\u2026" instead.');
      state.systemLoaded = true; try { localStorage.setItem('sitc_sysfonts', '1'); } catch (e) { }
      refreshSelects(); return families('system').length;
    }, function (e) {
      var n = e && e.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') throw FontError('PERMISSION_DENIED', 'Permission to read installed fonts was denied. Allow "Fonts" for this site in the browser\'s site settings, then try again.');
      throw FontError('SYSTEM_FONTS_FAILED', 'Could not list installed fonts: ' + (e && e.message || e));
    });
  }

  /* ---------- uploads ---------- */
  function registerUpload(buf, filename, persist, bundled) {
    var font = parseBuffer(buf), nm = font.names || {};
    function pick(o) { return o ? (o.en || o[Object.keys(o)[0]]) : null; }
    var family = pick(nm.fontFamily) || String(filename || 'Uploaded font').replace(/\.[^.]+$/, ''), style = pick(nm.fontSubfamily) || 'Regular';
    var os2 = font.tables && font.tables.os2 || {}, weight = os2.usWeightClass || 400;
    var fl = TP.styleFlags(style); var italic = fl.italic || !!((os2.fsSelection || 0) & 1), bold = fl.bold || weight >= 600;
    var key = 'upload:' + family + '|' + style + '|' + (nm.postScriptName && pick(nm.postScriptName) || '');
    faces = faces.filter(function (f) { if (f.key === key) { if (f.fontFace) document.fonts.delete(f.fontFace); return false; } return true; });
    var ff = new FontFace(family, buf.slice(0), { weight: String(bold ? Math.max(weight, 700) : Math.min(weight, 500)), style: italic ? 'italic' : 'normal' });
    return ff.load().then(function () {
      document.fonts.add(ff);
      var face = { key: key, family: family, style: style, bold: bold, italic: italic, source: 'upload', buffer: buf, parsed: font, fontFace: ff, filename: filename, bundled: !!bundled };
      faces.push(face);
      if (persist !== false && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });   /* ask the browser not to evict remembered fonts */
      if (persist !== false) dbPut({ key: key, family: family, style: style, bold: bold, italic: italic, filename: filename, buffer: buf }).then(function (ok) { if (!ok) state.storageFailed = true; });
      return face;
    });
  }
  function addFiles(files, onProgress) {
    var added = [], errors = [], total = (files || []).length, done = 0;
    return Array.prototype.reduce.call(files || [], function (p, file) {
      return p.then(function () {
        if (onProgress) onProgress(++done, total);
        if (file.size > MAX_FILE) { errors.push(file.name + ': file is larger than 40 MB.'); return; }
        return file.arrayBuffer().then(function (buf) { return registerUpload(buf, file.name, true); })
          .then(function (f) { added.push(f); }, function (e) { errors.push(file.name + ': ' + (e && e.message || e)); });
      });
    }, Promise.resolve()).then(function () { refreshSelects(); return { added: added, errors: errors }; });
  }
  function removeFace(face) {
    if (face.source !== 'upload') return Promise.resolve();
    if (face.fontFace) document.fonts.delete(face.fontFace);
    faces = faces.filter(function (f) { return f !== face; }); refreshSelects();
    return dbDelete(face.key);
  }
  function restore() {
    return dbAll().then(function (recs) {
      return (recs || []).reduce(function (p, r) { return p.then(function () { return registerUpload(r.buffer, r.filename, false).catch(function () { }); }); }, Promise.resolve());
    }).then(function () {
      refreshSelects();
      return loadBundle();
    }).then(function () {
      var want = false; try { want = localStorage.getItem('sitc_sysfonts') === '1'; } catch (e) { }
      if (want && state.systemSupported && navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'local-fonts' }).then(function (st) { if (st.state === 'granted') return loadSystemFonts(); }).catch(function () { });
      }
    });
  }

  /* ---------- fonts folder bundle (works when index.html is simply double-clicked) ----------
     A web page opened from a folder cannot list or read that folder, but it CAN load a script file that sits next to it (the Swatch Library does the same).
     "Save fonts to app folder" writes fonts-bundle.js from the fonts you added; put it in the fonts folder next to index.html and they load every time,
     whatever the browser does with its stored data. */
  function b64ToBuf(b64) { var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function bufToB64(buf) { var u = new Uint8Array(buf), out = [], CH = 0x8000; for (var i = 0; i < u.length; i += CH) out.push(String.fromCharCode.apply(null, u.subarray(i, i + CH))); return btoa(out.join('')); }
  function loadBundle() {
    var list = window.FONT_BUNDLE; if (!list || !list.length) return Promise.resolve(0);
    var n = 0;
    return list.reduce(function (p, it) {
      return p.then(function () { try { return registerUpload(b64ToBuf(it.d), it.n, false, true).then(function () { n++; }, function () { }); } catch (e) { } });
    }, Promise.resolve()).then(function () { state.bundleCount = n; state.bundleTotal = list.length; refreshSelects(); return n; });
  }
  function saveBundle() {
    var fs = faces.filter(function (f) { return f.source === 'upload' && f.buffer; });
    if (!fs.length) return { ok: false, msg: 'Add some fonts first (Add font file(s) or Add font folder), then save them.' };
    var total = fs.reduce(function (a, f) { return a + f.buffer.byteLength; }, 0);
    if (total > 160 * 1024 * 1024) return { ok: false, msg: 'These fonts add up to ' + Math.round(total / 1048576) + ' MB, which is too much to load at every start. Remove some (limit about 160 MB) and try again.' };
    var parts = ['/* OpenCut DSA fonts bundle. Put this file in the "fonts" folder next to index.html. Generated ' + new Date().toISOString() + ' */\nwindow.FONT_BUNDLE=['], seen = {};
    fs.forEach(function (f) { var nm = f.filename || (f.family + '.ttf'); if (seen[f.key]) return; seen[f.key] = 1; parts.push(JSON.stringify({ n: nm, d: bufToB64(f.buffer) }) + ',\n'); });
    parts.push('];\n');
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob(parts, { type: 'text/javascript' })); a.href = url; a.download = 'fonts-bundle.js'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return { ok: true, n: Object.keys(seen).length, mb: Math.round(total / 104857.6) / 10 };
  }

  /* ---------- lookup / outlines ---------- */
  function families(source) {
    var m = {}; faces.forEach(function (f) { if (!source || f.source === source) m[f.family] = 1; });
    return Object.keys(m).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  }
  function findFace(fontStr) {
    var f = TP.parseFontString(fontStr);
    if (f.generic) throw FontError('GENERIC_FAMILY', '"' + f.family + '" is a generic family, not a specific font file. Choose a specific font (Fonts…) before converting text to paths.');
    var m = TP.matchFace(faces, f.family, f.bold, f.italic);
    if (!m) throw FontError('NO_FONT_DATA', 'No font data for "' + f.family + '". Use Fonts… to load system fonts or add the font file.');
    return m;
  }
  /* -> {contours:[{points,closed}], exact:bool, face} ; contours in editor pixels */
  function outlineText(o) {
    return Promise.resolve().then(function () {
      var f = TP.parseFontString(o.font), m = findFace(o.font);
      return ensureParsed(m.face).then(function (font) {
        var glyphs = textHasEffect(o) ? textGlyphs(o).glyphs : null;
        var measure = function (str) { ctx.save(); ctx.font = o.font || 'bold 48px sans-serif'; var w = ctx.measureText(str).width; ctx.restore(); return w; };
        var cont = TP.textContours(font, o, { size: f.size, glyphs: glyphs, measure: measure });
        if (isRot(o)) {                                            /* v6.13: text rotation is applied to the outlines (export, cut job, convert to shapes) */
          var a = rotRad(o), cs = Math.cos(a), sn = Math.sin(a), rc = rotCenter(o);
          var rp = function (q) { var dx = q[0] - rc.x, dy = q[1] - rc.y; return [rc.x + dx * cs - dy * sn, rc.y + dx * sn + dy * cs]; };
          cont = cont.map(function (c) { return c && c.points ? Object.assign({}, c, { points: c.points.map(rp) }) : c.map(rp); });
        }
        return { contours: cont, exact: m.exact, face: m.face };
      });
    });
  }

  function convertSelectedTextToShapes(perLetter) {
    perLetter = perLetter === true;
    var texts = selectedObjects().filter(function (t) { return t.type === 'text' && !t.locked; });
    if (!texts.length) { toast('Select a text object first'); return Promise.resolve(0); }
    var jobs = texts.map(function (t) { return outlineText(t).then(function (r) { return { t: t, r: r }; }, function (e) { return { t: t, err: e }; }); });
    return Promise.all(jobs).then(function (res) {
      var ok = res.filter(function (x) { return x.r && x.r.contours.length; }), bad = res.filter(function (x) { return !x.r || !x.r.contours.length; });
      if (!ok.length) { var msg = bad[0] && bad[0].err ? bad[0].err.message : 'Nothing to convert (empty text?).'; toast(msg.slice(0, 160)); if (window.__machine) __machine.log('ERROR ' + msg, 'err'); return 0; }
      pushUndo(); var ids = [];
      ok.forEach(function (x) {
        var t = x.t, g = TP.makePathGeometry(x.r.contours), idx = objects.indexOf(t); if (!g || idx < 0) return;
        if (perLetter) {                                           /* one grouped object per connected piece (letter; the dot of an i is its own piece) */
          var polys = x.r.contours.map(function (c) { return c.points ? c : { points: c, closed: true }; }), pcs = TP.splitPieces(polys), gid = nextGid(), made = [];
          pcs.forEach(function (pc) { pc.minX = Math.min.apply(null, [].concat.apply([], pc.map(function (ci) { return polys[ci].points.map(function (q) { return q[0]; }); }))); });
          pcs.sort(function (a, b) { return a.minX - b.minX; });
          pcs.forEach(function (pc, n) {
            var gg = TP.makePathGeometry(pc.map(function (ci) { return polys[ci]; })); if (!gg) return;
            var lo = { id: nextId++, type: 'path', name: 'Letter ' + (n + 1) + ': ' + String(t.text || '').slice(0, 10), fill: (t.fill && t.fill !== 'none') ? t.fill : (t.stroke && t.stroke !== 'none' ? t.stroke : '#ffffff'),
              stroke: t.stroke && t.stroke !== 'none' ? t.stroke : 'none', strokeW: t.stroke && t.stroke !== 'none' ? (t.strokeW || 1) : 0, alpha: t.alpha == null ? 1 : t.alpha };
            Object.assign(lo, gg); made.push(lo);
          });
          if (!made.length) return; if (made.length > 1) made.forEach(function (m) { m.gid = gid; });
          objects.splice.apply(objects, [idx, 1].concat(made)); made.forEach(function (m) { ids.push(m.id); });
          if (!x.r.exact) toast('Note: "' + (t.text || '').slice(0, 12) + '" uses a bold/italic style this font family lacks as a separate file; the shapes use the closest face.');
          return;
        }
        var po = { id: nextId++, type: 'path', name: 'Shapes: ' + String(t.text || '').slice(0, 15), fill: (t.fill && t.fill !== 'none') ? t.fill : (t.stroke && t.stroke !== 'none' ? t.stroke : '#ffffff'),
          stroke: t.stroke && t.stroke !== 'none' ? t.stroke : 'none', strokeW: t.stroke && t.stroke !== 'none' ? (t.strokeW || 1) : 0, alpha: t.alpha == null ? 1 : t.alpha };
        if (t.gid) po.gid = t.gid;
        Object.assign(po, g); objects[idx] = po; ids.push(po.id);
        if (!x.r.exact) toast('Note: "' + (t.text || '').slice(0, 12) + '" uses a bold/italic style this font family lacks as a separate file; the shapes use the closest face.');
      });
      selectMany(ids); draw();
      toast((perLetter ? 'Converted to ' + ids.length + ' grouped letter object' + (ids.length > 1 ? 's' : '') : 'Converted ' + ids.length + ' text object' + (ids.length > 1 ? 's' : '') + ' to shapes') + (bad.length ? ' (' + bad.length + ' skipped: ' + (bad[0].err ? bad[0].err.message : 'empty').slice(0, 80) + ')' : ''));
      return ids.length;
    });
  }
  window.convertSelectedTextToShapes = function () { return convertSelectedTextToShapes(); };

  /* ---------- dropdown integration ---------- */
  function refreshSelects() {
    [$('optFont'), $('stTextFont')].forEach(function (sel) {
      if (!sel) return;
      var prev = sel.value;
      Array.prototype.slice.call(sel.querySelectorAll('optgroup[data-fl], option[data-ph]')).forEach(function (g) { g.remove(); });
      /* v6.8: the built-in entries (Sans-serif, Arial, Serif, Georgia, Monospace, Courier New, Cursive, Impact) are only browser fallbacks with no font file behind them,
         so text in them cannot be converted to shapes. Only fonts the app really has are listed. */
      Array.prototype.slice.call(sel.children).forEach(function (n) { if (n.tagName === 'OPTION') n.remove(); });
      [['System fonts', 'system'], ['Added fonts', 'upload']].forEach(function (grp) {
        var fam = families(grp[1]); if (!fam.length) return;
        var og = document.createElement('optgroup'); og.label = grp[0] + ' (' + fam.length + ')'; og.setAttribute('data-fl', '1');
        fam.forEach(function (name) { var op = document.createElement('option'); op.value = TP.cssFamily(name); op.textContent = name; og.appendChild(op); });
        sel.appendChild(og);
      });
      var usable = sel.querySelectorAll('optgroup[data-fl] option');
      if (!usable.length) { var ph = document.createElement('option'); ph.value = ''; ph.disabled = true; ph.selected = true; ph.setAttribute('data-ph', '1'); ph.textContent = 'No fonts yet \u2013 click Fonts\u2026'; sel.insertBefore(ph, sel.firstChild); }
      else { sel.value = prev; if (sel.selectedIndex < 0 || !sel.value) sel.selectedIndex = Array.prototype.indexOf.call(sel.options, usable[0]); }
    });
    document.dispatchEvent(new CustomEvent('fontlib:change'));
  }

  /* ---------- dialog ---------- */
  function openDialog() {
    if ($('fontsDialog')) return;
    var ov = document.createElement('div'); ov.id = 'fontsDialog';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(8px)';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg3);border:1px solid var(--bdr2);border-radius:16px;padding:22px;width:560px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;gap:10px;color:var(--txt)';
    function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    var h = el('div', 'font:700 16px var(--ui);color:var(--portal)', 'Fonts');
    var status = el('div', 'font-size:12px;line-height:1.5;color:var(--dim);min-height:36px');
    var row = el('div', 'display:flex;gap:8px;flex-wrap:wrap');
    var bSys = el('button', '', 'Load system fonts'); bSys.className = 'mbtn'; bSys.style.width = 'auto'; bSys.id = 'btnLoadSystemFonts';
    var bAdd = el('button', '', 'Add font file(s)…'); bAdd.className = 'mbtn'; bAdd.style.width = 'auto'; bAdd.id = 'btnAddFontFiles';
    var bSave = el('button', '', 'Save fonts to app folder\u2026'); bSave.className = 'mbtn'; bSave.style.width = 'auto'; bSave.id = 'btnSaveFontBundle'; bSave.title = 'Creates fonts-bundle.js from the fonts you added. Put it in the fonts folder next to index.html and they load every time you open the app.';
    var bDir = el('button', '', 'Add font folder\u2026'); bDir.className = 'mbtn'; bDir.style.width = 'auto'; bDir.id = 'btnAddFontFolder'; bDir.title = 'Pick a folder of fonts (e.g. C:\\Windows\\Fonts); .ttf .otf .woff files are added';
    var dir = document.createElement('input'); dir.type = 'file'; dir.multiple = true; dir.setAttribute('webkitdirectory', ''); dir.style.display = 'none'; dir.id = 'fontFolderInput';
    var file = document.createElement('input'); file.type = 'file'; file.multiple = true; file.accept = '.ttf,.otf,.woff'; file.style.display = 'none'; file.id = 'fontFileInput';
    var search = document.createElement('input'); search.placeholder = 'Search fonts…'; search.className = 'sinput'; search.style.cssText = 'width:100%'; search.id = 'fontSearch';
    var list = el('div', 'overflow-y:auto;min-height:120px;max-height:40vh;border:1px solid var(--bdr);border-radius:8px;padding:6px'); list.id = 'fontList';
    var note = el('div', 'font-size:10.5px;line-height:1.5;color:var(--dim)', 'Installed fonts need your browser\'s permission (Chromium-based browsers only). Added fonts (.ttf .otf .woff) are stored in this browser. Text can only be converted to cut paths when the font file is available.');
    var close = el('button', '', 'Close'); close.className = 'mbtn'; close.style.width = 'auto'; close.style.alignSelf = 'flex-end';
    row.appendChild(bSys); row.appendChild(bAdd); row.appendChild(bDir); row.appendChild(bSave); row.appendChild(file); row.appendChild(dir);
    [h, status, row, search, list, note, close].forEach(function (c) { box.appendChild(c); }); ov.appendChild(box); document.body.appendChild(ov);

    function say(msg, bad) { status.textContent = msg; status.style.color = bad ? 'var(--red)' : 'var(--dim)'; }
    function render() {
      var q = search.value.trim().toLowerCase(); list.textContent = '';
      var rows = {}; faces.forEach(function (f) { var k = f.source + (f.bundled ? 'B' : '') + '|' + f.family; (rows[k] = rows[k] || { family: f.family, source: f.source, bundled: !!f.bundled, faces: [] }).faces.push(f); });
      var keys = Object.keys(rows).filter(function (k) { return !q || rows[k].family.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return rows[a].family.toLowerCase() < rows[b].family.toLowerCase() ? -1 : 1; }).slice(0, 400);
      if (!keys.length) list.appendChild(el('div', 'color:var(--dim);font-size:12px;padding:8px', faces.length ? 'No matching fonts.' : 'No extra fonts loaded yet.'));
      keys.forEach(function (k) {
        var r = rows[k], line = el('div', 'display:flex;align-items:center;gap:8px;padding:3px 4px');
        var nm = el('span', 'flex:1;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', r.family); nm.style.fontFamily = TP.cssFamily(r.family); nm.title = r.family;
        line.appendChild(nm); line.appendChild(el('span', 'font:10px var(--mono);color:var(--dim)', r.source === 'system' ? 'system · ' + r.faces.length : (r.bundled ? 'fonts folder · ' : 'added · ') + r.faces.length));
        if (r.source === 'upload' && !r.bundled) { var rm = el('button', 'padding:2px 8px', 'Remove'); rm.className = 'hbtn'; rm.onclick = function () { Promise.all(r.faces.map(removeFace)).then(function () { render(); say('Removed ' + r.family + '.'); }); }; line.appendChild(rm); }
        list.appendChild(line);
      });
    }
    function initialStatus() {
      if (state.bundleCount) { say(state.bundleCount + ' font file(s) load automatically from the fonts folder (fonts-bundle.js).' + (state.systemSupported && !state.systemLoaded ? ' System fonts: click "Load system fonts" to add more.' : '')); bSys.disabled = false; return; }
      say(state.systemLoaded ? families('system').length + ' system font families loaded.' : state.systemSupported ? 'System fonts not loaded yet. Click "Load system fonts" and allow access when the browser asks.' : unsupportedMessage(), !state.systemSupported && !state.systemLoaded);
      bSys.disabled = false;
    }
    bSys.onclick = function () { say('Waiting for permission…'); loadSystemFonts().then(function (n) { say(n + ' system font families loaded. Pick them in any Font dropdown.'); render(); }, function (e) { say(e.message, true); }); };
    bSave.onclick = function () {
      say('Preparing fonts-bundle.js\u2026'); setTimeout(function () {
        var r = saveBundle(); if (!r.ok) { say(r.msg, true); return; }
        say('Saved fonts-bundle.js (' + r.n + ' font file(s), ' + r.mb + ' MB). Move it into the "fonts" folder next to index.html (replace the old one if there is one), then reopen the app. Those fonts will then load every time.');
      }, 30);
    };
    bAdd.onclick = function () { file.click(); };
    bDir.onclick = function () { dir.click(); };
    dir.onchange = function () {
      var all = Array.prototype.slice.call(dir.files || []), ok = all.filter(function (f) { return /\.(ttf|otf|woff)$/i.test(f.name); }), skipped = all.length - ok.length, capped = ok.length > 300;
      if (capped) ok = ok.slice(0, 300); dir.value = '';
      if (!ok.length) { say('No usable fonts in that folder (need .ttf, .otf or .woff; .ttc collections and .woff2 are not supported).', true); return; }
      say('Adding ' + ok.length + ' fonts\u2026 0/' + ok.length);
      addFiles(ok, function (n, t) { say('Adding fonts\u2026 ' + n + '/' + t); }).then(function (r) {
        render(); setTimeout(function () { if (state.storageFailed) say('Your browser would not store these fonts, so they will be gone next time. Click "Save fonts to app folder\u2026" and put the file in the fonts folder to keep them.', true); }, 600); say('Added ' + r.added.length + ' font file(s)' + (skipped ? '; ' + skipped + ' other file(s) ignored (.ttc, .woff2, etc.)' : '') + (capped ? '; stopped at 300 fonts' : '') + '. ' + r.errors.slice(0, 3).join(' ') + (r.errors.length > 3 ? ' (+' + (r.errors.length - 3) + ' more problems)' : ''), r.errors.length > 0 && !r.added.length);
      });
    };
    file.onchange = function () { addFiles(file.files).then(function (r) { render(); setTimeout(function () { if (state.storageFailed) say('Your browser would not store these fonts, so they will be gone next time. Click "Save fonts to app folder\u2026" and put the file in the fonts folder to keep them.', true); }, 600); say((r.added.length ? 'Added ' + r.added.length + ' font file(s). ' : '') + r.errors.join(' '), r.errors.length > 0 && !r.added.length); file.value = ''; }); };
    search.oninput = render;
    function shut() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); shut(); } }
    document.addEventListener('keydown', onKey, true); close.onclick = shut; ov.onclick = function (e) { if (e.target === ov) shut(); };
    initialStatus(); render(); bSys.focus();
  }

  /* ---------- buttons next to the font dropdowns + convert button in the text panel ---------- */
  function addButtons() {
    [$('optFont'), $('stTextFont')].forEach(function (sel) {
      if (!sel || sel.parentNode.querySelector('.fl-btn')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hbtn fl-btn'; b.textContent = 'Fonts…'; b.title = 'Load system fonts or add font files';
      b.style.cssText = 'padding:3px 8px;font-size:11px;flex:none;margin-left:4px'; b.onclick = openDialog; sel.parentNode.insertBefore(b, sel.nextSibling);
    });
    var panel = $('textPropertiesPanel'), body = panel && panel.querySelector('.spanel-body');
    if (body && !$('btnTextToShapes')) {
      var c = document.createElement('button'); c.type = 'button'; c.id = 'btnTextToShapes'; c.className = 'mbtn'; c.textContent = 'Convert text to shapes';
      c.title = 'Turns this text into editable, cuttable outlines (needs the font file: see Fonts…)'; c.style.cssText = 'margin-top:8px;padding:6px;font-size:11px'; c.onclick = function () { convertSelectedTextToShapes(); }; body.appendChild(c);
    }
    if (body && !$('btnTextToLetters')) {
      var l = document.createElement('button'); l.type = 'button'; l.id = 'btnTextToLetters'; l.className = 'mbtn'; l.textContent = 'Convert: one object per letter';
      l.title = 'Like Convert text to shapes, but every letter becomes its own object (kept in one group) so each can be coloured, moved or cut separately'; l.style.cssText = 'margin-top:6px;padding:6px;font-size:11px'; l.onclick = function () { convertSelectedTextToShapes(true); }; body.appendChild(l);
    }
  }
  /* The Tool Options font dropdown (#optFont) only exists while the Text tool is active, so hook the
     function that rebuilds that panel and re-attach our button + font groups every time. */
  if (typeof updateToolOpts === 'function') {
    var baseUpdateToolOpts = updateToolOpts;
    updateToolOpts = function () { var r = baseUpdateToolOpts.apply(this, arguments); addButtons(); refreshSelects(); return r; };
  }
  addButtons(); refreshSelects(); restore();

  window.FontLib = { saveBundle: saveBundle, loadBundle: loadBundle, faces: function () { return faces; }, state: state, loadSystemFonts: loadSystemFonts, addFiles: addFiles, removeFace: removeFace, outlineText: outlineText, findFace: findFace,
    ensureParsed: ensureParsed, families: families, openDialog: openDialog, restore: restore, convertSelectedTextToShapes: convertSelectedTextToShapes, FontError: FontError };
})();
