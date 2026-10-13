export type Res = 'wood' | 'stone' | 'food'
export const RES: Res[] = ['wood', 'stone', 'food']
export type Cost = Partial<Record<Res, number>>

export type Role = 'builder' | 'woodcutter' | 'mason' | 'farmer'
export const ROLE: Record<Role, { label: string; color: string; hat: string }> = {
	builder: { label: 'Builder', color: '#e0862f', hat: '#f2c230' },
	woodcutter: { label: 'Woodcutter', color: '#4e7f39', hat: '#2f5a28' },
	mason: { label: 'Stonemason', color: '#7d8794', hat: '#545c69' },
	farmer: { label: 'Farmer', color: '#c79f38', hat: '#ead27a' },
}
export const ROLE_TARGET: Record<Role, number> = { builder: 0.28, woodcutter: 0.28, mason: 0.2, farmer: 0.24 }

export type BType =
	| 'house' | 'stonehouse' | 'townhouse' | 'modernhouse' | 'habdome' | 'skypod'
	| 'farm' | 'woodhut' | 'quarry' | 'well' | 'storehouse' | 'bakery' | 'sawmill' | 'market'
	| 'tavern' | 'windmill' | 'church' | 'tower' | 'fountain' | 'keep' | 'library' | 'clocktower' | 'graveyard'
	| 'factory' | 'skyscraper' | 'windfarm' | 'launchpad' | 'fusion' | 'arcology' | 'teleporter' | 'starship'
	| 'barracks' | 'landmark'

export interface BDef {
	name: string
	cost: Cost
	/** hammer units needed */
	work: number
	/** art height above the footprint front edge (tiles) */
	h: number
	/** housing capacity */
	cap?: number
	/** resources villagers may drop off here */
	drop?: Res[]
	/** invention needed before it can be built */
	inv?: string
	/** minimum population */
	u?: number
	/** how many the village wants at population p */
	want?: (p: number, roles: Record<Role, number>) => number
	/** window light colour at night */
	light?: string
	/** visual era of the art (for neon etc.) */
	era?: number
}

export const B: Record<BType, BDef> = {
	// ---- homes, from oldest to newest style ----
	house: { name: 'House', cost: { wood: 3, stone: 1 }, work: 4, h: 1.9, cap: 4, light: '#ffc46b' },
	stonehouse: { name: 'Stone House', cost: { wood: 2, stone: 3 }, work: 6, h: 2.0, cap: 6, inv: 'masonry', light: '#ffc46b' },
	townhouse: { name: 'Brick Townhouse', cost: { wood: 2, stone: 5 }, work: 6, h: 2.5, cap: 8, inv: 'brickworks', light: '#ffcf7a', era: 1 },
	modernhouse: { name: 'Modern House', cost: { wood: 2, stone: 6 }, work: 6, h: 1.9, cap: 10, inv: 'electricity', light: '#fff1c9', era: 2 },
	habdome: { name: 'Habitat Dome', cost: { wood: 1, stone: 7 }, work: 7, h: 1.8, cap: 12, inv: 'spaceHabitats', light: '#bfe9ff', era: 3 },
	skypod: { name: 'Sky Pod', cost: { wood: 2, stone: 8 }, work: 7, h: 3.3, cap: 16, inv: 'antigravity', light: '#7ff6ff', era: 4 },
	// ---- medieval ----
	farm: { name: 'Farm', cost: { wood: 4, stone: 1 }, work: 4, h: 1.95, drop: ['food'], u: 2, want: (p, c) => Math.ceil(c.farmer / 4) },
	woodhut: { name: "Woodcutter's Hut", cost: { wood: 4 }, work: 3, h: 1.5, drop: ['wood'], u: 4, want: (p, c) => Math.ceil(c.woodcutter / 6) },
	quarry: { name: "Stonemason's Lodge", cost: { wood: 3, stone: 2 }, work: 4, h: 1.45, drop: ['stone'], u: 5, want: (p, c) => Math.ceil(c.mason / 6) },
	well: { name: 'Well', cost: { wood: 1, stone: 3 }, work: 3, h: 1.55, inv: 'masonry', u: 6, want: (p) => 1 + Math.floor(p / 35) },
	storehouse: { name: 'Granary', cost: { wood: 6, stone: 3 }, work: 6, h: 2.1, drop: ['wood', 'stone', 'food'], inv: 'granaries', u: 8, want: (p) => Math.max(1, Math.floor(p / 30)) },
	bakery: { name: 'Bakery', cost: { wood: 4, stone: 4, food: 3 }, work: 6, h: 1.9, drop: ['food'], inv: 'baking', u: 10, want: (p) => 1 + Math.floor(p / 70), light: '#ffb347' },
	sawmill: { name: 'Sawmill', cost: { wood: 8, stone: 3 }, work: 7, h: 1.55, drop: ['wood'], inv: 'carpentry', u: 12, want: (p) => 1 + Math.floor(p / 90) },
	market: { name: 'Market', cost: { wood: 6, stone: 4, food: 6 }, work: 7, h: 1.15, inv: 'coinage', u: 15, want: (p) => 1 + Math.floor(p / 150) },
	tavern: { name: 'Tavern', cost: { wood: 8, stone: 6, food: 6 }, work: 8, h: 2.3, inv: 'brewing', u: 18, want: (p) => 1 + Math.floor(p / 150), light: '#ffb347' },
	windmill: { name: 'Windmill', cost: { wood: 8, stone: 5 }, work: 8, h: 1.9, inv: 'milling', u: 20, want: (p) => 1 + Math.floor(p / 100) },
	church: { name: 'Chapel', cost: { wood: 10, stone: 14, food: 4 }, work: 12, h: 3.55, inv: 'bellCasting', u: 25, want: () => 1, light: '#ffd27a' },
	library: { name: 'Library', cost: { wood: 10, stone: 10, food: 2 }, work: 10, h: 2.2, inv: 'printing', u: 25, want: () => 1, light: '#ffd27a' },
	clocktower: { name: 'Clock Tower', cost: { wood: 6, stone: 16 }, work: 12, h: 4.25, inv: 'clockmaking', u: 30, want: () => 1, light: '#fff3c8' },
	tower: { name: 'Watchtower', cost: { wood: 4, stone: 14 }, work: 10, h: 4.0, inv: 'fortification', u: 30, want: (p) => Math.max(1, Math.floor(p / 70)), light: '#ffb347' },
	fountain: { name: 'Fountain', cost: { stone: 10 }, work: 6, h: 1.15, inv: 'plumbing', u: 30, want: (p) => Math.max(1, Math.floor(p / 80)) },
	keep: { name: 'Castle Keep', cost: { wood: 16, stone: 30, food: 10 }, work: 20, h: 3.05, inv: 'castleBuilding', u: 50, want: () => 1, light: '#ffb347' },
	graveyard: { name: 'Graveyard', cost: {}, work: 1, h: 0.8 },
	barracks: { name: 'Barracks', cost: { wood: 6, stone: 5 }, work: 6, h: 2.0, u: 12, want: (p) => 1 + Math.floor(p / 45), light: '#ffb347' },
	landmark: { name: 'Landmark', cost: {}, work: 1, h: 4.6, light: '#ffffff' },
	// ---- industrial & later ----
	factory: { name: 'Factory', cost: { wood: 6, stone: 10 }, work: 9, h: 2.9, drop: ['wood', 'stone'], inv: 'steamEngine', u: 20, want: (p) => 1 + Math.floor(p / 60), light: '#ffa04a', era: 1 },
	skyscraper: { name: 'Skyscraper', cost: { wood: 4, stone: 18 }, work: 14, h: 6.2, cap: 30, inv: 'skyscrapers', u: 40, want: (p) => Math.floor(p / 40), light: '#fff1c9', era: 2 },
	windfarm: { name: 'Wind Farm', cost: { wood: 2, stone: 10 }, work: 8, h: 3.7, inv: 'windTurbines', u: 30, want: (p) => 1 + Math.floor(p / 80), era: 2 },
	launchpad: { name: 'Launch Pad', cost: { wood: 4, stone: 20, food: 4 }, work: 14, h: 4.0, inv: 'rocketry', u: 40, want: () => 1, light: '#ffffff', era: 3 },
	fusion: { name: 'Fusion Reactor', cost: { stone: 24, food: 4 }, work: 14, h: 2.3, inv: 'fusionPower', u: 40, want: () => 1, light: '#8fe8ff', era: 3 },
	arcology: { name: 'Arcology', cost: { wood: 6, stone: 30, food: 8 }, work: 18, h: 4.8, cap: 40, inv: 'antigravity', u: 60, want: (p) => 1 + Math.floor(p / 150), light: '#7ff6ff', era: 4 },
	teleporter: { name: 'Teleporter', cost: { stone: 12 }, work: 8, h: 1.4, inv: 'teleporters', u: 40, want: (p) => 1 + Math.floor(p / 100), light: '#c48bff', era: 4 },
	starship: { name: 'Colony Starship', cost: { wood: 30, stone: 60, food: 20 }, work: 30, h: 5.0, inv: 'starship', u: 50, want: () => 1, light: '#ffffff', era: 4 },
}

/** Home styles, oldest first. Builders renovate older homes into the newest available style. */
export const HOUSE_LINE: BType[] = ['house', 'stonehouse', 'townhouse', 'modernhouse', 'habdome', 'skypod']

/** Planner order for buildings other than houses */
export const SPECIAL_ORDER: BType[] = ['farm', 'woodhut', 'quarry', 'barracks', 'well', 'storehouse', 'bakery', 'sawmill', 'market', 'tavern',
	'windmill', 'church', 'library', 'clocktower', 'tower', 'fountain', 'keep',
	'factory', 'windfarm', 'skyscraper', 'launchpad', 'fusion', 'teleporter', 'arcology', 'starship']

export function costTotal(type: BType): number {
	const c = B[type].cost
	return (c.wood || 0) + (c.stone || 0) + (c.food || 0)
}
