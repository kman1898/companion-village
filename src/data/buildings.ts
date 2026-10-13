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
	| 'house' | 'stonehouse' | 'farm' | 'woodhut' | 'quarry' | 'well' | 'storehouse' | 'bakery' | 'sawmill' | 'market'
	| 'tavern' | 'windmill' | 'church' | 'tower' | 'fountain' | 'keep' | 'library' | 'clocktower' | 'graveyard'

export interface BDef {
	name: string
	cost: Cost
	/** hammer units needed */
	work: number
	/** art height above the footprint front edge, used to reveal the building during construction */
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
	/** never chosen by the planner */
	special?: boolean
}

export const B: Record<BType, BDef> = {
	house: { name: 'House', cost: { wood: 3, stone: 1 }, work: 4, h: 1.9, cap: 4 },
	stonehouse: { name: 'Stone House', cost: { wood: 2, stone: 3 }, work: 6, h: 2.0, cap: 6 },
	farm: { name: 'Farm', cost: { wood: 4, stone: 1 }, work: 4, h: 1.95, drop: ['food'], u: 2, want: (p, c) => Math.ceil(c.farmer / 4) },
	woodhut: { name: "Woodcutter's Hut", cost: { wood: 4 }, work: 3, h: 1.5, drop: ['wood'], u: 4, want: (p, c) => Math.ceil(c.woodcutter / 6) },
	quarry: { name: "Stonemason's Lodge", cost: { wood: 3, stone: 2 }, work: 4, h: 1.45, drop: ['stone'], u: 5, want: (p, c) => Math.ceil(c.mason / 6) },
	well: { name: 'Well', cost: { wood: 1, stone: 3 }, work: 3, h: 1.55, inv: 'masonry', u: 6, want: (p) => 1 + Math.floor(p / 35) },
	storehouse: { name: 'Granary', cost: { wood: 6, stone: 3 }, work: 6, h: 2.1, drop: ['wood', 'stone', 'food'], inv: 'granaries', u: 8, want: (p) => Math.max(1, Math.floor(p / 30)) },
	bakery: { name: 'Bakery', cost: { wood: 4, stone: 4, food: 3 }, work: 6, h: 1.9, drop: ['food'], inv: 'baking', u: 10, want: (p) => 1 + Math.floor(p / 70) },
	sawmill: { name: 'Sawmill', cost: { wood: 8, stone: 3 }, work: 7, h: 1.55, drop: ['wood'], inv: 'carpentry', u: 12, want: (p) => 1 + Math.floor(p / 90) },
	market: { name: 'Market', cost: { wood: 6, stone: 4, food: 6 }, work: 7, h: 1.15, inv: 'coinage', u: 15, want: (p) => 1 + Math.floor(p / 150) },
	tavern: { name: 'Tavern', cost: { wood: 8, stone: 6, food: 6 }, work: 8, h: 2.3, inv: 'brewing', u: 18, want: (p) => 1 + Math.floor(p / 150) },
	windmill: { name: 'Windmill', cost: { wood: 8, stone: 5 }, work: 8, h: 1.9, inv: 'milling', u: 20, want: (p) => 1 + Math.floor(p / 100) },
	church: { name: 'Chapel', cost: { wood: 10, stone: 14, food: 4 }, work: 12, h: 3.55, inv: 'bellCasting', u: 25, want: () => 1 },
	library: { name: 'Library', cost: { wood: 10, stone: 10, food: 2 }, work: 10, h: 2.2, inv: 'printing', u: 25, want: () => 1 },
	clocktower: { name: 'Clock Tower', cost: { wood: 6, stone: 16 }, work: 12, h: 3.9, inv: 'clockmaking', u: 30, want: () => 1 },
	tower: { name: 'Watchtower', cost: { wood: 4, stone: 14 }, work: 10, h: 4.0, inv: 'fortification', u: 30, want: (p) => Math.max(1, Math.floor(p / 70)) },
	fountain: { name: 'Fountain', cost: { stone: 10 }, work: 6, h: 1.15, inv: 'plumbing', u: 30, want: (p) => Math.max(1, Math.floor(p / 80)) },
	keep: { name: 'Castle Keep', cost: { wood: 16, stone: 30, food: 10 }, work: 20, h: 3.05, inv: 'castleBuilding', u: 50, want: () => 1 },
	graveyard: { name: 'Graveyard', cost: {}, work: 1, h: 0.8, special: true },
}

/** Planner order for buildings other than houses */
export const SPECIAL_ORDER: BType[] = ['farm', 'woodhut', 'quarry', 'well', 'storehouse', 'bakery', 'sawmill', 'market', 'tavern',
	'windmill', 'church', 'library', 'clocktower', 'tower', 'fountain', 'keep']

export function costTotal(type: BType): number {
	const c = B[type].cost
	return (c.wood || 0) + (c.stone || 0) + (c.food || 0)
}
