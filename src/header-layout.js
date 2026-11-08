/* v6.12: header layout. Colours palette sits just left of the PNG / Mat pair (same dots, same behaviour); Undo/Redo and PNG/Mat are stacked compactly.
   Pure DOM re-parenting: every button keeps its id and its handlers. */
(function () {
  'use strict';
  var hdr = document.querySelector('header'); if (!hdr) return;
  function stack(id, a, b) {
    var x = document.getElementById(a), y = document.getElementById(b);
    if (!x || !y || document.getElementById(id)) return;
    var w = document.createElement('div'); w.className = 'hstack'; w.id = id;
    x.parentNode.insertBefore(w, x); w.appendChild(x); w.appendChild(y);
  }
  stack('stackPngMat', 'btnPng', 'btnMat');
  stack('stackUndoRedo', 'btnUndo', 'btnRedo');
  var sw = document.getElementById('swatches');
  /* v6.13: the palette sits just left of the PNG / Mat pair; the space between the name and the palette is left free for future additions */
  var pm = document.getElementById('stackPngMat') || document.getElementById('btnPng') || document.getElementById('btnConn');
  if (sw && pm && pm.parentNode === hdr) hdr.insertBefore(sw, pm);
})();
