import type { BType, Res, Role } from '../data/buildings'

export const W = 190, H = 110, CX = 95, CY = 55, CELL = 3
export const MAX_AGENTS = 500
/** the railway runs along the top of the map */
export const RAIL_Y = 3.6
export const idx = (x: number, y: number) => y * W + x

export interface Tree { k: 0; x: number; y: number; pine: boolean; v: number; sc: number; g: number; cut: 0 | 1; rt: number; res: number; gone: 0 | 1; park?: 1 }
export interface Rock { k: 1; x: number; y: number; max: number; amt: number; rt: number; res: number; gone: 0 | 1; seed: number }
export interface Bush { k: 2; x: number; y: number; ber: 0 | 1; rt: number; res: number; gone: 0 | 1; v: number; park?: 1 }
export interface Patch { s: 0 | 1 | 2; t: number; res: number; x: number; y: number }
export interface Field { ci: number; cj: number; ox: number; oy: number; patches: Patch[] }
export type Rec = Record<Res, number>

export interface Building {
	k: 3
	id: number
	type: BType
	ci: number; cj: number; ox: number; oy: number
	v: number
	progress: number
	delivered: Rec
	incoming: Rec
	done: boolean
	field: Field | null
	repair?: boolean
	/** being rebuilt in a newer style */
	renovate?: boolean
	fire?: number
	graves?: number
	/** launchpad: seconds until the next rocket; starship: launched */
	timer?: number
	launched?: boolean
}

export type Step =
	| { k: 'walk'; x: number; y: number }
	| { k: 'work'; d: number; a: string; fn?: (v: Villager) => boolean | void; fx?: number }

export interface Villager {
	k: 4
	id: number
	name: string
	role: Role
	x: number; y: number
	plan: Step[]
	step: Step | null
	t: number
	carry: Res | null
	carryN: number
	anim: string
	face: 1 | -1
	ph: number
	spd: number
	skin: string
	born: number
	res: { res: number } | null
	claim: { site: number; r: Res; n: number } | null
	hammer: number
	sick?: number
	dieAt?: number
	fly?: { vx: number; vy: number; vz: number; z: number }
	/** dies when it lands (tornado) */
	doomed?: boolean
	/** asleep inside a house */
	inside?: boolean
	android?: boolean
	/** taken by a UFO */
	abducted?: boolean
}

export interface Sheep { k: 7; x: number; y: number; tx: number; ty: number; t: number; face: 1 | -1; ph: number; gone?: boolean }
export interface Crater { x: number; y: number; r: number; until: number }
export interface HistoryEntry { year: number; icon: string; text: string }

export interface ActiveEvent {
	type: string
	t: number
	dur: number
	d: any
}

export interface Cell { i: number; j: number; ox: number; oy: number; key: string; d: number; park?: boolean }

export type RivalId = 'sound' | 'lights'
export interface RivalBuilding { x: number; y: number; v: number; hp: number; tower?: boolean }
export interface Rival {
	id: RivalId
	name: string
	x: number
	y: number
	buildings: RivalBuilding[]
	wins: number
	losses: number
}

export interface State {
	seed: number
	time: number
	year: number
	/** 0..1, 0 = midnight, 0.5 = noon */
	dayTime: number
	stock: Rec
	villagers: Villager[]
	buildings: Building[]
	sheep: Sheep[]
	nextId: number
	lastCounter: number | null
	arrivals: number
	deaths: number
	extraPop: number
	queue: number
	firsts: Record<string, 1>
	used: Map<string, number>
	inventions: string[]
	lastInventionYear: number
	lastEventYear: number
	lastRaidYear: number
	event: ActiveEvent | null
	craters: Crater[]
	boost: number
	/** negative work-speed modifier (blizzard) */
	chill: number
	history: HistoryEntry[]
	rivals: Rival[]
}

export interface World {
	seed: number
	water: Uint8Array
	sand: Uint8Array
	shade: Float32Array
	trees: Tree[]
	/** tree indices sorted by y, for fast depth-sorted drawing */
	treeOrder: number[]
	rocks: Rock[]
	bushes: Bush[]
	cells: Cell[]
	cellMap: Map<string, Cell>
	sparkles: { x: number; y: number; p: number }[]
	clouds: { x: number; y: number; r: number; sp: number }[]
	rivalSites: Record<RivalId, { x: number; y: number }>
}

/** Shared mutable game context */
export const G = {
	S: undefined as unknown as State,
	world: undefined as unknown as World,
	roads: new Set<number>(),
	terrainDirty: true,
	resumed: false,
}

export function newState(seed: number): State {
	return {
		seed, time: 0, year: 0, dayTime: 0.3, stock: { wood: 10, stone: 5, food: 0 }, villagers: [], buildings: [], sheep: [], nextId: 1,
		lastCounter: null, arrivals: 0, deaths: 0, extraPop: 0, queue: 0, firsts: {}, used: new Map(), inventions: [],
		lastInventionYear: 0, lastEventYear: 0, lastRaidYear: 0, event: null, craters: [], boost: 0, chill: 0, history: [], rivals: [],
	}
}

export const has = (inv: string) => G.S.inventions.includes(inv)
export const popCount = () => G.S.villagers.length + G.S.extraPop
