/*
 * Shared protocol between this module and the Companion Village page.
 * The page POSTs its state to /sync (as text/plain JSON, so no CORS preflight is needed)
 * and receives the actions queued by Companion buttons since its last sync.
 * Keep in sync with src/net/module.ts in the village project.
 */

export const PROTOCOL_VERSION = 1

export type TribeId = 'pixels' | 'noises' | 'lampys'
export const TRIBES: { id: TribeId; name: string; dept: string; icon: string; color: number; text: number }[] = [
	{ id: 'pixels', name: 'Pixels', dept: 'Video', icon: '🎥', color: 0x1f8fb8, text: 0xffffff },
	{ id: 'noises', name: 'Noises', dept: 'Sound', icon: '🔊', color: 0x6f5bd6, text: 0xffffff },
	{ id: 'lampys', name: 'Lampys', dept: 'Lights', icon: '💡', color: 0xd99a2a, text: 0x000000 },
]
export const tribeName = (id: string): string => TRIBES.find((t) => t.id === id)?.name ?? id

export const PAIRS: [TribeId, TribeId][] = [
	['pixels', 'noises'],
	['pixels', 'lampys'],
	['noises', 'lampys'],
]

export const ERA_NAMES = ['Medieval', 'Industrial Age', 'Modern Age', 'Space Age', 'Sci-Fi Future']

/** Events the village knows about (id → label) */
export const EVENTS: { id: string; label: string; scope: 'tribe' | 'global' }[] = [
	{ id: 'festival', label: '🎉 Festival', scope: 'tribe' },
	{ id: 'wedding', label: '💒 Wedding', scope: 'tribe' },
	{ id: 'babyBoom', label: '👶 Baby boom', scope: 'tribe' },
	{ id: 'harvest', label: '🌾 Bountiful harvest', scope: 'tribe' },
	{ id: 'treasure', label: '💰 Buried treasure', scope: 'tribe' },
	{ id: 'merchant', label: '🐴 Travelling merchant', scope: 'tribe' },
	{ id: 'migrants', label: '🧳 Migrants', scope: 'tribe' },
	{ id: 'timeTraveler', label: '⏱️ Time traveller', scope: 'tribe' },
	{ id: 'contest', label: '🎸 Battle of the Bands', scope: 'global' },
	{ id: 'aurora', label: '🌌 Northern lights', scope: 'global' },
	{ id: 'comet', label: '🌠 Great comet', scope: 'global' },
	{ id: 'meteorShower', label: '✨ Meteor shower', scope: 'global' },
	{ id: 'storm', label: '⛈️ Thunderstorm', scope: 'global' },
	{ id: 'blizzard', label: '🌨️ Blizzard', scope: 'global' },
	{ id: 'sandstorm', label: '🏜️ Sandstorm', scope: 'global' },
	{ id: 'eclipse', label: '🌑 Eclipse', scope: 'global' },
	{ id: 'solarFlare', label: '☀️ Solar flare', scope: 'global' },
	{ id: 'tornado', label: '🌪️ Tornado', scope: 'tribe' },
	{ id: 'meteor', label: '☄️ Meteor strike', scope: 'tribe' },
	{ id: 'earthquake', label: '🌋 Earthquake', scope: 'tribe' },
	{ id: 'fire', label: '🔥 Fire', scope: 'tribe' },
	{ id: 'forestFire', label: '🔥 Forest fire', scope: 'tribe' },
	{ id: 'flood', label: '🌊 Flood', scope: 'tribe' },
	{ id: 'plague', label: '☠️ Plague', scope: 'tribe' },
	{ id: 'locusts', label: '🦗 Locusts', scope: 'tribe' },
	{ id: 'wolves', label: '🐺 Wolf pack', scope: 'tribe' },
	{ id: 'dragon', label: '🐉 Dragon', scope: 'tribe' },
	{ id: 'bandits', label: '🥷 Bandits', scope: 'tribe' },
	{ id: 'ufo', label: '🛸 UFO', scope: 'tribe' },
	{ id: 'blackout', label: '🔌 Blackout', scope: 'tribe' },
	{ id: 'robots', label: '🤖 Robot rampage', scope: 'tribe' },
]

/** What the page tells us, roughly twice a second */
export interface VillageTribeState {
	id: TribeId
	year: number
	pop: number
	era: number
	eraName: string
	inventions: number
	inventionsTotal: number
	lastInvention: string
	nextInvention: number
	wood: number
	stone: number
	food: number
	buildings: number
	sites: number
	wins: number
	losses: number
	prestige: number
	control: 'companion' | 'module' | 'ai'
	wars: TribeId[]
	allies: TribeId[]
	event: string
	/** in a raid right now */
	raid: '' | 'attacking' | 'defending'
	soldiersAway: number
	deaths: number
}

export interface VillageState {
	v: number
	player: TribeId
	clock: string
	phase: 'day' | 'dawn' | 'dusk' | 'night'
	paused: boolean
	speed: number
	hud: boolean
	camera: string
	news: string
	leader: TribeId
	tribes: VillageTribeState[]
	relations: { a: TribeId; b: TribeId; value: number; stance: string }[]
	events: { type: string; name: string; icon: string; tribe: TribeId | '' }[]
}

export interface SyncRequest {
	v: number
	page: string
	since: number | null
	state: VillageState
}

export type VillageAction =
	| { type: 'press'; tribe: TribeId; n: number }
	| { type: 'command'; tribe: TribeId; cmd: string }
	| { type: 'event'; event: string; tribe: TribeId }
	| { type: 'inspire'; tribe: TribeId }
	| { type: 'camera'; mode: 'follow' | 'map' | 'tribe' | 'zoomIn' | 'zoomOut'; tribe?: TribeId }
	| { type: 'hud'; mode: 'toggle' | 'show' | 'hide' }
	| { type: 'speed'; value: number | 'pause' | 'resume' | 'toggle' }
	| { type: 'time'; t: number }
	| { type: 'setting'; key: 'war' | 'events' | 'disease' | 'aiPace' | 'dayLength' | 'followAction'; value: string }
	| { type: 'player'; tribe: TribeId }
	| { type: 'message'; text: string; sub: string }
	| { type: 'resources'; tribe: TribeId; wood: number; stone: number; food: number }

export interface SyncResponse {
	v: number
	/** changes whenever the module restarts, so pages can reset their cursor */
	boot: string
	seq: number
	tribe: TribeId
	label: string
	actions: (VillageAction & { seq: number })[]
}
