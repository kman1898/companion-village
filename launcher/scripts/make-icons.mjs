// Renders the launcher's icons from build/*.svg (needs rsvg-convert: `brew install librsvg` or `apt install librsvg2-bin`).
// The PNGs are committed, so this only has to run after changing an SVG.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const render = (svg, out, size) => execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', at(out), svg])

// electron-builder makes the .icns / .ico from this one
render(at('build/icon.svg'), 'build/icon.png', 1024)
render(at('build/icon.svg'), 'assets/icon.png', 256)
// macOS menu bar: black template image, the system tints it
render(at('build/tray.svg'), 'assets/trayTemplate.png', 16)
render(at('build/tray.svg'), 'assets/trayTemplate@2x.png', 32)
// Windows / Linux tray: the same shape in the village's gold
const gold = path.join(mkdtempSync(path.join(tmpdir(), 'village-icons-')), 'tray.svg')
writeFileSync(gold, readFileSync(at('build/tray.svg'), 'utf8').replaceAll('#000', '#f2c75c'))
render(gold, 'assets/tray.png', 32)
console.log('Icons rendered')
