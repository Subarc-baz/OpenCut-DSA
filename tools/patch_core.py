#!/usr/bin/env python3
"""Reproducibly derive src/app.html from the untouched original.
Every replacement asserts it matched exactly the expected number of times."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
orig = next((root / 'original').glob('*.html')).read_text(encoding='utf-8')
s = orig

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} match(es), found {n}: {old[:70]!r}'
    s = s.replace(old, new)

def rx(pattern, new, count=1, flags=re.S):
    global s
    found = re.findall(pattern, s, flags)
    assert len(found) == count, f'regex expected {count}, found {len(found)}: {pattern[:70]!r}'
    s = re.sub(pattern, lambda m: new, s, flags=flags)

# 1. state + the undeclared variable (ReferenceError on every mouse move/up)
rep('var undoStack=[],redoStack=[],nextId=1;',
    'var undoStack=[],redoStack=[],nextId=1;\nvar resizingText=null; /* FIX: was read in onMove/onUp but never declared -> ReferenceError on every mouse move/up */\n/*@@CORE_ENGINE@@*/')

# 2. every place that clears selection must clear selIds too
n = s.count('sel=null;selIdx=-1;')
assert n == 9, n
s = s.replace('sel=null;selIdx=-1;', 'sel=null;selIdx=-1;selIds=[];')

# 3. snapshot-based undo/redo/save/autosave (JSON of an <img> element is {} -> draw() threw after undo)
assert s.count('JSON.stringify(objects)') == 3
s = s.replace('JSON.stringify(objects)', 'snapshotObjects()')
rep('objects=JSON.parse(undoStack.pop())', 'objects=restoreObjects(undoStack.pop())')
rep('objects=JSON.parse(redoStack.pop())', 'objects=restoreObjects(redoStack.pop())')
rep('objects:objects,matW', 'objects:JSON.parse(snapshotObjects()),matW')
rep('objects=p.objects||[];', 'objects=restoreObjects(JSON.stringify(p.objects||[]));')
rep('JSON.stringify({objects:objects,nextId:nextId,ts:Date.now()})',
    'JSON.stringify({objects:JSON.parse(snapshotObjects()),nextId:nextId,ts:Date.now()})')
rep('objects=p.objects;nextId=p.nextId||objects.length+1;',
    'objects=restoreObjects(JSON.stringify(p.objects));nextId=p.nextId||objects.length+1;')
rep("type:'image',img:img,", "type:'image',img:img,src:img.src,", 4)
rep("else if(o.type==='image'&&o.img){ctx.drawImage",
    "else if(o.type==='image'&&o.img&&o.img.complete&&o.img.naturalWidth){ctx.drawImage")

# 4. remove the old versions of functions now provided by the engine
for name in ['copySelected', 'pasteClipboard', 'duplicateSelected', 'selectAll', 'selectObj', 'updateTransform']:
    rx(r'\nfunction ' + name + r'\([^\n]*\n', '\n')
rx(r'\n// === OBJECT ALIGNMENT ===\nfunction alignObjects\(dir\)\{.*?\n\}\n', '\n// === OBJECT ALIGNMENT === (moved to core engine)\n')

# 5. pointer handling
rep('    // Text has draggable corner handles.', '    if(tryBeginResize(pt))return;\n    // Text has draggable corner handles.')
rep('if(hit>=0){selectObj(hit);if(!objects[hit].locked)dragging=true;dragOX=pt.x-objects[hit].x;dragOY=pt.y-objects[hit].y;}',
    'if(hit>=0){beginObjectDrag(hit,pt,e);}')
rep('if(dragging&&sel){sel.x=snap(pt.x-dragOX);sel.y=snap(pt.y-dragOY);updateTransform();draw();return;}',
    'if(resizeOp){doResize(pt,e);return;}\n  if(dragging&&sel){doDrag(pt);return;}')
rep('if(dragging){pushUndo();dragging=false;return;}',
    'if(resizeOp){endResize();return;}\n  if(dragging){endDrag(e);return;}')

# 6. draw(): selection overlay
rx(r'\n  if\(sel\)\{\n    var sb=sel\.type', '\n  if(selIds.length>1){drawMultiSelection();}\n  if(sel&&selIds.length<2){\n    var sb=sel.type')

# 7. marquee: multi-select, shift adds, handles keep priority
rep('if(!isSelectedTextHandle(pt)){', 'if(!isSelectedTextHandle(pt)&&resizeHandleAt(pt)<0){')
rx(r"rubberBand=\{sx:mx,sy:my,ex:mx,ey:my,active:true\};\n\s*sel=null;selIdx=-1;selIds=\[\];refreshLayers\(\);draw\(\);",
   "rubberBand={sx:mx,sy:my,ex:mx,ey:my,active:true,base:e.shiftKey?selIds.slice():[]};\n        if(!e.shiftKey){sel=null;selIdx=-1;selIds=[];}\n        refreshLayers();draw();")
a = s.index('    for(var i=objects.length-1;i>=0;i--){\n      var o=objects[i];if(o.hidden)continue;\n      var mb=')
b = s.index('// Select first found (multi-select is phase 2)\n      }\n    }') + len('// Select first found (multi-select is phase 2)\n      }\n    }')
s = s[:a] + ("    var hits=rubberBand.base.slice();\n"
 "    objects.forEach(function(o){\n"
 "      if(o.hidden)return;\n"
 "      var mb=objBounds(o);\n"
 "      if(mb.x>=p1.x&&mb.x+mb.w<=p2.x&&mb.y>=p1.y&&mb.y+mb.h<=p2.y)hits.push(o.id);\n"
 "    });\n"
 "    if(hits.length)selectMany(hits);else{sel=null;selIdx=-1;selIds=[];refreshLayers();}") + s[b:]

# 8. keyboard
rep("if(e.key==='a'){e.preventDefault();selectAll();}",
    "if(e.key==='a'){e.preventDefault();selectAll();}\n      if(e.key==='g'||e.key==='G'){e.preventDefault();if(e.shiftKey)ungroupSelected();else groupSelected();}")
rep("if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();pushUndo();objects.splice(selIdx,1);sel=null;selIdx=-1;selIds=[];refreshLayers();draw();}",
    "if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();deleteSelected();}")
rep("['Ctrl+A','Select All'],", "['Ctrl+A','Select All'],['Ctrl+G','Group'],['Ctrl+Shift+G','Ungroup'],['Shift+Click','Add/remove from selection'],")

# 9. context menu (Copy passed a *string* -> TypeError; Delete/z-order/lock only handled one object)
rep("cmBtn('Copy','copySelected','Ctrl+C')", "cmBtn('Copy',copySelected,'Ctrl+C')")
rx(r"menu\.appendChild\(cmBtn\('Delete',function\(\)\{[^\n]*?\},'Del'\)\);",
   "menu.appendChild(cmBtn('Delete',deleteSelected,'Del'));\n      menu.appendChild(cmBtn('Group',groupSelected,'Ctrl+G'));\n      menu.appendChild(cmBtn('Ungroup',ungroupSelected,'Ctrl+Shift+G'));")
rx(r"menu\.appendChild\(cmBtn\('Bring to Front',function\(\)\{[^\n]*?\}\)\);", "menu.appendChild(cmBtn('Bring to Front',bringToFront));")
rx(r"menu\.appendChild\(cmBtn\('Send to Back',function\(\)\{[^\n]*?\}\)\);", "menu.appendChild(cmBtn('Send to Back',sendToBack));")
rep("menu.appendChild(cmBtn(sel.locked?'Unlock':'Lock',function(){sel.locked=!sel.locked;refreshLayers();}));",
    "menu.appendChild(cmBtn(sel.locked?'Unlock':'Lock',function(){var v=!sel.locked;selectedObjects().forEach(function(o){o.locked=v;});refreshLayers();}));")
rep("menu.appendChild(cmBtn(sel.hidden?'Show':'Hide',function(){sel.hidden=!sel.hidden;refreshLayers();draw();}));",
    "menu.appendChild(cmBtn(sel.hidden?'Show':'Hide',function(){var v=!sel.hidden;selectedObjects().forEach(function(o){o.hidden=v;});refreshLayers();draw();}));")

# 10. layers panel: highlight whole selection, mark groups, keep groups valid on delete
rep("d.className='litem'+(idx===selIdx?' sel':'');", "d.className='litem'+(selIds.indexOf(o.id)>=0?' sel':'');")
rep("+(o.name||o.type)+'</span>'", "+(o.gid?'\\u25A3 ':'')+(o.name||o.type)+'</span>'")
rep("pushUndo();objects.splice(idx,1);sel=null;", "pushUndo();objects.splice(idx,1);normalizeGroups();sel=null;")

# 10b. give the status-bar connection text an id so the machine layer can update it
rep('<span class="dot" id="stDot"></span> Disconnected</span>', '<span class="dot" id="stDot"></span> <span id="stConnTxt">Disconnected</span></span>')

# 10c. exportSVG silently dropped star/polygon/line objects
rep("else if(o.type==='ellipse')s+='<ellipse cx=\"'", "else if(o.type==='star'||o.type==='polygon'||o.type==='line')s+=svgOtherShape(o);\n    else if(o.type==='ellipse')s+='<ellipse cx=\"'")


# 10d. v6: path objects in draw()/PNG export, panel sync, export menu/shortcuts
rep("else if(o.type==='image'&&o.img&&o.img.complete&&o.img.naturalWidth){ctx.drawImage",
    "else if(o.type==='path'){drawPathObj(ctx,o);}\n    else if(o.type==='image'&&o.img&&o.img.complete&&o.img.naturalWidth){ctx.drawImage")
rep("else if(o.type==='line'){ex.beginPath();ex.moveTo(o.x1,o.y1);ex.lineTo(o.x2,o.y2);ex.stroke();}",
    "else if(o.type==='line'){ex.beginPath();ex.moveTo(o.x1,o.y1);ex.lineTo(o.x2,o.y2);ex.stroke();}\n    else if(o.type==='path'){drawPathObj(ex,o);}\n    else if(o.type==='image'&&o.img&&o.img.complete&&o.img.naturalWidth){ex.drawImage(o.img,o.x,o.y,o.w,o.h);}")
rep("var o=sel&&sel.type==='text'?sel:null;", "var o=sel&&sel.type==='text'&&selIds.length<2?sel:null;")
rep("curveSlider.addEventListener('input',", "window.__refreshTextPanel=refresh;\n  curveSlider.addEventListener('input',")
rep("menu.appendChild(cmBtn('Export PNG',exportPNG,'Ctrl+E'));",
    "menu.appendChild(cmBtn('Export PNG',exportPNG,'Ctrl+E'));\n    menu.appendChild(cmBtn('Export SVG\\u2026',function(){openExportDialog('svg');},'Ctrl+Shift+E'));")
rep("menu.appendChild(cmBtn('Ungroup',ungroupSelected,'Ctrl+Shift+G'));",
    "menu.appendChild(cmBtn('Ungroup',ungroupSelected,'Ctrl+Shift+G'));\n      if(selectedObjects().some(function(t){return t.type==='text';}))menu.appendChild(cmBtn('Convert Text to Shapes',convertSelectedTextToShapes));")
rep("if(e.key==='e'){e.preventDefault();exportPNG();}",
    "if(e.key==='e'||e.key==='E'){e.preventDefault();if(e.shiftKey)openExportDialog('svg');else exportPNG();}")
rep("['Ctrl+E','Export PNG'],", "['Ctrl+E','Export PNG'],['Ctrl+Shift+E','Export dialog (SVG / PNG)'],")

# 10e. v6.1: configurable mat colour (was hard-coded dark navy, black objects were invisible)
rep("ctx.fillStyle='#0c0c20';ctx.fillRect(0,0,matW,matH);", "ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);", 2)
rep("ex.fillStyle='#0c0c20';ex.fillRect(0,0,matW,matH);", "ex.fillStyle=matColor;ex.fillRect(0,0,matW,matH);")
rep("ctx.strokeStyle='rgba(255,255,255,0.04)';", "ctx.strokeStyle=matInk(0.04);")
rep("ctx.strokeStyle='rgba(255,255,255,0.12)';", "ctx.strokeStyle=matInk(0.12);")

# 10g. v4 latent bug: the empty-canvas message wrapper used ctx before it existed (hit when an image finished loading early)
rep("  _origDraw2();\n  if(objects.length===0&&tool==='select'){", "  _origDraw2();\n  if(ctx&&objects.length===0&&tool==='select'){")

# 10f. v6.2: bucket + wand tools, pattern fills
rep("  if(e.button!==0)return;\n  if(tool==='select'){", "  if(e.button!==0)return;\n  if(window.__toolHandlers&&window.__toolHandlers[tool]){window.__toolHandlers[tool](pt,e);return;}\n  if(tool==='select'){")
rep("ctx.fillStyle=o.fill||'none';ctx.strokeStyle=o.stroke||'#fff';", "ctx.fillStyle=(o.pattern&&window.patFill&&window.patFill(ctx,o))||o.fill||'none';ctx.strokeStyle=o.stroke||'#fff';")
rep("ex.fillStyle=o.fill||'none';ex.strokeStyle=o.stroke||'#fff';", "ex.fillStyle=(o.pattern&&window.patFill&&window.patFill(ex,o))||o.fill||'none';ex.strokeStyle=o.stroke||'#fff';")
rep("c.fillStyle=o.fill==='none'?(o.stroke||'#fff'):o.fill;c.textBaseline", "c.fillStyle=(o.pattern&&window.patFill&&window.patFill(c,o))||(o.fill==='none'?(o.stroke||'#fff'):o.fill);c.textBaseline")
rep("{id:'text',icon:'T',key:'T'},null,{id:'hand'", "{id:'text',icon:'T',key:'T'},null,{id:'bucket',icon:'B',key:'B',svg:'<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 11l6-6 8 8-6 6a2 2 0 0 1-2.8 0L5 13.8A2 2 0 0 1 5 11z\"/><path d=\"M11 5L9 3\"/><path d=\"M20.5 15.5c1 1.5 1.5 2.5 1.5 3.2a1.6 1.6 0 0 1-3.2 0c0-.7.7-1.7 1.7-3.2z\" fill=\"currentColor\"/></svg>'},{id:'wand',icon:'W',key:'W',svg:'<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 20L15 9\"/><path d=\"M14 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1z\" fill=\"currentColor\"/><path d=\"M19 14l.5-1.5L21 12l-1.5-.5L19 10l-.5 1.5L17 12l1.5.5z\" fill=\"currentColor\"/></svg>'},null,{id:'hand'")
rep("b.title=t.id+' ('+t.key+')';b.textContent=t.icon;", "b.title=t.id+' ('+t.key+')';if(t.svg)b.innerHTML=t.svg;else b.textContent=t.icon;")
rep("['Ctrl+Z','Undo']", "['B','Bucket (fill with colour or swatch)'],['W','Magic wand'],['Ctrl+Z','Undo']")

# 10h. v6.3: remove game + webcam, new logo and name (see tools/patch_v63.py)
import patch_v63
s = patch_v63.apply(s)

# 10i. v6.5: palette swatches paint an active wand selection; rulers recoloured for the lighter theme; soft shadow under the mat
rep("document.getElementById('optFill').value=c;if(sel){pushUndo();sel.fill=c;draw();}", "document.getElementById('optFill').value=c;if(window.WandTool&&WandTool.fillSelection(c))return;if(sel){pushUndo();sel.fill=c;draw();}")
rep("ctx.fillStyle='#0f1528';ctx.fillRect(0,0,W,22);ctx.fillRect(0,0,22,H);", "ctx.fillStyle='#2b3550';ctx.fillRect(0,0,W,22);ctx.fillRect(0,0,22,H);")
rep("ctx.strokeStyle='#1a2848';ctx.fillStyle='#607090';ctx.font='9px monospace';", "ctx.strokeStyle='#8d9bc2';ctx.fillStyle='#d3dbf0';ctx.font='9px monospace';")
rep("ctx.fillStyle='#0f1528';ctx.fillRect(0,0,22,22);", "ctx.fillStyle='#2b3550';ctx.fillRect(0,0,22,22);")
rep("ctx.save();ctx.translate(panX,panY);ctx.scale(zoom,zoom);\n  ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);", "ctx.save();ctx.translate(panX,panY);ctx.scale(zoom,zoom);\n  ctx.save();ctx.shadowColor='rgba(6,10,24,0.55)';ctx.shadowBlur=26;ctx.shadowOffsetY=5;ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);ctx.restore();\n  ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);")

# 10j. v6.6: "Deselect" in the right-click menu while a wand selection exists
rep("    menu.appendChild(cmSep());\n    menu.appendChild(cmBtn('Zoom to Fit',zoomFit,'Ctrl+0'));",
    "    if(window.WandTool&&WandTool.hasSelection())menu.appendChild(cmBtn('Deselect wand selection',WandTool.deselect,'Esc'));\n    menu.appendChild(cmSep());\n    menu.appendChild(cmBtn('Zoom to Fit',zoomFit,'Ctrl+0'));")

# 10k. v6.7: PNG canvas mode (transparent checkerboard, orange boundary, PNG export at chosen DPI, no autosave over the mat)
rep("var ec=document.createElement('canvas');ec.width=matW*2;ec.height=matH*2;\n  var ex=ec.getContext('2d');ex.scale(2,2);\n  ex.fillStyle=matColor;ex.fillRect(0,0,matW,matH);",
    "var __k=window.__pngMode?window.__pngDpi/96:2;var ec=document.createElement('canvas');ec.width=Math.round(matW*__k);ec.height=Math.round(matH*__k);\n  var ex=ec.getContext('2d');ex.scale(ec.width/matW,ec.height/matH);\n  if(!window.__pngMode){ex.fillStyle=matColor;ex.fillRect(0,0,matW,matH);}")
rep("a.download='design.png'", "a.download=window.__pngMode?'canvas.png':'design.png'")
rep("ctx.restore();\n  ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);\n  if(gridOn){",
    "ctx.restore();\n  if(window.__pngMode&&window.__paintChecker)window.__paintChecker(ctx);else{ctx.fillStyle=matColor;ctx.fillRect(0,0,matW,matH);}\n  if(gridOn){")
rep("ctx.strokeStyle='#44ff66';ctx.lineWidth=2;ctx.setLineDash([8,4]);ctx.strokeRect(0,0,matW,matH);",
    "ctx.strokeStyle=window.__pngMode?'#ff9f1c':'#44ff66';ctx.lineWidth=window.__pngMode?3:2;ctx.setLineDash([8,4]);ctx.strokeRect(0,0,matW,matH);")
rep("      var data=JSON.stringify({objects:JSON.parse(snapshotObjects()),nextId:nextId,ts:Date.now()});",
    "      if(window.__pngMode)return;\n      var data=JSON.stringify({objects:JSON.parse(snapshotObjects()),nextId:nextId,ts:Date.now()});")

# 10l. v6.8: text fixes
#  - corner-drag font-size resize used a regex with doubled backslashes (never matched), so the font reset to "bold sans-serif"
rep(r"match(/^(.*?)(\\d+(?:\\.\\d+)?)px(.*)$/)", r"match(/^(.*?)(\d+(?:\.\d+)?)px(.*)$/)")
rep("ro.obj.font=ro.fontPrefix+newSize+'px'+ro.fontSuffix;", "ro.obj.font=ro.fontPrefix+Math.round(newSize)+'px'+ro.fontSuffix;")
#  - new text is black unless a colour was actually picked (the Fill picker's factory colour is green, which is for shapes)
rep("text:txt,fill:getFill(),font:'bold '", "text:txt,fill:(function(){var f=getFill();return f==='#44ff66'?'#000000':f;})(),font:'bold '")
#  - no empty font value when no font is loaded yet
rep("(document.getElementById('optFont')||{value:'sans-serif'}).value,name:'Text: '", "((document.getElementById('optFont')||{}).value||'sans-serif'),name:'Text: '")

# 11. machine layer markers + title
rep('</script>\n</body>', '</script>\n<!--@@MACHINE@@-->\n</body>')
rep('<title>Stick-it-too-Cricut — RICKET MAKER C-137</title>', '<title>OpenCut DSA</title>')

out = root / 'src' / 'app.html'
out.write_text(s, encoding='utf-8')
print('wrote', out, len(s), 'bytes')
