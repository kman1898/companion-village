import { store } from './util'

export type EventsMode = 'off' | 'gentle' | 'full'
export type Quality = 'auto' | 'high' | 'low'
export type DayLength = 'off' | 'short' | 'normal' | 'long'
export type RivalsMode = 'off' | 'feud' | 'on'
export const DAY_SECONDS: Record<DayLength, number> = { off: 0, short: 120, normal: 240, long: 600 }

export interface Settings {
	host: string
	variable: string
	poll: number
	speed: number
	events: EventsMode
	quality: Quality
	dayLength: DayLength
	/** years between inventions */
	inventionYears: number
	/** on: rivals raid each other and you · feud: only each other · off: no raids */
	rivals: RivalsMode
}

const SETTINGS_KEY = 'companionVillage.settings'
export const SAVE_KEY = 'companionVillage.save.v3'

const qs = new URLSearchParams(location.search)

export const settings: Settings = Object.assign(
	{ host: 'localhost:8888', variable: 'village_presses', poll: 300, speed: 1, events: 'full', quality: 'auto', dayLength: 'normal', inventionYears: 10, rivals: 'on' } as Settings,
	store.get<Partial<Settings>>(SETTINGS_KEY) || {},
)
if (qs.get('host')) settings.host = qs.get('host')!
if (qs.get('var')) settings.variable = qs.get('var')!
if (qs.get('poll')) settings.poll = Math.max(100, Number(qs.get('poll')) || 300)
if (qs.get('speed')) settings.speed = Math.max(0.25, Number(qs.get('speed')) || 1)
if (qs.get('events')) settings.events = qs.get('events') as EventsMode
if (qs.get('quality')) settings.quality = qs.get('quality') as Quality
if (qs.get('day')) settings.dayLength = qs.get('day') as DayLength
if (qs.get('rivals')) settings.rivals = qs.get('rivals') as RivalsMode
if (qs.get('inventEvery')) settings.inventionYears = Math.max(1, Number(qs.get('inventEvery')) || 10)

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
