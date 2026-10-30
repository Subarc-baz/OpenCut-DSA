SWATCH LIBRARY
==============
1. Drop images into this folder (you can use sub-folders): .png .jpg .jpeg .gif .webp .svg
   (SVG files need width= and height= attributes.)  Seamless/tileable images look best.
2. Run ONE of:
       python3 tools/make-swatches.py
       node tools/make-swatches.js
   This writes swatches/swatches.js.
3. Reload index.html (keep the swatches/ folder next to it).

In the app: Swatch Library panel (right side) -> click a swatch -> Bucket tool (B) -> click a shape.
Images over 8 MB are skipped. Smaller images (under ~1 MB) keep the app fast.
