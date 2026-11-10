# Test report (v6)

The app was created and tested on Linux Bazzite in Brave, Chrome and Firefox. The automated suite below runs in Node 22.22.0 with Playwright 1.56.0 and headless **Chromium 141**. **No Cricut hardware was available. No test touched a real device.** Every device in these tests is a mock injected into the page or the labelled simulator.

## Results
| Suite | Result |
|---|---|
| `tests/unit.test.js` (machine layer, Node) | **22 / 22 passed** |
| `tests/textpaths.unit.test.js` (outline geometry, font matching) | **17 / 17 passed** |
| `tests/browser.test.js` (built `index.html` in real Chromium) | **20 / 20 passed** |
| `tests/fonts.browser.test.js` (fonts, text-to-shapes, SVG export; `queryLocalFonts` is a **mock**) | **20 / 20 passed** |
| `tests/undo.browser.test.js` (Undo/Redo buttons, shortcuts) | **2 / 2 passed** |
| `tests/mat.browser.test.js` (mat colour, undo of text-to-shapes via the UI) | **4 / 4 passed** |
| `tests/maskops.unit.test.js` (wand algorithms, subject mask, SVG pattern export) | **12 / 12 passed** |
| `tests/swatch.browser.test.js` (library, in-app loading, folder input, bucket, wand incl. letters/counters/converted text/overlaps, branding/removals) | **22 / 22 passed** |
| `tests/v65.browser.test.js` (selection persistence, painting a selection, mode buttons, font folder/messages, theme) | **7 / 7 passed** |
| `tests/v66.browser.test.js` (fill changes the object, T split, whole object, refusal, new-layer button, image pixels, deselect routes, Layers panel, per-letter convert) | **8 / 8 passed** |
| `tests/v67.browser.test.js` (PNG canvas: size/dpi/validation, checkerboard + boundary + bar, tabs, copy/paste across tabs, several canvases, resize/close, transparent export of exact size, mat unchanged) | **5 / 5 passed** |
| `tests/v68.browser.test.js` (wand copy, text resize keeps font, real fonts only, black default text) | **4 / 4 passed** |
| `tests/v69.browser.test.js` (fill empty space, swatch on empty space, positive space still recolours) | **3 / 3 passed** |
| `tests/v69fonts.browser.test.js` (fonts bundle save/load in a fresh profile, no bundle, storage refused) | **3 / 3 passed** |
| `tests/v610.browser.test.js` (print sheet layout/pixels, cut lines, cut-line SVG, one-page PDF, entry points) | **5 / 5 passed** |
| **Total** | **154 / 154** |
| Syntax check (`node --check`) of every JS file, plus parse of all 4 inline `<script>` blocks in `index.html` | passed |
| Packaged copy: ZIP extracted to an empty directory and the full suite re-run there | passed (see the final message for the run) |

One failing test existed during development, a test-helper bug (my helper overwrote Playwright's `click`), and one test used a single wheel event where twelve were needed. Both were fixed in the tests, not the app. No application code was changed to make a test pass.

## What the browser tests cover
Draw all five shape types with the mouse; drag each and check the **drawn geometry** moved (not only the hit-box); click without movement adds no undo step; a drag is one undo step and undo/redo restore position; dragging while zoomed and panned; marquee multi-select; group; selecting a group from one member; group moves by one common delta and leaves non-members alone; ungroup; Shift-click add/remove; copy/paste of groups remaps group ids; delete and undo of a group; corner-handle resize for a rect, an ellipse and a group (Shift keeps aspect); numeric X/Y/W/H panel; images across undo/redo/copy; export PNG/SVG and save project; context-menu Copy; no uncaught page errors in any of them.
Machine panel: simulator connect and cut, injected transfer fault then recovery, cut with nothing connected, empty design, mock USB connect (verifies **zero** `transferOut` and `claimInterface` calls), raw console send blocked for real devices, dismissed chooser, busy device, retry, and a browser with no WebUSB.

## What the unit tests cover
Job geometry (96 px = 25.4 mm, every shape type, rounded rects, hidden objects, text/image skipped **with warnings**, NaN, empty, oversized, off-mat, SVG output); simulator success, progress, not-connected, invalid job, connect failure, mid-transfer fault, cable pull, cancel, timeout; mock WebUSB (unsupported, descriptors only, dismissed, permission denied, busy, open timeout, unplug event, send refused with nothing written); mock Web Serial (port not opened on select, receive-only listener never writes); empty known-device table; stage report honesty; udev rule and diagnostics text.

## Baseline evidence on the original v4 (`tests/original-baseline.js`)
Run on the untouched original in the same Chromium: page error `resizingText is not defined`, and **no rectangle or ellipse could be created by mouse** (objects.length stayed 0). With only that one-line fix applied, rectangles drag correctly but an ellipse's `x/y` changed while its `cx/cy` did not (drawing stayed put).
Running the v5 browser suite against the original fails all 13 editor tests. That number is **not** a meaningful before/after comparison, because most of those tests exercise features v4 never had (grouping, multi-select, machine panel). The baseline probe above is the fair evidence.

## Not done / not possible
* **Real hardware of any kind: not tested.** Real WebUSB/Web Serial against a physical device, udev behaviour, kernel driver binding, Maker 3 enumeration: all untested.
* Job transfer and cutting: not implemented (no verified protocol), so nothing to test.
* Not run: load/performance profiling, touch input, high-DPI beyond the default, very large designs beyond the 200,000-point guard, text-effect rendering (unchanged v4 code).
* A human has not used the UI. I looked at two screenshots (`docs/img/`) and found it rendered correctly.
* The pre-existing text-tool resize handle and text effects code were left unchanged and are covered only by "no page errors" in the flows above.

## v6 notes
* Font tests need DejaVu Sans / Bold (or `FONT_TTF`, `FONT_BOLD_TTF`); they skip otherwise.
* Fidelity: converted text and exported SVG were rendered and compared with the canvas by pixel overlap (IoU > 0.97 at large size for converted shapes, > 0.9 for exported SVG), plus bold face, hostile font names (no HTML injection), undo/redo/save/load of path objects.
* The real `queryLocalFonts` permission flow was **not** tested (headless Chromium, mock only). I viewed three screenshots (`docs/img/shot-v6-*.png`); no human used the UI.

## v6.2 notes
* Swatch/bucket/wand tests use generated PNG/SVG fixtures in a temp folder (`tests/pngwriter.js`), including a swatch whose file name is an HTML-injection string (rendered inert). Pixel-level checks confirm the pattern really paints, that the SVG export renders the swatch, and that wand regions match the known disc/block areas within ~4%.
* Not tested: a human using the UI with real photos/patterns; swatch libraries of tens of MB.

## v6.12 notes
`tests/v612.browser.test.js` (7 tests): Make Cut text and no donate button; no green UI colours and legible dark icons on the magenta selected-tool backdrop; magenta default fill; QR codes decode back to the exact text (ASCII, UTF-8, 120 characters); Shape Warp on rect/ellipse/line/star, None restores the exact original, undo; warped shapes move/resize, open lines stay open in SVG; header layout (palette beside the name, stacked pairs, buttons still work). The v6.5 theme test was updated for the new grey workspace and icon colour.

## v6.13 notes
`tests/v613.browser.test.js` (6 tests): line thickness handle drag, undo, minimum 1, line hit-testing on the line only, thickness scaling on uniform scale, rotation handle (free, Shift 15 degree, undo, double-click reset), rotated image pixels / hit-test / bounds, rotated corner resize keeps the opposite corner fixed, SVG image rotate transform, rotated text outlines swap width/height at 90 degrees. `tests/v612.browser.test.js` now also checks the palette sits left of PNG/Mat.

## v6.14 notes
`tests/v614.browser.test.js` (6 tests): rotation of every shape type (pixels, bounds, hit-test, SVG rotate transform, cut-job geometry, Rot field, line turn), rotation handle on each shape and rotated-frame corner resize, Weld/Subtract/Intersect/Slice areas checked against the exact expected values with undo, rotated shapes welding in their rotated place, Offset distances to within 0.5 px and the too-large-shrink message, Line to Outline geometry and undo.

## v6.15 notes
`tests/v615.browser.test.js` (6 tests): maroon theme (no magenta in computed styles, maroon gradient + white icon on the selected tool, logo recoloured, white text on the cut buttons), Pen tool corner points and closing, smooth points with handles and open paths via Enter (flattening, clicking on the curve, undo/redo), node editing (drag a corner, add a point, Alt smooth, Delete, Esc, undo back to the rectangle), a circle converting to four smooth points that stay round to 0.6 px and a rotated rectangle keeping its bounds, and the Arrange panel (align, even spacing, groups, undo).
