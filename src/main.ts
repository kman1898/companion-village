import './style.css'
import { params, settings } from './core/settings'
import { TRIBE_IDS } from './data/tribes'
import { startEvent } from './game/events'
import { invent } from './game/history'
import { load, save } from './game/save'
import { update } from './game/sim'
import { G, player, popOf, tribeOf } from './game/state'
import { declareWar, startRaid } from './game/war'
import { addYears } from './game/tribes'
import { poll } from './net/companion'
import { syncModules } from './net/module'
import { remoteHooks } from './game/remote'
import { initRenderer, perf, render } from './render/renderer'
import { renderBaseTerrain } from './render/terrain'
import { cam, updateCamera } from './view/camera'
import { initInput, updateKeys } from './view/input'
import { closeModals, initHud, toggleModal, updateHud } from './ui/hud'
import { initNotify, muteBanners, ticker } from './ui/notify'
import { initSettings, openSettings, setPlayer } from './ui/settings-panel'

// Errors on screen (handy in OBS / on a show machine)
const errBox = document.getElementById('err')!
window.addEventListener('error', (e) => {
	errBox.style.display = 'block'
	errBox.textContent += `${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n`
})

if (!params.hud) document.body.classList.add('hidehud')

initNotify()
load()
G.S.player = settings.player
const canvas = document.getElementById('cv') as HTMLCanvasElement
initRenderer(canvas)
renderBaseTerrain()
initInput(canvas)
initHud()
initSettings()

if (params.demo >= 0) {
	for (const T of G.S.tribes) T.queue += params.demo
	if (settings.aiPace === 'match') settings.aiPace = 'steady'
}
poll()
syncModules()
remoteHooks.setPlayer = setPlayer

muteBanners(params.warp > 0)
for (let t = 0; t < params.warp; t += 0.1) update(0.1, 0.1)
muteBanners(false)
updateCamera(100)
if (G.resumed) ticker(`Welcome back to year ${player().year} — ${popOf(player())} villagers kept the fires burning`, '⚑')

const perfEl = document.getElementById('perf')!
window.addEventListener('keydown', (e) => {
	if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
	if (!settings.chosen) return
	const k = e.key.toLowerCase()
	if (k === 'h') document.body.classList.toggle('hidehud')
	else if (k === 's') document.getElementById('settings')!.hidden ? openSettings() : closeModals()
	else if (k === 'i') toggleModal('inventions')
	else if (k === 'd') toggleModal('diplomacy')
	else if (k === 'p') perfEl.hidden = !perfEl.hidden
	else if (k === 'k') G.paused = !G.paused
	else if (k === ' ') {
		addYears(player(), 1)
		e.preventDefault()
	} else if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
	else if (k === 'escape') closeModals()
})
window.addEventListener('beforeunload', save)

setInterval(updateHud, 300)
updateHud()

if (params.debug)
	Object.assign(window, {
		__village: {
			G, perf, cam, startEvent, tribeOf, TRIBE_IDS,
			invent: (id: string, n = 1) => {
				for (let i = 0; i < n; i++) invent(tribeOf(id as never), true)
			},
			war: (a: string, b: string) => {
				declareWar(tribeOf(a as never), tribeOf(b as never))
				startRaid(tribeOf(a as never), tribeOf(b as never))
			},
			setTime: (t: number) => (G.S.dayTime = t),
		},
	})

let last = performance.now()
function frame(now: number) {
	// rAF timestamps can be slightly older than performance.now() on the first frame
	const rdt = Math.max(0, Math.min(0.1, (now - last) / 1000))
	last = now
	updateKeys(rdt)
	const t0 = performance.now()
	if (!G.paused) update(rdt * settings.speed, rdt)
	const simMs = performance.now() - t0
	updateCamera(rdt)
	render(rdt)
	if (!perfEl.hidden)
		perfEl.textContent = `${perf.fps.toFixed(0)} fps  ${perf.frameMs.toFixed(1)} ms/frame\nsim ${simMs.toFixed(2)} ms  draw ${perf.renderMs.toFixed(2)} ms\nres ×${perf.rs}  objects ${perf.drawn}\nvillagers ${G.S.tribes.map((t) => t.villagers.length).join('/')}  quality ${settings.quality}`
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
