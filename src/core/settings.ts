import { TRIBE_IDS, TRIBES, type TribeId } from '../data/tribes'
import type { Connection } from '../game/state'
import { store } from './util'

export type EventsMode = 'off' | 'gentle' | 'full'
/** everyday illness spreading between villagers (follows the events setting: gentle = nobody dies) */
export type DiseaseMode = 'on' | 'off'
export type Quality = 'auto' | 'high' | 'low'
export type DayLength = 'off' | 'short' | 'normal' | 'long'
/** on: tribes may go to war with anyone · feud: the AI tribes only fight each other · off: peace */
export type WarMode = 'off' | 'feud' | 'on'
/** match: AI tribes keep pace with the Companion-driven ones · steady: on their own clock · fast / slow variants */
export type AiPace = 'match' | 'steady' | 'fast' | 'slow' | 'frozen'
export const DAY_SECONDS: Record<DayLength, number> = { off: 0, short: 120, normal: 240, long: 600 }

export interface Settings {
	poll: number
	speed: number
	events: EventsMode
	disease: DiseaseMode
	quality: Quality
	dayLength: DayLength
	inventionYears: number
	war: WarMode
	aiPace: AiPace
	/** camera swings to events in any tribe, not just yours */
	followAction: boolean
	player: TribeId
	/** false until the player picked a tribe on the welcome screen */
	chosen: boolean
	tribes: Record<TribeId, Connection>
	/** Companion Village module links, comma separated host:port */
	modules: string
}

const SETTINGS_KEY = 'companionVillage.settings.v4'
export const SAVE_KEY = 'companionVillage.save.v4'

const qs = new URLSearchParams(location.search)

/**
 * Set when the page is served by the Companion Village module (it injects this before the app script).
 * The page then links to that module by itself — no address to type, no https/local-network issues.
 */
const served = (window as { __VILLAGE_MODULE__?: { host?: string; tribe?: string; label?: string } }).__VILLAGE_MODULE__
const servedHost = !served ? '' : location.protocol.startsWith('http') ? location.host : served.host || ''
export const servedBy = served && servedHost ? { host: servedHost, tribe: served.tribe as TribeId | undefined, label: served.label || 'village' } : null
const old = store.get<{ host?: string; variable?: string }>('companionVillage.settings') || {}

function defaults(): Settings {
	const tribes = {} as Record<TribeId, Connection>
	// served by the module: Companion's own HTTP API is most likely on the same machine
	const companionHost = old.host || (servedBy ? `${servedBy.host.replace(/:\d+$/, '')}:8888` : 'localhost:8888')
	for (const id of TRIBE_IDS) tribes[id] = { control: 'ai', host: companionHost, variable: TRIBES[id].defaultVar, cmd: '' }
	const d: Settings = {
		poll: 300, speed: 1, events: 'full', disease: 'on', quality: 'auto', dayLength: 'normal', inventionYears: 10, war: 'on', aiPace: 'match',
		followAction: true, player: 'pixels', chosen: false, tribes, modules: '',
	}
	// first visit from the module: play as the module's tribe, driven by the module
	const t = servedBy?.tribe
	if (t && TRIBE_IDS.includes(t)) {
		d.player = t
		d.chosen = true
		tribes[t].control = 'module'
	}
	return d
}

const saved = store.get<Partial<Settings>>(SETTINGS_KEY) || {}
export const settings: Settings = { ...defaults(), ...saved, tribes: { ...defaults().tribes, ...(saved.tribes || {}) } }

if (qs.get('tribe') && TRIBE_IDS.includes(qs.get('tribe') as TribeId)) {
	settings.player = qs.get('tribe') as TribeId
	settings.chosen = true
}
if (qs.get('host')) for (const id of TRIBE_IDS) settings.tribes[id].host = qs.get('host')!
if (qs.get('var')) {
	settings.tribes[settings.player].variable = qs.get('var')!
	settings.tribes[settings.player].control = 'companion'
}
if (qs.get('module')) settings.modules = qs.get('module')!
if (qs.get('cmd')) settings.tribes[settings.player].cmd = qs.get('cmd')!
if (qs.get('poll')) settings.poll = Math.max(100, Number(qs.get('poll')) || 300)
if (qs.get('speed')) settings.speed = Math.max(0.25, Number(qs.get('speed')) || 1)
if (qs.get('events')) settings.events = qs.get('events') as EventsMode
if (qs.get('quality')) settings.quality = qs.get('quality') as Quality
if (qs.get('day')) settings.dayLength = qs.get('day') as DayLength
if (qs.get('war')) settings.war = qs.get('war') as WarMode
if (qs.get('disease') === 'on' || qs.get('disease') === 'off') settings.disease = qs.get('disease') as DiseaseMode
if (qs.get('ai')) settings.aiPace = qs.get('ai') as AiPace
if (qs.get('inventEvery')) settings.inventionYears = Math.max(1, Number(qs.get('inventEvery')) || 10)

/** URL-only options (never persisted) */
export const params = {
	/** demo=N: no Companion; every tribe is AI, starting with N settlers. Nothing is saved. */
	demo: qs.has('demo') ? Math.max(0, Number(qs.get('demo')) || 0) : -1,
	/** fast-forward N simulated seconds at start (testing) */
	warp: Math.max(0, Number(qs.get('warp')) || 0),
	nosave: qs.has('nosave') || qs.has('demo'),
	debug: qs.has('debug'),
	hud: qs.get('hud') !== '0',
}
if (params.demo >= 0) settings.chosen = true

export function saveSettings() {
	store.set(SETTINGS_KEY, settings)
}

/** Is at least one tribe driven by Companion? */
export const anyCompanion = () => params.demo < 0 && TRIBE_IDS.some((id) => settings.tribes[id].control !== 'ai')
/** module links as a clean list */
export const moduleLinks = () => {
	const list = settings.modules.split(/[\s,;]+/).map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')).filter(Boolean)
	if (servedBy && !list.includes(servedBy.host)) list.unshift(servedBy.host)
	return list
}
