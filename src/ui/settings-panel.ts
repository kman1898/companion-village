import { params, SAVE_KEY, saveSettings, settings, type DayLength, type EventsMode, type Quality, type RivalsMode } from '../core/settings'
import { store } from '../core/util'
import { EVENTS, startEvent } from '../game/events'
import { newGame } from '../game/save'
import { G } from '../game/state'
import { poll } from '../net/companion'
import { parts } from '../render/particles'
import { applyQuality, invalidateTreeLayer } from '../render/renderer'
import { clearSpriteCaches } from '../render/sprites'
import { renderBaseTerrain } from '../render/terrain'
import { resetTraffic } from '../game/traffic'
import { clearTicker } from './notify'
import { closeModals, toggleModal } from './hud'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export function initSettings() {
	$('gear').addEventListener('click', openSettings)
	const sel = $<HTMLSelectElement>('s-event')
	sel.innerHTML = Object.entries(EVENTS).map(([k, e]) => `<option value="${k}">${e.icon} ${e.name}</option>`).join('')
	$('s-trigger').addEventListener('click', () => {
		startEvent(sel.value)
		closeModals()
	})
	$('s-add').addEventListener('click', () => G.S.queue++)
	const dl = $<HTMLAnchorElement>('s-download')
	dl.href = location.href.split('#')[0].split('?')[0]
	$('s-save').addEventListener('click', () => {
		const host = $<HTMLInputElement>('s-host').value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'localhost:8888'
		const variable = $<HTMLInputElement>('s-var').value.trim().replace(/^custom:/, '').replace(/^\$\(custom:|\)$/g, '') || 'village_presses'
		if (host !== settings.host || variable !== settings.variable) G.S.lastCounter = null
		const quality = $<HTMLSelectElement>('s-quality').value as Quality
		const qualityChanged = quality !== settings.quality
		Object.assign(settings, {
			host, variable, quality,
			speed: Number($<HTMLSelectElement>('s-speed').value) || 1,
			events: $<HTMLSelectElement>('s-events').value as EventsMode,
			dayLength: $<HTMLSelectElement>('s-day').value as DayLength,
			inventionYears: Number($<HTMLSelectElement>('s-pace').value) || 10,
			rivals: $<HTMLSelectElement>('s-rivals').value as RivalsMode,
		})
		saveSettings()
		if (qualityChanged) applyQuality()
		closeModals()
		if (params.demo < 0) poll()
	})
	$('s-reset').addEventListener('click', () => {
		if (!confirm('Start a brand new village? The current one will be lost.')) return
		const last = G.S.lastCounter
		store.del(SAVE_KEY)
		newGame()
		G.S.lastCounter = last
		parts.length = 0
		resetTraffic()
		clearSpriteCaches()
		invalidateTreeLayer()
		renderBaseTerrain()
		clearTicker()
		closeModals()
	})
}

export function openSettings() {
	$<HTMLInputElement>('s-host').value = settings.host
	$<HTMLInputElement>('s-var').value = settings.variable
	$<HTMLSelectElement>('s-speed').value = String(settings.speed)
	$<HTMLSelectElement>('s-events').value = settings.events
	$<HTMLSelectElement>('s-quality').value = settings.quality
	$<HTMLSelectElement>('s-day').value = settings.dayLength
	$<HTMLSelectElement>('s-pace').value = String(settings.inventionYears)
	$<HTMLSelectElement>('s-rivals').value = settings.rivals
	if ($('settings').hidden) toggleModal('settings')
}
