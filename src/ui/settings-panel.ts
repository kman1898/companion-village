import { params, SAVE_KEY, saveSettings, servedBy, settings, type AiPace, type Battles, type DayLength, type EventsMode, type Quality, type WarMode } from '../core/settings'
import { store } from '../core/util'
import { TRIBES, TRIBE_IDS, type TribeId } from '../data/tribes'
import { EVENTS, startEvent } from '../game/events'
import { newGame } from '../game/save'
import { G, tribeOf, type Control } from '../game/state'
import { poll } from '../net/companion'
import { syncModules } from '../net/module'
import { addYears } from '../game/tribes'
import { parts } from '../render/particles'
import { applyQuality, invalidateTreeLayer } from '../render/renderer'
import { clearSpriteCaches } from '../render/sprites'
import { renderBaseTerrain } from '../render/terrain'
import { followNow } from '../view/camera'
import { clearTicker } from './notify'
import { closeModals, toggleModal } from './hud'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export function initSettings() {
	$('gear').addEventListener('click', openSettings)
	const sel = $<HTMLSelectElement>('s-event')
	sel.innerHTML = Object.entries(EVENTS).map(([k, e]) => `<option value="${k}">${e.icon} ${e.name}</option>`).join('')
	$<HTMLSelectElement>('s-event-tribe').innerHTML = TRIBE_IDS.map((id) => `<option value="${id}">${TRIBES[id].icon} ${TRIBES[id].name}</option>`).join('')
	$<HTMLSelectElement>('s-player').innerHTML = TRIBE_IDS.map((id) => `<option value="${id}">${TRIBES[id].icon} ${TRIBES[id].name} (${TRIBES[id].dept})</option>`).join('')
	$('s-tribes').innerHTML = TRIBE_IDS.map((id) => `<div class="trow">
		<span class="tn" style="color:${TRIBES[id].color}">${TRIBES[id].icon} ${TRIBES[id].name}</span>
		<label>Driven by<select id="t-${id}-control"><option value="companion">Companion variable</option><option value="module">Companion module</option><option value="ai">AI</option></select></label>
		<label>Companion address<input id="t-${id}-host" spellcheck="false" /></label>
		<label>Counter variable<input id="t-${id}-var" spellcheck="false" /></label>
		<label>Command variable (optional)<input id="t-${id}-cmd" spellcheck="false" placeholder="${TRIBES[id].defaultCmd}" /></label>
	</div>`).join('')
	$('s-trigger').addEventListener('click', () => {
		startEvent(sel.value, $<HTMLSelectElement>('s-event-tribe').value as TribeId)
		closeModals()
	})
	$('s-add').addEventListener('click', () => addYears(tribeOf(G.S.player), 1))
	$<HTMLAnchorElement>('s-download').href = location.href.split('#')[0].split('?')[0]
	$('s-save').addEventListener('click', saveFromForm)
	$('s-reset').addEventListener('click', () => {
		if (!confirm('Start a brand new world? All three villages will be lost.')) return
		const counters = Object.fromEntries(G.S.tribes.map((t) => [t.id, t.lastCounter]))
		store.del(SAVE_KEY)
		newGame()
		for (const T of G.S.tribes) T.lastCounter = counters[T.id] ?? null
		parts.length = 0
		clearSpriteCaches()
		invalidateTreeLayer()
		renderBaseTerrain()
		clearTicker()
		closeModals()
	})
	renderChooser()
}

function saveFromForm() {
	const quality = $<HTMLSelectElement>('s-quality').value as Quality
	const qualityChanged = quality !== settings.quality
	for (const id of TRIBE_IDS) {
		const before = { ...settings.tribes[id] }
		const host = $<HTMLInputElement>(`t-${id}-host`).value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'localhost:8888'
		const variable = $<HTMLInputElement>(`t-${id}-var`).value.trim().replace(/^\$\(custom:|\)$/g, '').replace(/^custom:/, '') || TRIBES[id].defaultVar
		const cmd = $<HTMLInputElement>(`t-${id}-cmd`).value.trim().replace(/^\$\(custom:|\)$/g, '').replace(/^custom:/, '')
		settings.tribes[id] = { control: $<HTMLSelectElement>(`t-${id}-control`).value as Control, host, variable, cmd }
		if (before.host !== host || before.variable !== variable) tribeOf(id).lastCounter = null
	}
	Object.assign(settings, {
		quality,
		speed: Number($<HTMLSelectElement>('s-speed').value) || 1,
		events: $<HTMLSelectElement>('s-events').value as EventsMode,
		dayLength: $<HTMLSelectElement>('s-day').value as DayLength,
		inventionYears: Number($<HTMLSelectElement>('s-pace').value) || 10,
		war: $<HTMLSelectElement>('s-war').value as WarMode,
		battles: $<HTMLSelectElement>('s-battles').value as Battles,
		aiPace: $<HTMLSelectElement>('s-ai').value as AiPace,
		followAction: $<HTMLInputElement>('s-follow').checked,
		modules: $<HTMLInputElement>('s-modules').value.trim(),
	})
	setPlayer($<HTMLSelectElement>('s-player').value as TribeId)
	saveSettings()
	if (qualityChanged) applyQuality()
	closeModals()
	if (params.demo < 0) {
		poll()
		syncModules()
	}
}

export function setPlayer(id: TribeId) {
	settings.player = id
	G.S.player = id
	followNow()
}

export function openSettings() {
	$<HTMLSelectElement>('s-player').value = settings.player
	$<HTMLSelectElement>('s-speed').value = String(settings.speed)
	$<HTMLSelectElement>('s-events').value = settings.events
	$<HTMLSelectElement>('s-quality').value = settings.quality
	$<HTMLSelectElement>('s-day').value = settings.dayLength
	$<HTMLSelectElement>('s-pace').value = String(settings.inventionYears)
	$<HTMLSelectElement>('s-war').value = settings.war
	$<HTMLSelectElement>('s-battles').value = settings.battles
	$<HTMLSelectElement>('s-ai').value = settings.aiPace
	$<HTMLInputElement>('s-follow').checked = settings.followAction
	$<HTMLInputElement>('s-modules').value = settings.modules
	$('s-module-served').hidden = !servedBy
	if (servedBy) $('s-module-host').textContent = servedBy.host
	$<HTMLSelectElement>('s-event-tribe').value = settings.player
	for (const id of TRIBE_IDS) {
		const c = settings.tribes[id]
		$<HTMLSelectElement>(`t-${id}-control`).value = c.control
		$<HTMLInputElement>(`t-${id}-host`).value = c.host
		$<HTMLInputElement>(`t-${id}-var`).value = c.variable
		$<HTMLInputElement>(`t-${id}-cmd`).value = c.cmd
	}
	if ($('settings').hidden) toggleModal('settings')
}

/** Welcome screen: pick Pixels, Noises or Lampys */
function renderChooser() {
	$('choose-cards').innerHTML = TRIBE_IDS.map((id) => {
		const t = TRIBES[id]
		return `<div class="card pick" data-pick="${id}" style="border-color:${t.color}">
			<div class="big-ic">${t.icon}</div><h3 style="color:${t.color}">${t.name}</h3>
			<div class="lbl">The ${t.dept} department</div><p>${t.blurb}</p></div>`
	}).join('')
	$('choose-cards').addEventListener('click', (e) => {
		const card = (e.target as HTMLElement).closest('[data-pick]') as HTMLElement | null
		if (!card) return
		const id = card.dataset.pick as TribeId
		// the chosen tribe takes over the Companion connection (and the classic village_presses counter)
		const prev = TRIBE_IDS.find((t) => settings.tribes[t].control === 'companion')
		if (prev && prev !== id) {
			settings.tribes[id] = { ...settings.tribes[id], control: 'companion', host: settings.tribes[prev].host, variable: settings.tribes[prev].variable, cmd: settings.tribes[prev].cmd }
			settings.tribes[prev] = { ...settings.tribes[prev], control: 'ai', variable: TRIBES[prev].defaultVar, cmd: '' }
		} else if (!prev) settings.tribes[id] = { ...settings.tribes[id], control: 'companion', variable: 'village_presses' }
		settings.chosen = true
		setPlayer(id)
		saveSettings()
		$('choose').hidden = true
		poll()
	})
	if (!settings.chosen) $('choose').hidden = false
}
