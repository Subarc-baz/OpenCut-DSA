"""v6.3 patch step: remove the Cricket Splat game and Webcam capture; install the new logo and the name OpenCut DSA.
Every replacement is asserted, so a mismatch fails the build instead of silently doing nothing."""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))


def cut(s, a, b):
    i = s.index(a); j = s.index(b, i)
    return s[:i] + s[j:]


def sub_once(s, pattern, repl, flags=0):
    s, n = re.subn(pattern, repl, s, flags=flags)
    assert n == 1, (pattern, n)
    return s


def rep(s, old, new):
    assert s.count(old) == 1, (old[:60], s.count(old))
    return s.replace(old, new)


def apply(s):
    svg = re.sub(r'>\s+<', '><', open(os.path.join(HERE, 'logo.svg')).read().replace('\n', '').strip())
    assert "'" not in svg and '\\' not in svg
    # game: CSS, panel, tab button, code, assets
    s = cut(s, '/* GAME */', '/* FOOTER */')
    s = cut(s, '  <!-- GAME -->', '</main>')
    s = cut(s, 'function initGame(){', '// Draggable floating toolbar')
    s = sub_once(s, r'  <button class="vtab" data-t="game"[^\n]*\n', '')
    s, n = re.subn(r'^var (SPRITE|ASSET|BG)_URI="[^\n]*\n', '', s, flags=re.M); assert n == 3, n
    s = rep(s, 'initDragDrop();initGame();initShortcuts();', 'initDragDrop();initShortcuts();')
    s = sub_once(s, r"^console\.log\('%c\\u\{1F997\} RICKET[^\n]*\n", '', re.M)
    # webcam: function and toolbar button
    s = cut(s, '// === WEBCAM CAPTURE TO CANVAS ===', '// === QR CODE GENERATOR ===')
    s = cut(s, '  // Webcam\n  var wc=', '  // QR Code\n')
    # logo (SVG data URI; also used for the favicon and the donate dialog) and name
    s = sub_once(s, r'^var LOGO_URI="[^\n]*\n', lambda m: 'var LOGO_URI="data:image/svg+xml,"+encodeURIComponent(\'' + svg + '\');\n', re.M)
    s = rep(s, '<span class="brand">Stick-it-too-Cricut</span>', '<span class="brand">OpenCut DSA</span>')
    s = rep(s, '<div class="cline sys">Stick-it-too-Cricut Serial Console v1.0</div>', '<div class="cline sys">OpenCut DSA Serial Console v1.0</div>')
    s = rep(s, '<h2>Support Stick-it-too-Cricut</h2>', '<h2>Support OpenCut DSA</h2>')
    return s
