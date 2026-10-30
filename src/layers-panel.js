/* v6.6 Layers panel: a small floating, collapsible list of every object (top of the list = top of the stack), bottom-left of the canvas.
   It is an extra view over the same objects as the right-hand Layers list; nothing else in the layout changes.
   Row: eye | lock | colour chip | name (double-click renames) | up | down | delete. Click selects, Shift+click adds to the selection. */
(function () {
  'use strict';
  var ws = document.querySelector('.workspace'); if (!ws) return;
  var st = document.createElement('style');
  st.textContent = '#lpanel{position:absolute;left:72px;bottom:12px;width:236px;max-height:46%;display:flex;flex-direction:column;z-index:80;border-radius:10px;background:rgba(42,51,80,.97);border:1px solid var(--chrome-line,#4a5a86);box-shadow:0 8px 24px rgba(6,10,24,.45);font:12px var(--ui,system-ui,sans-serif);color:var(--icon,#e4eaf8)}'
    + '#lpanel .lp-h{display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;user-select:none;font-weight:700}#lpanel .lp-h span.n{margin-left:auto;opacity:.7;font-weight:600}'
    + '#lpanel .lp-list{overflow:auto;padding:0 4px 4px}#lpanel.closed .lp-list{display:none}'
    + '#lpanel .lp-r{display:flex;align-items:center;gap:3px;padding:3px 4px;border-radius:6px;cursor:pointer}#lpanel .lp-r:hover{background:rgba(255,255,255,.1)}#lpanel .lp-r.sel{background:rgba(109,255,160,.22);outline:1px solid rgba(109,255,160,.55)}#lpanel .lp-r.off{opacity:.5}'
    + '#lpanel .lp-c{width:12px;height:12px;border-radius:3px;border:1px solid rgba(255,255,255,.5);flex:none}#lpanel .lp-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#lpanel button{border:0;background:transparent;color:inherit;cursor:pointer;padding:1px 3px;border-radius:4px;font-size:12px;line-height:1}#lpanel button:hover{background:rgba(255,255,255,.2)}#lpanel input.lp-ed{width:100%;font:inherit}'
    + '#lpanel .lp-e{padding:8px;opacity:.7;font-style:italic;text-align:center}';
  document.head.appendChild(st);
  var P = document.createElement('div'); P.id = 'lpanel'; ws.appendChild(P);
  var open = true; try { open = localStorage.getItem('lpanelOpen') !== '0'; } catch (e) {}
  function setOpen(v) { open = v; try { localStorage.setItem('lpanelOpen', v ? '1' : '0'); } catch (e) {} P.classList.toggle('closed', !open); }
  var head = document.createElement('div'), list = document.createElement('div'); head.className = 'lp-h'; head.id = 'lpHead'; list.className = 'lp-list'; list.id = 'lpList';
  head.title = 'Click to collapse / expand'; P.appendChild(head); P.appendChild(list); head.onclick = function () { setOpen(!open); build(); };

  function mk(txt, title, fn, id) { var b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; if (id) b.dataset.a = id; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
  function chip(o) { return o.pattern ? '#888' : (o.fill && o.fill !== 'none' ? o.fill : 'transparent'); }
  function pick(o, add) {
    if (add) { var on = selIds.indexOf(o.id) >= 0; selectMany(on ? selIds.filter(function (x) { return x !== o.id; }) : selIds.concat([o.id])); }
    else { var want = groupMembers(o).map(function (m) { return m.id; }).sort().join(); if (selIds.slice().sort().join() === want) return; selectMany([o.id]); }   /* unchanged selection: leave the DOM alone so double-click rename works */
    refreshLayers(); draw();
  }
  function build() {
    P.classList.toggle('closed', !open);
    head.textContent = ''; var t = document.createElement('span'); t.textContent = (open ? '▾' : '▸') + ' Layers'; var n = document.createElement('span'); n.className = 'n'; n.id = 'lpCount'; n.textContent = objects.length; head.appendChild(t); head.appendChild(n);
    list.textContent = '';
    if (!objects.length) { var e = document.createElement('div'); e.className = 'lp-e'; e.textContent = 'No objects yet'; list.appendChild(e); return; }
    for (var i = objects.length - 1; i >= 0; i--) (function (idx) {
      var o = objects[idx], r = document.createElement('div'); r.className = 'lp-r' + (selIds.indexOf(o.id) >= 0 ? ' sel' : '') + (o.hidden ? ' off' : ''); r.dataset.id = o.id;
      var c = document.createElement('span'); c.className = 'lp-c'; c.style.background = chip(o);
      var nm = document.createElement('span'); nm.className = 'lp-nm'; nm.textContent = (o.gid ? '▣ ' : '') + (o.name || o.type); nm.title = 'Click to select, Shift+click to add, double-click to rename';
      nm.ondblclick = function (ev) {
        ev.stopPropagation(); var inp = document.createElement('input'); inp.className = 'lp-ed'; inp.value = o.name || o.type; nm.replaceWith(inp); inp.focus(); inp.select();
        var done = false; function fin(ok) { if (done) return; done = true; if (ok && inp.value.trim() && inp.value !== o.name) { pushUndo(); o.name = inp.value.trim(); } refreshLayers(); }
        inp.onkeydown = function (k) { k.stopPropagation(); if (k.key === 'Enter') fin(true); else if (k.key === 'Escape') fin(false); }; inp.onblur = function () { fin(true); }; inp.onclick = function (k) { k.stopPropagation(); };
      };
      r.onclick = function (ev) { pick(o, ev.shiftKey || ev.ctrlKey || ev.metaKey); };
      r.appendChild(mk(o.hidden ? '\u{1F6AB}' : '\u{1F441}', 'Show / hide', function () { o.hidden = !o.hidden; refreshLayers(); draw(); }, 'vis'));
      r.appendChild(mk(o.locked ? '\u{1F512}' : '\u{1F513}', 'Lock / unlock', function () { o.locked = !o.locked; refreshLayers(); }, 'lock'));
      r.appendChild(c); r.appendChild(nm);
      r.appendChild(mk('↑', 'Move up (towards the front)', function () { if (idx < objects.length - 1) { pushUndo(); var t = objects[idx]; objects[idx] = objects[idx + 1]; objects[idx + 1] = t; refreshLayers(); draw(); } }, 'up'));
      r.appendChild(mk('↓', 'Move down (towards the back)', function () { if (idx > 0) { pushUndo(); var t = objects[idx]; objects[idx] = objects[idx - 1]; objects[idx - 1] = t; refreshLayers(); draw(); } }, 'dn'));
      r.appendChild(mk('\u{1F5D1}', 'Delete', function () { pushUndo(); objects.splice(idx, 1); normalizeGroups(); selectMany(selIds.filter(function (x) { return x !== o.id; })); refreshLayers(); draw(); }, 'del'));
      list.appendChild(r);
    })(i);
  }
  var _rl = refreshLayers; refreshLayers = function () { var r = _rl.apply(this, arguments); build(); return r; };
  build();
})();
