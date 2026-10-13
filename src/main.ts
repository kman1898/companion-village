import './style.css'
import { params, settings } from './core/settings'
import { CY, G, popCount } from './game/state'
import { load } from './game/save'
import { save } from './game/save'
import { update } from './game/sim'
import { conn, poll } from './net/companion'
import { initRenderer, perf, render } from './render/renderer'
import { renderBaseTerrain } from './render/terrain'
import { cam, updateCamera } from './view/camera'
import { initInput, updateKeys } from './view/input'
import { closeModals, initHud, toggleModal, updateHud } from './ui/hud'
import { startEvent } from './game/events'
import { initNotify, muteBanners, ticker } from './ui/notify'
import { initSettings, openSettings } from './ui/settings-panel'

// Errors on screen (handy in OBS / on a show machine)
const errBox = document.getElementById('err')!
window.addEventListener('error', (e) => {
	errBox.style.display = 'block'
	errBox.textContent += `${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n`
})

if (!params.hud) document.body.classList.add('hidehud')

initNotify()
load()
const canvas = document.getElementById('cv') as HTMLCanvasElement
initRenderer(canvas)
renderBaseTerrain()
initInput(canvas)
initHud()
initSettings()

if (params.demo >= 0) {
	conn.state = 'demo'
	G.S.queue += params.demo
	setInterval(() => {
		if (Math.random() < 0.5) G.S.queue++
	}, 4000)
} else {
	poll()
}

muteBanners(params.warp > 0)
for (let t = 0; t < params.warp; t += 0.1) {
	if (params.demo >= 0 && Math.random() < 0.1 / 8) G.S.queue++
	update(0.1, 0.1, CY + 15)
}
muteBanners(false)
updateCamera(100)
if (G.resumed) ticker(`Welcome back to year ${G.S.year} — ${popCount()} villagers kept the fires burning`, '⚑')

const perfEl = document.getElementById('perf')!
window.addEventListener('keydown', (e) => {
	if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
	const k = e.key.toLowerCase()
	if (k === 'h') document.body.classList.toggle('hidehud')
	else if (k === 's') document.getElementById('settings')!.hidden ? openSettings() : closeModals()
	else if (k === 'i') toggleModal('inventions')
	else if (k === 'p') perfEl.hidden = !perfEl.hidden
	else if (k === ' ') {
		G.S.queue++
		e.preventDefault()
	} else if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
	else if (k === 'escape') closeModals()
})
window.addEventListener('beforeunload', save)

setInterval(updateHud, 300)
updateHud()

if (params.debug) Object.assign(window, { __village: { G, perf, cam, startEvent } })

let last = performance.now()
function frame(now: number) {
	const rdt = Math.min(0.1, (now - last) / 1000)
	last = now
	updateKeys(rdt)
	const t0 = performance.now()
	update(rdt * settings.speed, rdt, cam.y + cam.vh / 2 / cam.s + 1)
	const simMs = performance.now() - t0
	updateCamera(rdt)
	render(rdt)
	if (!perfEl.hidden)
		perfEl.textContent = `${perf.fps.toFixed(0)} fps  ${perf.frameMs.toFixed(1)} ms/frame\nsim ${simMs.toFixed(2)} ms  draw ${perf.renderMs.toFixed(2)} ms\nres ×${perf.rs}  objects ${perf.drawn}\nvillagers ${G.S.villagers.length}  quality ${settings.quality}`
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
