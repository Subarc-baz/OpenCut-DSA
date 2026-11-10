# Known limitations and remaining work

## Hardware (the important ones)
* **No real cutting.** No verified Maker 3 job protocol is available. `sendJob()` on real adapters always refuses with `PROTOCOL_UNKNOWN`. This is intentional.
* **Model not auto-identified.** The known-device table is empty because no Cricut USB IDs were found in primary sources. Use **Copy Diagnostics** and `lsusb` to find your IDs.
* **Real device discovery is untested on real Cricut hardware.** The app was created and tested on Linux Bazzite in Brave, Chrome and Firefox; no Cricut was connected.
* **Bluetooth is not implemented.** Web Bluetooth was out of scope per your choice of USB, and no Maker 3 BLE protocol is documented in what I found.
* Opening a USB handle or listening on a serial port was not verified to be harmless on a real Maker 3. Serial listening opens the port (this can toggle DTR/RTS on some devices) and is behind an explicit button.

## Editor
* Raster images are **not exported as cut paths** (embedded in SVG only; skipped for cut paths with a warning). They need tracing.
* **Text to paths needs the font file.** Generic families (sans-serif, serif...) cannot be converted; the export falls back to `<text>` with a warning. A face missing from a family (e.g. no bold) is matched to the nearest face, so weight/slant may differ from the canvas.
* **Local Font Access API is Chromium-only** (Brave may disable it). Fallback: Add font file(s). Fonts loaded from the system must be re-loaded each session unless the browser remembers the permission.
* Not supported: WOFF2 and .ttc/.otc files; variable fonts use their default instance; ligatures and complex-script shaping are not reproduced in outlines.
* Converted text is one compound path object, not separate letters, and cannot be edited as text again (undo it, or keep a copy of the text).
* No rotation, skew, boolean operations (weld/slice/attach) or SVG import beyond what v4 had.
* Radius-based shapes (star, polygon) scale uniformly even when a group is stretched non-uniformly.
* Groups are flat; grouping two groups merges them into one.
* Resizing does not scale stroke width.
* `draw()` is not frame-throttled (unchanged from v4); very large designs may redraw slowly.
* The v4 wrapper chain around `onDown/onMove/onUp/draw` was kept for safety; it works but is fragile to extend.
* The built-in Maker 3 mat is 12×12 in (as in v4); the 12×24 mat is not offered.

## Remaining work for real machine operation
See "What would unblock real cutting" in `RESEARCH.md`: capture the official software's USB traffic on your own machine, determine whether it is encrypted/authenticated, weigh the licence and legal history, then implement a transport and encoder behind the existing adapter, and test only with explicit authorisation and scrap material. Until then, use **Export Cut Paths (SVG)** with a tool known to support your machine.

## v6.1
* Mat colour is not saved inside project files (browser-local only).
* Ctrl+Z / Ctrl+Y are ignored while a text box or dropdown has keyboard focus (so typing is not disturbed); click the canvas first or use the Undo button.

## v6.2 (swatches, bucket, wand)
* The library is read at page load from `swatches/swatches.js`; after adding images re-run the generator and reload. A browser page cannot list a folder by itself. If `index.html` is moved without the `swatches/` folder the library is simply empty (use `--inline-swatches` for a single file).
* Swatch images over 8 MB are skipped; very large libraries slow start-up (all swatches live in memory as data URLs).
* SVG swatches need explicit width/height. Pattern tiles keep their aspect ratio from the image; tile size is by width.
* Pattern fills are anchored to the object's top-left and do not rotate or scale with the object (resize the object and the tile size stays; use the slider). Only the Bucket applies patterns (drawing tools use solid colours).
* A pattern fill is for looks and print-then-cut SVGs; the Maker "cut paths" export ignores fills.
* Bucket fills whole shapes only (not pixel regions of images). Images cannot be bucket-filled.
* Wand: analyses the flat picture of the design at up to 2x (capped at 2400 px on the long side), so outlines are accurate to about half a design pixel. One selection at a time; changing, moving or recolouring anything drops it. It selects/outlines; it does not erase pixels. It selects by colour only: two touching pieces of the same colour (e.g. overlapping letters of one colour) are one region; use "Only the object under the click" to separate them. Outlines are simplified polylines (not Bezier curves). Tolerance compares each of R, G, B and A separately against the clicked colour (average for 3x3/5x5 samples), which is close to, but not guaranteed identical to, Photoshop's internal metric. Contiguity is 4-connected.
* Diagonally touching pixels become one outline touching at the corner.
* Escape clears a wand region first; a second Escape deselects and returns to Select.

## v6.3
* Choose folder uses the browser's standard folder picker (tested through a real file input). Browsers show their own "upload this folder?" confirmation.
* Swatches you add are stored in this browser's IndexedDB: clearing site data removes them, and they are not shared between browsers or computers. Projects reference swatches by name (`user/...`), so a project opened where that swatch is missing shows the plain fill colour.
* Select subject assumes a plain or transparent background touching the image border; photos with busy backgrounds will not separate cleanly.
* The wand's region select compares colours directly (like Photoshop's default); on JPEG photos a low tolerance picks only a speckled patch, so raise Tolerance.

## v6.5
* **Why "Load system fonts" can find nothing on Windows (or anywhere):** the browser feature it uses (Local Font Access API, `queryLocalFonts`) exists only in Chrome and Edge 103+ on a computer. Firefox and Safari do not have it, and Brave may block it. It also needs you to click Allow on the permission prompt (a denied prompt can be re-enabled under the padlock > Site settings > Fonts). The app now says which of these applies. I could not test on Windows. The reliable route is **Add font folder...** with `C:\Windows\Fonts` (and `%LOCALAPPDATA%\Microsoft\Windows\Fonts` for per-user fonts): only .ttf/.otf/.woff are loaded; .ttc collections (e.g. MS Gothic, Cambria) and .woff2 are skipped, and big CJK fonts can be slow.
* Painting a selection creates a new shape on top of the original; it does not edit image pixels, so removing the new shape restores the original look.
* Wand selections persist only while the design is unchanged; moving, recolouring or adding anything (other than painting the selection itself) drops it.

## v6.6
* Filling part of a plain shape (rectangle, ellipse, star, polygon, text object) cannot split it; use **Fill in new layer**, or convert text first. Pieces are decided by majority (> 50 %) coverage.
* Filling a selection on an **image** recolours pixels with a single colour (a swatch uses its average colour, not the tiled pattern).
* Filling creates one new object per partly selected path; the selection itself is kept so you can fill again.

## v6.7
* PNG canvases live only in the open page: they are **not** saved in project files or autosave (export the PNG, or keep the tab open). Reloading the page closes them.
* Very large canvases are refused (over 16000 px a side or 100 megapixels), because browsers cannot allocate them.
* Cutting and the machine panel work on the mat only.

## v6.8
* A wand copy is a **picture** (pixels), not cut outlines. For a cuttable shape use Make cut path.
* With no fonts loaded, new text is drawn in the browser's default sans-serif and cannot be converted to shapes until a font is loaded (Fonts...).
* If you deliberately want text in exactly #ff3fc8 (the factory magenta), pick it via another shade; that exact value is treated as "unchanged" and becomes black.
* Fonts folder: the bundle is made by the app, not by copying font files into the folder (a file:// page cannot read a folder). Loading hundreds of fonts from the bundle slows start-up (each is parsed). If you open the app through `./tools/serve.sh`, the same bundle is used.
* If a browser refuses to keep added fonts, the Fonts window now reports it.

## v6.10
* Printing goes through the browser's print dialog, which I cannot drive or test here (no printer; headless Chromium has none). The page handed to it is verified (exact size, one page). Choose "100% / actual size" there, and turn off headers and footers.
* No Cricut sensor marks, and no cutting: the app cannot make a Maker read or cut a printed sheet. The cut-line SVG is for other cutting software or hand cutting.
* Cut lines follow what is drawn: a sticker made of separate pieces gets one outline per piece (use a larger offset, or group and merge them as one shape, to get one outline). The cut line sits on the artwork edge plus the offset; there is no extra printed bleed.
* The printer cannot print to the paper edge (set the margin to your printer's limit, usually 0.25 in).

## v6.12 additions
* **Shape Warp** works on one object at a time. A warped shape is stored as a path (the original is kept inside it and comes back with None). Rounded rectangles, stars and polygons become dense polylines, not curves, when warped. Warping a flat or vertical shape only shows effects that depend on its width and height (lines use their own direction). Images and text are not warped by it. Resizing a warped star or polygon keeps its proportions when you remove the warp.
* The support/donate button was removed on purpose; nothing replaces it yet.

## v6.13 additions
* Only images and text rotate. Other shapes have no rotation field; Shape Warp (Slant) can skew them but not turn them.
* Selecting a rotated object with a rubber band uses its rotated bounding box. Scaling a rotated image together with other objects scales it uniformly about its centre (so it stays a rectangle).
* Line thickness is a plain stroke width with square (butt) ends; it is not yet an outline offset, so a very thick line cuts as one stroke path in the machine layer.

## v6.14 additions
* Weld/Subtract/Intersect/Slice flatten curves into short straight segments (ellipses 128 points, other curves as they are), so a welded circle is a many-sided polygon. Offset uses round corners only.
* A rotated shape's selection box and its marquee selection use the rotated box; an ellipse's box is its rectangle, not the exact curve.
* Subtract always subtracts from the lowest selected shape; Slice needs exactly two shapes. Open lines and images cannot be combined (convert a line with Line to Outline first).
* Rotated shapes scale uniformly when scaled together with other objects.

## v6.15 additions
* Node editing keeps one level of detail: traced or wand paths turn into corner points on every outline vertex, so they can have hundreds of points. Text must be converted to shapes first (Fonts window / Convert Text to Shapes) before its points can be edited.
* Entering point editing on a rotated shape bakes the rotation into the points (the Rot field then reads 0), and on a warped shape it bakes the warp (the None option no longer restores the original).
* Rounded rectangles keep a circular corner when converted to points; changing Corner Radius afterwards no longer applies.
* Pen paths with more than one open sub-path are treated as closed; the pen tool itself makes one sub-path at a time.
* No guides or smart snapping yet (grid snap only).
