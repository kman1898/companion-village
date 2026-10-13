import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Everything is inlined into one index.html: the same file runs on GitHub Pages
// and as a downloaded offline copy opened straight from disk (file://).
export default defineConfig({
	base: './',
	plugins: [viteSingleFile()],
	build: { target: 'es2022', assetsInlineLimit: 100_000_000 },
})
