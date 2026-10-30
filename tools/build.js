#!/usr/bin/env node
// Builds ./index.html (single self-contained file) from src/app.html + src/*.js
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
let html = rd('app.html');
const need = ['/*@@CORE_ENGINE@@*/', '<!--@@MACHINE@@-->'];
need.forEach(m => { if (html.split(m).length !== 2) { console.error('marker missing/duplicated: ' + m); process.exit(1); } });
html = html.replace('/*@@CORE_ENGINE@@*/', () => rd('core-engine.js'));
// load order matters: vendor lib -> pure modules -> machine -> fonts -> export UI -> machine UI
const SCRIPTS = ['vendor/opentype.min.js', 'textpaths.js', 'svgexport.js', 'maskops.js', 'machine.js', 'fonts.js', 'export-ui.js', 'undo-ui.js', 'mat-ui.js', 'swatches.js', 'wand.js', 'layers-panel.js', 'machine-ui.js', 'png-canvas.js'];
const blocks = SCRIPTS.map(f => { const t = rd(f); if (/<\/script/i.test(t)) { console.error('forbidden </script in ' + f); process.exit(1); } return '<script>\n' + t + '\n</script>'; });
// Swatch library: by default index.html loads swatches/swatches.js (next to it); --inline-swatches embeds it for a true single file.
const swFile = path.join(root, 'swatches', 'swatches.js');
const swTag = process.argv.includes('--inline-swatches') && fs.existsSync(swFile)
  ? '<script>\n' + fs.readFileSync(swFile, 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>'
  : '<script src="swatches/swatches.js" onerror="window.SWATCH_LIB=window.SWATCH_LIB||[]"></script>';
const themeCss = fs.existsSync(path.join(root, 'src', 'theme.css')) ? '<style id="themeOverrides">\n' + rd('theme.css') + '\n</style>\n' : '';
html = html.replace('<!--@@MACHINE@@-->', () => themeCss + swTag + '\n' + blocks.join('\n'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('built index.html', html.length, 'bytes');
