# Known limitations and remaining work

## Hardware (the important ones)
* **No real cutting.** No verified Maker 3 job protocol is available. `sendJob()` on real adapters always refuses with `PROTOCOL_UNKNOWN`. This is intentional.
* **Model not auto-identified.** The known-device table is empty because no Cricut USB IDs were found in primary sources. Use **Copy Diagnostics** and `lsusb` to find your IDs.
* **Real device discovery is untested** on hardware, in Brave, or on Bazzite. Linux guidance in the README is general, not verified.
* **Bluetooth is not implemented.** Web Bluetooth was out of scope per your choice of USB, and no Maker 3 BLE protocol is documented in what I found.
* Opening a USB handle or listening on a serial port was not verified to be harmless on a real Maker 3. Serial listening opens the port (this can toggle DTR/RTS on some devices) and is behind an explicit button.

## Editor
* Raster images are **not exported as cut paths** (embedded in SVG only; skipped for cut paths with a warning). They need tracing.
* **Text to paths needs the font file.** Generic families (sans-serif, serif...) cannot be converted; the export falls back to `<text>` with a warning. A face missing from a family (e.g. no bold) is matched to the nearest face, so weight/slant may differ from the canvas.
* **Local Font Access API is only mock-tested.** It is Chromium-only and was **not verified in Brave or on Bazzite** (Brave may disable it). Fallback: Add font file(s). Fonts loaded from the system must be re-loaded each session unless the browser remembers the permission.
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
* Choose folder uses the browser's standard folder picker (tested through a real file input in Chromium; not tried in Brave/Firefox themselves). Browsers show their own "upload this folder?" confirmation.
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
