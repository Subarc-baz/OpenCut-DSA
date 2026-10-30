# OpenCut DSA v6.6

An open-source, browser-based cutting design studio with advanced text editing, font tools, layer management, SVG export, image manipulation, swatches, and an expanding set of creative tools. Built as an extensively expanded and redesigned alternative to Cricut Design Space.

## Read this first: what v6 can and cannot do

> **v6 cannot cut on a real Maker 3.** No public, verified protocol for sending cut jobs to a stock Maker 3 exists (see `docs/RESEARCH.md`), and this app will not send guessed data to a machine. What it **does** do with real hardware: let you pick a USB/serial device in the browser and **read its descriptors** (vendor/product ID, interfaces, endpoints). It claims no interface and writes nothing. A **Simulator** exercises the whole cut workflow in software and is labelled SIMULATION everywhere. Nothing moves.
> I AM CURRENTLY WORKING ON MAKING THIS WORK FOR THE EXPLORE 2 AND 3. ITS POSSIBLE IT WILL WORK WITH MAKER 2 AND 3 AS WELL BUT CRICUT IS A SH1T COMPANY AND ENCRYPTS THE USB AND BLUETOOTH PROTOCOL, SO ITS NOT EASY TO FIND THE CORRECT SENDS FOR THE INDIVIDUAL CUT COMMANDS. 

## Run it

`index.html` is self-contained. Either:

- Double click the INDEX.HTML and BOOM you're good.

No install, no dependencies, no network access, no telemetry.

## New in v6

- **SVG export** (Export button or **Ctrl+Shift+E**; Ctrl+E is still a quick PNG). Real vector output, 96 units = 1 inch, size in in / mm / px, optional crop-to-design and selected-objects-only. Right-click also offers "Export SVG...". Rectangles, ellipses, stars, polygons, lines, text and converted shapes are exported; raster images are embedded as images.
- **Fonts...** (Text tool options): **Load system fonts** (Chromium's Local Font Access API; the browser asks permission) and **Add font file(s)** (.ttf / .otf / .woff, remembered in this browser). WOFF2 and .ttc are rejected with a message.
- **Text becomes cut paths**: the export dialog's "Convert text to paths" outlines text with the font file; **Convert Text to Shapes** turns selected text into an editable compound path object you can move and resize. Curved/warped text effects are outlined as drawn. Needs the actual font file: system fonts are read from the installed font, uploaded fonts from the file.
- Machine tab "Export Cut Paths (SVG, mm)" now includes text outlines too.
- `exportSVG()` is now asynchronous.
- **Swatch library + Bucket tool (B).** In the **Swatch Library** panel (right side, under Colors) click **+ Add images...** and pick any number of image files (png, jpg, gif, webp, svg), or **Choose folder...** to load a whole folder and its sub-folders (works in Brave, Chrome, Edge and Firefox), or just drag image files onto the panel. They appear immediately and are **remembered in this browser** (IndexedDB), so there is nothing to run. Pick a swatch, press **B**, click inside a shape (rectangle, ellipse, star, polygon, text, converted-text shapes, wand outlines). **Tile size** sets the tile width in inches and also resizes the tiles of the selected filled shapes. Choose **Solid** to fill with the Fill colour instead; **Remove** deletes a swatch you added. Fills are saved in projects, survive undo/copy, show in PNG export and are written to SVG as embedded `<pattern>` fills. *(Optional, advanced: a* *`swatches/`* *folder next to* *`index.html`* *plus* *`python3 tools/make-swatches.py`* *or* *`node tools/make-swatches.js`* *bakes a permanent built-in library; the app does not need it.)*
- **Magic Wand (W)**, like Photoshop's with "Sample All Layers". It looks at what you **see** (every visible object flattened), so it works the same on images, text, shapes and converted text, and it picks **individual parts**: click one letter, the inside of an "O", one piece of a picture. Click selects the **touching pixels of similar colour** (Tolerance 0-255, default 32; raise it to include more); marching ants outline the selection. Options: Contiguous on/off, Point/3x3/5x5 sample, New / Add / Subtract / Intersect (or Shift+click = add, Ctrl+click = subtract; Alt+click still pans). **Make cut path** (or Enter) traces the selection into an editable cut outline (holes kept, optional edge smoothing). **Invert** flips the selection (click the background, invert, get everything that is drawn). **Select subject** (selected sticker/clip-art on a plain or transparent background) and **Whole object** (the selected object's silhouette) are one-click shortcuts. "Only the object under the click" ignores overlapping objects; "Select whole objects instead of regions" gives the old whole-object/same-fill selection. Clicking an empty part of the mat selects the empty background region (as Photoshop does on a transparent layer); press Esc or Clear to drop it.
- **Mat colour** (header "Mat" button): presets (dark, charcoal, light gray, white, Cricut green/blue, cream), a custom colour and Reset, so black objects are visible. The grid switches to dark lines on light mats. It is a display setting only: it is remembered in this browser, is not saved in project files and never appears in SVG cut files; PNG export uses it as the background.
- **Undo / Redo buttons** in the header (v4 only had Ctrl+Z / Ctrl+Y, with no visible control). They grey out when there is nothing to undo or redo. **Ctrl+Shift+Z** also redoes. Undo keeps up to 80 steps.
- Not verified on real Brave/Bazzite: the Local Font Access API (only tested against a mock; see `docs/LIMITATIONS.md`). If it is unavailable, use **Add font file(s)**; fonts on Bazzite are usually in `~/.local/share/fonts` or `/usr/share/fonts`.

## New in v6.6

- **Filling a wand selection now changes the object itself, not a layer on top.** Select the "T" of converted "TEXT" with the Wand, then fill it (Bucket click inside the selection, a Colors swatch, a Swatch Library tile, or the **Fill** button): the T is split off as its own object (`<name> (part)`) with the new colour/pattern and the rest of the text is untouched. If the selection covers a whole object, that object's fill is simply changed. On an image, the selected pixels are recoloured. One Undo step. A partly selected plain shape (e.g. part of a rectangle) is not split; you get a message instead.
- **Fill in new layer** button (wand bar and Wand Options): the old behaviour, a new filled shape placed on top.
- **Convert: one object per letter** button under the text properties, next to "Convert text to shapes": every letter becomes its own object, kept in one group. (The dot of an i or j is its own piece.)
- **Layers panel** (bottom-left of the canvas, collapsible): every object, top of the stack first, with show/hide, lock, colour chip, rename (double-click), select (Shift+click adds), move up/down and delete. The right-hand Layers list is unchanged.
- **Easier deselect:** a **Deselect** button on the wand bar, **Esc** in any tool, **Ctrl+Shift+A**, clicking empty canvas with the Select tool, and "Deselect wand selection" in the right-click menu.

## New in v6.5

- **Painting a wand selection.** With a selection active, the **Bucket** (click inside the selection), a **Colors palette** swatch, the **Fill** button on the canvas bar / in Wand Options, or a Swatch Library tile all paint **only the selected region**: they add a new filled shape on top (the original image/text is untouched, and the new shape is cuttable and undoable). With no selection everything works as before (whole shape / whole object).
- **The selection now persists** when you switch to Bucket, Select or Hand, and is dropped by Text and the drawing tools (rectangle, circle, polygon, star, line). Esc clears it.
- **Selection mode buttons** New / Add / Subtract / Intersect are on a bar at the top of the canvas (visible while the Wand is active or a selection exists) and in the Wand Options panel, as well as the Shift+click (add) and Ctrl+click (subtract) shortcuts.
- **Fonts:** new **Add font folder...** button (pick e.g. `C:\Windows\Fonts`), clearer messages when your browser cannot list installed fonts (see Limitations for why).
- **New colour theme**: a lighter slate workspace, brighter toolbar icons, softer mat shadow; the right-hand Tool Options panel is unchanged.

## New in v6.4

- **Magic Wand rewritten** to select individual parts of anything you can see (see the Magic Wand entry below), instead of whole objects.
- **Choose folder** now works in every browser (it was greyed out in Brave, which hides the special folder API; it now uses the standard folder picker).

## New in v6.3

- **Renamed OpenCut DSA** ("DSA" = design space alternative) with a new vector logo and favicon. The name deliberately avoids the Cricut trademark; this project is independent and is not affiliated with or endorsed by Cricut, Inc. Mentions of "Cricut Maker 3" in the docs are factual compatibility statements.
- **Removed** the Cricket Splat game and the Webcam capture button (nothing else depended on them).
- **Swatches load from inside the app** (Add images / Choose folder / drag-and-drop, remembered), no commands needed.
- **Magic Wand: Select subject** button: for a sticker or clip-art on a plain or transparent background, one click selects everything except the background; then Make cut path.

## What changed from v4 (summary; full list in `docs/CHANGES.md`)

| Area | v4 problem (verified in Chromium) | v5 |
| --- | --- | --- |
| Drawing/dragging | `resizingText` was never declared, so **every mouse move/release threw a ReferenceError**; shapes could not be drawn or dragged | Declared |
| Dragging shapes | Only `x/y` changed; ellipse/star/polygon/line draw from `cx/cy/x1..y2`, so the **hit-box moved but the drawing stayed** | One `translateObj()` moves every coordinate field |
| Undo of a drag | Undo snapshot was taken *after* the move, so undo did nothing | Snapshot taken at drag start, one undo step per drag, none for plain clicks |
| Images | `<img>` serialised to `{}` by undo/save/autosave, so `drawImage` threw afterwards | Images stored by `src`, rehydrated on undo/redo/load/paste |
| Context menu | "Copy" passed a string, not a function | Fixed |
| Selection | Marquee selected only the first object | Multi-select, Shift-click, marquee, **Group / Ungroup** (Ctrl+G / Ctrl+Shift+G), group move/resize/copy/delete |
| Resizing | Only text had a handle | Corner handles for every shape and any selection; numeric X/Y/W/H panel now works |
| Machine tab | Stub button, no code | Connect (USB / serial, read-only), Simulator, stage report, diagnostics, cut-path SVG export |

## Machine tab

- **Connect USB Device (WebUSB)** and **Select Serial Port (Web Serial)** open the browser's own chooser. Both are read-only.
- **Use SIMULATED Machine** runs jobs against a virtual device: progress, cancel, and injectable faults.
- **Export Cut Paths (SVG, mm)** writes the design's cut lines in millimetres, so you can cut with any other tool that is known to work with your machine.
- **Copy Diagnostics** copies the device IDs and browser info. Send these with any compatibility report.
- The Stage panel shows which of the 8 connectivity stages are real, simulated, or not implemented.
- Text is exported as outlines when the font file is available; raster images are skipped with a warning.

## Linux access (general guidance, **not tested on Bazzite or with a real Cricut**)

1. Use a Chromium-based browser. WebUSB works in Chrome/Chromium/Brave. **Web Serial is off by default in Brave**: enable `brave://flags/#brave-web-serial-api`. Firefox supports neither API.
2. Without a udev rule the browser usually gets "permission denied". After you have the vendor/product ID (`lsusb`, or **Copy Diagnostics**), generate a rule that grants your logged-in desktop user access without root or group changes: `./tools/make-udev-rule.sh 0xVVVV 0xPPPP` prints the rule. To install it: `sudo tee /etc/udev/rules.d/70-cricut.rules`, then `sudo udevadm control --reload && sudo udevadm trigger`. It is reversible by deleting that file. On Bazzite `/etc` is writable and survives updates.
3. If the kernel has bound a driver to the device (for example `cdc_acm` creating `/dev/ttyACM0`), WebUSB may be unable to open it; use Web Serial instead. This is a hypothesis to verify with `lsusb -v` and `dmesg`.
4. Flatpak browsers sandbox device access; behaviour was not tested. A native or layered install is the simplest first test.

## Tests

```
npm install                       # installs Playwright (dev only)
npx playwright install chromium   # or set CHROMIUM=/path/to/chrome
npm test                          # 134 tests: unit 22 + 17 + 12, real-browser 20 + 20 + 2 + 4 + 22 + 7 + 8
# font tests need DejaVu fonts or FONT_TTF / FONT_BOLD_TTF=/path/to.ttf
npm run build                     # rebuilds index.html from src/
```

Everything involving a device uses mocks or the simulator. See `docs/TEST_REPORT.md` for exactly what was and was not run.

## Layout

```
index.html            built single-file app (open this)
original/             your untouched v4 file
src/layers-panel.js   floating Layers panel (v6.6)
src/app.html          v4 with minimal patches (tools/patch_core.py derives it from original/)
src/core-engine.js    selection, grouping, transforms, drag/resize, path objects
src/textpaths.js      glyph outlines -> polylines, curve/warp placement
src/svgexport.js      SVG builder
src/fonts.js          system fonts, font upload, text-to-shapes
src/export-ui.js      Export dialog
src/undo-ui.js        Undo / Redo header buttons
src/mat-ui.js         Mat colour picker
src/theme.css         colour theme overrides
src/maskops.js        wand algorithms (flood fill, outline tracing)
src/swatches.js       swatch library panel + Bucket tool
src/wand.js           Magic Wand tool
swatches/             optional built-in library (see Swatch section)
src/vendor/           opentype.js 1.3.4 (MIT, inlined)
src/machine.js        hardware layer: job preparation, simulator, read-only USB/serial probes
src/machine-ui.js     Cut tab + Console wiring
tools/                make-swatches.py/.js, build.js, patch_core.py, serve.sh, make-udev-rule.sh
tests/                unit + browser tests, screenshot helper, original-baseline probe
docs/                 RESEARCH, CHANGES, TEST_REPORT, LIMITATIONS, screenshots
```

## Troubleshooting

- **"WebUSB is not available"**: use Chromium/Brave over `localhost` or `file://`.
- **"Permission denied"**: install the udev rule (above), replug the device.
- **"Device could not be opened (busy)"**: close Design Space or anything else using the device.
- **Chooser shows nothing**: the device is not enumerated; check the cable and `lsusb`.
- **Cut button says protocol unknown**: expected for real hardware; see the box at the top.

# GNU AFFERO GENERAL PUBLIC LICENSE

Version 3, 19 November 2007

## Copyright and Project Attribution

**Modified Project:** OpenCut DSA

**Additional Modifications and Contributions Copyright (C) 2026 SUBARC**

**Original Project:** Stick-It-To-Cricut

**Original Author:** EdaDyckATpmDOTme

**Original Copyright (C) 2026 Stick-it-too-Cricut Contributors**

**Original Project Repository:**\
[https://github.com/EdaDyckATpmDOTme/Stick-It-To-Cricut](https://github.com/EdaDyckATpmDOTme/Stick-It-To-Cricut)

## License Notice

OpenCut DSA is a substantially modified and expanded derivative of Stick-It-To-Cricut, originally created by EdaDyckATpmDOTme.

The original application has been renamed, extensively redesigned, and expanded with substantial additional functionality, improvements, and modifications.

OpenCut DSA acknowledges and credits the original author and preserves the applicable copyright notices and licensing obligations of the original project.

This project incorporates code from the original application and is distributed under the GNU Affero General Public License version 3, or (at your option) any later version (AGPL-3.0-or-later).

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see:

[https://www.gnu.org/licenses/](https://www.gnu.org/licenses/)

## Full License Text

The complete GNU Affero General Public License version 3 applies to this project.

The full license text is available at:

[https://www.gnu.org/licenses/agpl-3.0.txt](https://www.gnu.org/licenses/agpl-3.0.txt)

**OpenCut DSA is distributed under AGPL-3.0-or-later.**
