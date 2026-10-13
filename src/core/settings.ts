import { store } from './util'

export type EventsMode = 'off' | 'gentle' | 'full'
export type Quality = 'auto' | 'high' | 'low'

export interface Settings {
	host: string
	variable: string
	poll: number
	speed: number
	events: EventsMode
	quality: Quality
}

const SETTINGS_KEY = 'companionVillage.settings'
export const SAVE_KEY = 'companionVillage.save.v2'

const qs = new URLSearchParams(location.search)

export const settings: Settings = Object.assign(
	{ host: 'localhost:8888', variable: 'village_presses', poll: 300, speed: 1, events: 'full', quality: 'auto' } as Settings,
	store.get<Partial<Settings>>(SETTINGS_KEY) || {},
)
if (qs.get('host')) settings.host = qs.get('host')!
if (qs.get('var')) settings.variable = qs.get('var')!
if (qs.get('poll')) settings.poll = Math.max(100, Number(qs.get('poll')) || 300)
if (qs.get('speed')) settings.speed = Math.max(0.25, Number(qs.get('speed')) || 1)
if (qs.get('events')) settings.events = qs.get('events') as EventsMode
if (qs.get('quality')) settings.quality = qs.get('quality') as Quality

/** URL-only options (never persisted) */
export const params = {
	/** demo=N: no Companion; start with N settlers and keep adding some. Nothing is saved. */
	demo: qs.has('demo') ? Math.max(0, Number(qs.get('demo')) || 0) : -1,
	/** fast-forward N simulated seconds at start (testing) */
	warp: Math.max(0, Number(qs.get('warp')) || 0),
	nosave: qs.has('nosave') || qs.has('demo'),
	debug: qs.has('debug'),
	hud: qs.get('hud') !== '0',
}

export function saveSettings() {
	store.set(SETTINGS_KEY, settings)
}
