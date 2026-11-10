# Changes from v4 (original is preserved byte-for-byte in `original/`)

`tools/patch_core.py` derives `src/app.html` from the original with asserted, single-purpose replacements; `tools/build.js` inlines the new modules into `index.html`. Nothing was deleted from v4's features.

## Bug fixes (each confirmed by a test, in a real browser)
1. `resizingText` undeclared: every `mousemove`/`mouseup` threw, so shapes could not be drawn or dragged.
2. Drag moved only `x/y`; ellipse/star/polygon/line draw from other fields, so the drawing and its hit-box separated. Same bug affected align and paste (offset only `x/y`).
3. Undo snapshot for a drag was pushed after the move (undo was a no-op), and every plain click pushed an undo entry.
4. Images were serialised to `{}` by undo/redo/save/autosave, after which `drawImage` threw on every redraw. Images now carry `src` and are rehydrated; `draw()` also guards incomplete images.
5. Context-menu "Copy" passed a string instead of a function.
6. Delete, Bring to Front, Send to Back, Lock, Hide, Align acted on one object only.
7. Rubber-band selection picked only the first contained object ("phase 2" comment in v4).
8. The X/Y/W/H Transform fields displayed values but had no handlers.
9. SVG export silently dropped stars, polygons and lines.

## New features
* Multi-selection (marquee, Shift-click, Ctrl+A), **Group / Ungroup** (Ctrl+G / Ctrl+Shift+G, buttons, context menu). Groups are a shared `gid` on flat objects, so drawing, hit-testing, undo, save/load and export needed no changes. Nested groups are flattened.
* Corner-handle resize for every shape and any selection (Shift keeps aspect); numeric Transform panel.
* Drag threshold (3 screen px) so clicks never jitter or dirty the document.
* Machine tab: read-only WebUSB / Web Serial discovery, simulator with fault injection, 8-stage status, diagnostics, cut-path SVG (mm) export, receive-only serial listener, working Console, header and status-bar connection indicators.
* `src/machine.js` adapter interface (`connect / disconnect / sendJob`) so other models or transports can be added later.

## Deliberately not changed
Text tool, text effects, game, donate dialog, materials list, minimap, webcam/QR/eyedropper, auto-save, visual design. The minimap/empty-canvas/marquee `draw`/`onDown` wrapper chain from v4 was kept; replacing it is a larger refactor than was justified.

# v6 additions (on top of v5)
* **SVG export dialog** (`src/export-ui.js`, `src/svgexport.js`): units, crop, selection-only, text as paths or as `<text>`. Replaces v4's `exportSVG` (which dropped stars/polygons/lines in v4, fixed in v5); now async.
* **Fonts** (`src/fonts.js`): Local Font Access API, uploaded fonts via FontFace + IndexedDB, search, remove. Font names are treated as untrusted (only `textContent`/`value`, tested with hostile names).
* **Text to cut paths** (`src/textpaths.js`, vendored opentype.js 1.3.4): new `path` object type (move/resize/undo/save/copy/group/export all supported), "Convert Text to Shapes", curve/warp text outlined using the app's own glyph placement.
* Kerning: opentype.js 1.3.4 does not apply GPOS kerning, so plain text is placed per character using the browser's own `measureText`, matching the canvas (verified by pixel overlap tests).
* Text panel now stays visible with a single object selected from the layers list (v5 text-panel fix) and refreshes after layer changes.
* Shortcuts: Ctrl+Shift+E opens the export dialog; Ctrl+E unchanged (PNG).
* **Undo / Redo header buttons** (`src/undo-ui.js`) and Ctrl+Shift+Z for redo. The undo engine itself is v4/v5 code (80 steps), unchanged; it was only reachable by keyboard.
* **Mat colour** (`src/mat-ui.js`, patch step 10e): the mat was hard-coded `#0c0c20` in the editor, minimap and PNG export; it is now `matColor` with a contrast-aware grid (`matInk`). Display only; persisted in localStorage; excluded from SVG.
* Undo after "Convert Text to Shapes" is tested through the real buttons (convert, Undo button, Redo button, Ctrl+Z); it works in headless Chromium. See LIMITATIONS for what I could not reproduce.

# v6.2
* **Swatch library** (`swatches/`, `tools/make-swatches.py|.js`, `src/swatches.js`): images packed into `swatches/swatches.js` (data URLs, so canvas export is never tainted) and loaded by `index.html`; Python and Node generators give byte-identical output (tested). Ships empty.
* **Bucket tool** (B): precise hit test (point-in-shape, not bounding box) for ellipse/star/polygon/path, topmost-first; pattern stored as `o.pattern={sid,size}` with `o.fill` = swatch average colour so older code paths keep working. Drawn with `createPattern` anchored to the object's top-left; exported as SVG `<pattern>`.
* **Magic Wand** (W): `src/maskops.js` (flood fill with per-channel tolerance, 4-connected contiguity, sample averaging, combine modes, boundary tracing with holes, Douglas-Peucker + Chaikin) + `src/wand.js` (tool, marching ants, options panel, Make cut path). Modelled on Photoshop's documented behaviour (tolerance default 32, contiguous, anti-alias, sample size, add/subtract/intersect).
* Fixed a v4 latent bug: the empty-canvas message wrapper called `ctx.save()` before the canvas existed (surfaced when an image finished loading early).

# v6.3
* Removed the Cricket Splat game (tab, panel, CSS, engine, sprite/background images, console banner) and the Webcam capture button/function. `tools/patch_v63.py` does this with asserted cuts.
* New SVG logo (`tools/logo.svg`, inlined as a data URI; also the favicon and donate dialog image) and the name OpenCut DSA (title, header, console banner, donate dialog, SVG export title/desc, diagnostics).
* Swatch loading in the app: Add images (multi-select), Choose folder (File System Access API, recursive, max 500 files / 5 levels), drag-and-drop onto the panel, persisted in IndexedDB (ids `user/...`), Remove button, 8 MB limit with messages, graceful fallback when storage is blocked. Built-in library via `swatches/` is now optional.
* Wand: **Select subject** (`MaskOps.subjectMask`: border colour = background, flood from the border, subject = the rest, holes enclosed by the subject stay).

# v6.4
* **Wand rewritten (`src/wand.js`)**: v6.2/6.3 hit-tested the object under the cursor and only did pixel work on raster images, so on text, shapes and converted text it always selected the whole object. It now renders every visible object flat (same drawing rules as PNG export, 2x, capped at 2400 px) and flood-fills that picture, so any visible part can be selected. Selections are in a fixed mat frame, so Add/Subtract/Intersect work across objects; a signature of the design drops the selection when anything changes. Old behaviour kept as the option "Select whole objects instead of regions".
* New: "Only the object under the click", "Whole object" (silhouette), Select subject now works on any selected object (rendered in its own bounds).
* **Choose folder**: replaced the File System Access API (hidden in Brave, so the button was disabled) with `<input type=file webkitdirectory>`, which works in Brave/Chrome/Edge/Firefox. Max 500 files / 6 levels.

# v6.5
* Wand: selection persists across Bucket/Select/Hand (`KEEP` set in `src/wand.js`), dropped by Text and the drawing tools. `WandTool.fillSelection/fillAt/hasSelection`: painting makes a new `path` object (the mask grown 1 px so it covers the anti-aliased edge) on top; the palette-swatch click handler is patched (patch step 10i) to paint an active selection instead of recolouring the whole selected object. On-canvas bar (`#wandBar`) with New/Add/Subtract/Intersect, Cut path, Fill, Clear.
* Bucket: an active wand selection limits the fill to it; a click outside the selection explains instead of filling.
* Fonts: "Add font folder..." (`<input webkitdirectory>`, .ttf/.otf/.woff only, max 300 files), browser-specific "cannot list fonts" message, explicit message when the API returns 0 fonts.
* Theme (`src/theme.css`, inlined by build.js; ruler colours patched; soft mat shadow): workspace slate gradient, toolbar `#323d5e` with `#e4eaf8` icons (about 9:1 contrast), tab rail, header, footer. The right panel's variables were not touched.

# v6.6
* `src/wand.js`: `fillSelection` now edits the design. It renders every visible object alone in the selection frame, assigns each selected pixel to the top-most object, and per object: >= 95 % covered -> change its fill/pattern; image -> recolour the selected pixels; path object partly covered -> `TextPaths.splitPieces` (new: outer contour + its holes, islands separate) decides per piece (> 50 % selected) and the chosen pieces become a new path object `<name> (part)` inserted above the original (same gid); other partly covered shapes are refused with a message. One `pushUndo`; the selection is kept. The old overlay is `fillSelectionAsLayer` (buttons `#wb-fill-layer`, `#wandFillLayer`).
* `src/fonts.js`: `convertSelectedTextToShapes(perLetter)`; new `#btnTextToLetters`.
* `src/layers-panel.js` (new): floating `#lpanel`, wraps `refreshLayers`.
* Deselect: `#wb-clear`, Esc in any tool, Ctrl+Shift+A, empty-canvas mousedown with the Select tool, context-menu item (patch step 10j).
* Tests: `tests/v66.browser.test.js` (8), `splitPieces` unit test; two v6.5 tests updated because palette/bucket painting no longer adds a layer.

# v6.7
* `src/png-canvas.js` (new): document tabs. `docs[0]` is the mat; each PNG canvas is another entry. The active document lives in the app globals (`objects`, `matW`, `matH`, `undoStack`, `redoStack`, zoom/pan); inactive ones are parked. `clipboard`, `nextId` are global, so copy/paste crosses tabs. Size is stored in design px (96/in); dpi only affects export.
* Patch step 10k (`tools/patch_core.py`): `draw()` paints a checkerboard instead of the mat colour and an orange boundary in PNG mode; `exportPNG` uses `dpi/96` scale and no background fill in PNG mode (mat export unchanged, 2x); autosave is skipped in PNG mode.
* Limits: each side <= 16000 px and <= 100 MP (browser canvas limits). Tests: `tests/v67.browser.test.js` (5).

# v6.8
* `src/wand.js`: `copySelected` is wrapped; with a wand selection (and tool = wand, or no object selected) it renders the design in the selection frame, crops to the mask bounds, keeps the rendered RGBA only where the mask is set, and puts one `image` object in `clipboard`.
* Patch step 10l: the text corner-resize regex had doubled backslashes in v4 (never matched, so the font fell back to `bold ... sans-serif`); fixed and the size is rounded. New text fill is `#000000` when the Fill picker still has its factory value `#44ff66`. Empty font value falls back to sans-serif.
* `src/fonts.js` `refreshSelects`: removes the built-in `<option>`s from `#optFont` and `#stTextFont` and adds a disabled placeholder when no font is loaded; selects the first real font otherwise.
* Tests: `tests/v68.browser.test.js` (4).

# README
* `README.md` keeps your intro wording, a version history (newest first, one section per version) and the reference sections. Each build adds a new version section at the top of the history and updates the title, test count and layout.

# v6.9
* `wand.js fillSelection`: ownership now uses alpha > 128, selected pixels no object owns are "empty space"; if they are >= 15 % of the selection (or nothing else is selected) a path `Filled empty area` is built from them (dilated 1 px, no corner smoothing) and inserted at the bottom of the stack with the chosen colour/pattern. Thin anti-aliased rims (< 15 %) and images with fewer than 8 selected pixels are ignored. Cause of the reported bug: an image was always "planned" for recolouring even when only its faint edge pixels were selected, so the toast said it changed the fill but nothing visible changed.
* `fonts.js`: `navigator.storage.persist()` after adding a font. Tests: `tests/v69.browser.test.js` (3).
* v6.9 fonts: `fonts/fonts-bundle.js` (loaded by a `<script src onerror>` tag added in `tools/build.js`, like `swatches/swatches.js`) sets `window.FONT_BUNDLE=[{n,d(base64)}]`; `FontLib.loadBundle()` registers each (marked `bundled`, not removable); `FontLib.saveBundle()` writes it from the uploaded faces (limit ~160 MB). `state.storageFailed` is set when IndexedDB refuses a write. Tested in a fresh profile from a copied folder (`tests/v69fonts.browser.test.js`).
* Findings behind that design (Chromium 141): a page opened from file:// cannot fetch or list a sibling folder (fetch, XHR and directory listing all fail), but can load a sibling script; over http a directory listing works; IndexedDB fonts survived restarts and folder moves in Chromium.

# v6.10
* `src/print.js` (new): Print sheet dialog. Items = visible objects (or the selection); a sticker = one object or one group (`gid`). Layout in inches (paper, margin, scale %, shrink, centre, cut-line pad). Cut lines: each sticker is rendered alone at 150 dpi (`WandTool.drawObjects`), alpha > 8 -> mask, optional hole fill (flood from the border), square dilation by the offset, `MaskOps.maskToPaths` (smoothed), mapped to page inches. The page is drawn once at 300 dpi; printing writes it as one `<img>` sized in inches with `@page{size;margin:0}` into a hidden iframe and calls `print()`. `cutSvg` writes the same loops (96 units = 1 in).
* Entry points: Ctrl+P (capture handler), context-menu item (patch step 10m), Print button in the Export window. `WandTool.drawObjects` is now exposed. `tests/v610.browser.test.js` (4) checks layout, pixels, cut loops, SVG, that the print page is a one-page letter PDF (Chromium `page.pdf`), and the entry points. No printer was used.
* Research used: Design Space's Print Then Cut maximum sizes (Letter: about 7.44 x 9.94 in) and Flatten behaviour (see the discussion; Flatten is not implemented).

# v6.11
* `print.js`: `prefs.printLines` (checkbox `#prPL`); preview and `cutSvg` use the loops whenever `cut` is on, the 300 dpi print page draws them only when `cut && printLines`. After `print()` the iframe no longer keeps focus (`window.focus()`), which had blocked Ctrl+P. Test added to `tests/v610.browser.test.js` (printed sheet has no pink pixels when unticked, has them when ticked).

# v6.12
* Patch steps 10n-10q in `tools/patch_core.py`: green to magenta (`#44ff66`->`#ff3fc8`, `#b5ff3b`->`#ff8ae6`, rgba tints; the colour-dot array, logo and favicon lines are excluded), "Make Cut" button text, donate button + modal + handlers removed, header gets the `#swatches` container (the right-pane Colors section is replaced by a `#swatchAnchor` marker that the Swatch Library panel attaches to), real QR encoder.
* `src/theme.css` rewritten for magenta + graphite grey; `tools/logo.svg` recoloured (magenta to silver gradient); the brand text keeps its gradient.
* QR: the old `qrEncode` drew a hash-based placeholder. It now calls the vendored `src/vendor/qrcode.js` (qrcode-generator 1.4.4, MIT), byte mode, UTF-8, ECC M, 4-module quiet zone. `tests/v612.browser.test.js` decodes the output with jsQR (`tests/vendor/jsQR.js`, Apache-2.0).
* `src/shape-warp.js`: Shape Warp panel. Shapes are tessellated, warped in their bounding-box frame and stored as `path` objects with `wsrc` (original), `wbox`, `wstyle`, `wamt`; lines become open paths (`o.open`, honoured by `drawPathObj`, `TextPaths.pathObjectPolylines` and `machine.js`). None rebuilds the original from `wsrc` after applying any later move/resize.
* `src/header-layout.js`: re-parents `#swatches` into the header and stacks Undo/Redo and PNG/Mat (`.hstack`); ids and handlers are unchanged.
* `tests/v612.browser.test.js` (7 tests); `tests/v65.browser.test.js` theme test updated for the grey workspace.

# v6.13
* `src/transform-handles.js`: capture-phase mouse listeners on the canvas + a wrapped `draw()` overlay. Line thickness handles (`o.strokeW`), rotation handle for image/text (`o.rot` in degrees, about the centre of the unrotated box), rotated-image corner resize in the rotated frame, rotated-text font-size corner. Undo is one snapshot per drag.
* `core-engine.js`: `isRot`, `baseBox`, `rotCenter`, `rotPt`/`unrotPt`, `rotCorners`, `objBounds` (rotated AABB), `drawImageObj`, `distToSeg`; `scaleObj` scales line thickness on uniform scale and keeps rotated images rectangular (uniform about the centre).
* patch step 10r: `drawTextObject` rotates around the text-box centre, PNG/canvas image drawing via `drawImageObj`, `hitTest` works in the rotated frame and uses point-to-segment distance for lines, old unrotated selection box / text handle are skipped for rotated objects.
* `fonts.js outlineText` rotates the outlines (so SVG export, the cut job and Convert Text to Shapes follow); `svgexport.js` adds `transform="rotate()"` to images; `export-ui.js` live-text fallback is wrapped in a rotated group; `wand.js` / `print.js` signatures include `rot`, strokeW and line ends, and the wand paints rotated images through the rotation.
* `header-layout.js`: palette inserted before the PNG/Mat stack. `tests/v613.browser.test.js` (6 tests).

# v6.14
* Rotation generalised to rect/ellipse/star/polygon/path (`canRot`, `rotShapeCtx` in `core-engine.js`; `o.rot` degrees about the centre of the x/y/w/h box). Patch step 10s: PNG/canvas draw loops call `rotShapeCtx`, Transform panel gets a `Rot` field (`tfR`). `wand.js drawObjects`, `svgexport.js` (rotate group) and `machine.js prepareJob` (rotated points) follow. `scaleObj` scales rotated shapes uniformly about their centre.
* `transform-handles.js`: rotation handle and rotated-corner resize for all those types (ellipse/star/polygon/rect fields kept in sync), numeric `Rot` field (a line is rotated by moving its end points).
* `src/boolops.js` + vendored `src/vendor/clipper.js` (clipper-lib 6.4.2): integer geometry (x100), pairwise union/difference/intersection with non-zero fill, `ClipperOffset` (round joins) for Offset and open-butt offset for Line to Outline. Results become `path` objects via `TextPaths.makePathGeometry`. `ShapeWarp.outline/densify` are reused to flatten shapes; rotation is baked in.
* `tests/v614.browser.test.js` (6 tests).

# v6.15
* Colours: patch step 10t + `src/theme.css` + one-time edits in `src/*.js`/`tools/logo.svg`. Accent `#d9506f` (`--portal`), light `#f0a8bb` (`--acid`), fill default `#9c2342`, button/selected gradient `--maroon2 #b3304f` to `--maroon #8a1c38` with white text.
* `src/pen.js`: Pen tool (`window.__toolHandlers.pen`, key N, `TOOLS` entry from patch step 10u) and node editing. Data: `o.pen = [{c, n:[{x,y,ix,iy,ox,oy,sm}]}]` in the same frame as `o.contours`; every edit calls `rebuild()` which re-flattens the beziers, recomputes x/y/w/h/bw/bh and the contours. Entering node mode converts the shape in place (`convertInPlace`, rotation baked, warp source dropped).
* Patch step 10u also: open-path hit-testing by distance, selection box suppressed while `window.__nodeEdit`, `N` in the shortcut list. `transform-handles.js` ignores the selection while editing points.
* `src/arrange.js`: Arrange panel (align to each other, distribute, groups as units).
* `tests/v615.browser.test.js` (6 tests).
