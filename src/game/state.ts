import type { BType, Res, Role } from '../data/buildings'
import type { TribeId } from '../data/tribes'

export type { TribeId }
export const W = 260, H = 170, CELL = 3
export const MAX_AGENTS = 350
/** the railway runs along the top of the map */
export const RAIL_Y = 3.6
export const idx = (x: number, y: number) => y * W + x

export const Biome = { Grass: 0, Tundra: 1, Desert: 2, Swamp: 3, Mountain: 4 } as const
/** tree species */
export const Sp = { Oak: 0, Pine: 1, SnowPine: 2, Palm: 3, Cactus: 4, Dead: 5, Peak: 6 } as const
export type Sp = (typeof Sp)[keyof typeof Sp]

export interface Tree { k: 0; x: number; y: number; sp: Sp; v: number; sc: number; g: number; cut: 0 | 1; rt: number; res: number; gone: 0 | 1; park?: 1; burn?: number }
export interface Rock { k: 1; x: number; y: number; max: number; amt: number; rt: number; res: number; gone: 0 | 1; seed: number }
export interface Bush { k: 2; x: number; y: number; ber: 0 | 1; rt: number; res: number; gone: 0 | 1; v: number; park?: 1 }
export interface Patch { s: 0 | 1 | 2; t: number; res: number; x: number; y: number }
export interface Field { key: string; ox: number; oy: number; patches: Patch[] }
export type Rec = Record<Res, number>

export interface Building {
	k: 3
	id: number
	tribe: TribeId
	type: BType
	key: string
	ox: number; oy: number
	v: number
	progress: number
	delivered: Rec
	incoming: Rec
	done: boolean
	field: Field | null
	repair?: boolean
	renovate?: boolean
	fire?: number
	graves?: number
	timer?: number
	launched?: boolean
	/** defensive buildings: seconds until the next shot */
	cool?: number
}

export type Step =
	| { k: 'walk'; x: number; y: number }
	| { k: 'work'; d: number; a: string; fn?: (v: Villager) => boolean | void; fx?: number }

export interface Villager {
	k: 4
	id: number
	tribe: TribeId
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
	/** 1 = Plague event, 2 = everyday illness (disease.ts) */
	sick?: number
	dieAt?: number
	/** everyday illness: which one, when it passes, when it kills (if it does), immune until */
	ill?: string
	illUntil?: number
	illDie?: number
	immune?: number
	fly?: { vx: number; vy: number; vz: number; z: number }
	doomed?: boolean
	inside?: boolean
	android?: boolean
	abducted?: boolean
	/** away fighting (hidden from the village) */
	away?: boolean
}

export interface Sheep { k: 7; x: number; y: number; tx: number; ty: number; t: number; face: 1 | -1; ph: number; gone?: boolean; tribe: TribeId }
export interface Crater { x: number; y: number; r: number; until: number }
export interface HistoryEntry { year: number; icon: string; text: string; tribe?: TribeId }

export interface ActiveEvent {
	type: string
	t: number
	dur: number
	/** tribe the event happens to (global events have none) */
	tribe?: TribeId
	d: any
}

export interface Cell { i: number; j: number; ox: number; oy: number; key: string; d: number; park?: boolean; tribe: TribeId }

/** companion: polls a Companion custom variable · module: driven by the Companion Village module · ai: autopilot */
export type Control = 'companion' | 'module' | 'ai'
export interface Connection {
	control: Control
	host: string
	variable: string
	/** optional command variable: attack:noises, gift:lampys, trade:pixels, peace:noises, festival */
	cmd: string
}

export interface Tribe {
	id: TribeId
	cx: number
	cy: number
	year: number
	stock: Rec
	villagers: Villager[]
	buildings: Building[]
	sheep: Sheep[]
	inventions: string[]
	lastInventionYear: number
	/** years between inventions for this tribe */
	invPace: number
	firsts: Record<string, 1>
	used: Map<string, number>
	queue: number
	arrivals: number
	deaths: number
	extraPop: number
	boost: number
	lastCounter: number | null
	/** AI: seconds per year (steady mode) or presses per player press (match mode) */
	aiRate: number
	aiAcc: number
	personality: { aggression: number; trade: number; curiosity: number }
	wins: number
	losses: number
	prestige: number
	lastEventYear: number
}

export interface Relation {
	a: TribeId
	b: TribeId
	value: number
	war: boolean
	allied: boolean
	since: number
	/** who is winning the current war (+ = a) */
	score: number
	trades: number
}

export interface State {
	seed: number
	time: number
	dayTime: number
	player: TribeId
	tribes: Tribe[]
	relations: Relation[]
	events: ActiveEvent[]
	craters: Crater[]
	chill: number
	nextId: number
	history: HistoryEntry[]
	lastGlobalEvent: number
}

export interface World {
	seed: number
	water: Uint8Array
	sand: Uint8Array
	biome: Uint8Array
	shade: Float32Array
	trees: Tree[]
	treeOrder: number[]
	rocks: Rock[]
	bushes: Bush[]
	cells: Record<TribeId, Cell[]>
	cellMap: Map<string, Cell>
	/** tile indices of the highways between tribes */
	highway: Set<number>
	/** waypoint routes between each pair of tribes, keyed "a>b" */
	routes: Map<string, [number, number][]>
	sites: Record<TribeId, { x: number; y: number }>
	sparkles: { x: number; y: number; p: number }[]
	clouds: { x: number; y: number; r: number; sp: number }[]
}

/** Shared mutable game context */
export const G = {
	S: undefined as unknown as State,
	world: undefined as unknown as World,
	roads: new Set<number>(),
	/** tile index -> owning tribe (for road styles) */
	roadOwner: new Map<number, TribeId>(),
	roadsVersion: 0,
	resumed: false,
	paused: false,
}

export const tribeOf = (id: TribeId) => G.S.tribes.find((t) => t.id === id)!
export const player = () => tribeOf(G.S.player)
export const has = (T: Tribe, inv: string) => T.inventions.includes(inv)
export const anyHas = (inv: string) => G.S.tribes.some((t) => t.inventions.includes(inv))
export const popOf = (T: Tribe) => T.villagers.length + T.extraPop
export const allVillagers = () => G.S.tribes.flatMap((t) => t.villagers)
export const allBuildings = () => G.S.tribes.flatMap((t) => t.buildings)

export function relation(a: TribeId, b: TribeId): Relation {
	return G.S.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))!
}
