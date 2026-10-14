// Copies the built village app (../dist/index.html, from `npm run build` in the repo root) into the module package.
import { copyFileSync, existsSync } from 'node:fs'

const src = new URL('../../dist/index.html', import.meta.url)
if (!existsSync(src)) {
	throw new Error('Village app not built yet. In the repo root run: npm install && npm run build')
}
copyFileSync(src, new URL('../village.html', import.meta.url))
console.log('Copied the village app into the module (village.html)')
