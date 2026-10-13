import { params, SAVE_KEY, settings } from '../core/settings'
import { store } from '../core/util'
import type { BType, Role } from '../data/buildings'
import { TRIBE_IDS, type TribeId } from '../data/tribes'
import { agents } from './agents'
import { attachField, rebuildRoads, useCell } from './buildings'
import { initRelations, resetDiplomacy } from './diplomacy'
import { G, type Building, type Crater, type HistoryEntry, type Rec, type Relation, type State, type Tribe } from './state'
import { resetTraffic } from './traffic'
import { createTribe, placeLandmark } from './tribes'
import { addSheep, makeVillager } from './villagers'
import { buildTreeGrid, genWorld } from './worldgen'

interface SavedTribe {
	id: TribeId
	year: number
	stock: Rec
	inventions: string[]
	lastInventionYear: number
	firsts: Record<string, 1>
	arrivals: number
	deaths: number
	extraPop: number
	queue: number
	lastCounter: number | null
	counterKey: string
	aiRate: number
	aiAcc: number
	personality: Tribe['personality']
	wins: number
	losses: number
	prestige: number
	lastEventYear: number
	sheep: number
	villagers: [string, Role, number, number, string, number][]
	buildings: { id: number; type: BType; key: string; v: number; progress: number; delivered: Rec; done: boolean; repair?: boolean; renovate?: boolean; graves?: number; launched?: boolean; field: [number, number][] | null }[]
}

interface SaveV4 {
	v: 4
	seed: number
	time: number
	dayTime: number
	nextId: number
	chill: number
	relations: Relation[]
	craters: Crater[]
	history: HistoryEntry[]
	lastGlobalEvent: number
	tribes: SavedTribe[]
	trees: [number, number, number][]
	rocks: [number, number, number, number, number, number][]
	bushes: [number, number][]
}

/** The counter value is only meaningful for the same Companion address + variable */
const counterKey = (id: TribeId) => `${settings.tribes[id].host}/${settings.tribes[id].variable}`

export function save() {
	const S = G.S, w = G.world
	if (params.nosave || !S) return
	const trees: [number, number, number][] = []
	w.trees.forEach((t, i) => {
		if (t.gone) trees.push([i, 2, 0])
		else if (t.cut) trees.push([i, 1, Math.round(t.rt)])
		else if (t.g < 1) trees.push([i, 0, +t.g.toFixed(2)])
	})
	const data: SaveV4 = {
		v: 4, seed: S.seed, time: Math.round(S.time), dayTime: +S.dayTime.toFixed(4), nextId: S.nextId, chill: 0, relations: S.relations,
		craters: S.craters, history: S.history.slice(-300), lastGlobalEvent: S.lastGlobalEvent,
		tribes: S.tribes.map((T) => {
			const stock = { ...T.stock }
			for (const v of T.villagers) if (v.claim) stock[v.claim.r] += v.claim.n
			return {
				id: T.id, year: T.year, stock, inventions: T.inventions, lastInventionYear: T.lastInventionYear, firsts: T.firsts, arrivals: T.arrivals,
				deaths: T.deaths, extraPop: T.extraPop, queue: T.queue, lastCounter: T.lastCounter, counterKey: counterKey(T.id), aiRate: T.aiRate,
				aiAcc: T.aiAcc, personality: T.personality, wins: T.wins, losses: T.losses, prestige: T.prestige, lastEventYear: T.lastEventYear,
				sheep: T.sheep.filter((s) => !s.gone).length,
				villagers: T.villagers.map((v): SavedTribe['villagers'][number] => [v.name, v.role, +v.x.toFixed(2), +v.y.toFixed(2), v.skin, v.android ? 1 : 0]),
				buildings: T.buildings.map((b) => ({
					id: b.id, type: b.type, key: b.key, v: b.v, progress: b.progress, delivered: b.delivered, done: b.done, repair: b.repair, renovate: b.renovate,
					graves: b.graves, launched: b.launched, field: b.field ? b.field.patches.map((p): [number, number] => [p.s, Math.round(p.t)]) : null,
				})),
			}
		}),
		trees,
		rocks: w.rocks.filter((k) => !k.gone).map((k) => [+k.x.toFixed(2), +k.y.toFixed(2), k.max, k.amt, Math.round(k.rt), k.seed]),
		bushes: w.bushes.map((b) => [b.gone ? 2 : b.ber, Math.round(b.rt)]),
	}
	store.set(SAVE_KEY, data)
}

function blankState(seed: number): State {
	return {
		seed, time: 0, dayTime: 0.3, player: settings.player, tribes: [], relations: initRelations(), events: [], craters: [], chill: 0, nextId: 1,
		history: [], lastGlobalEvent: 0,
	}
}

function resetTransient() {
	agents.length = 0
	resetTraffic()
	resetDiplomacy()
}

export function newGame() {
	const seed = Math.floor(Math.random() * 1e9)
	G.world = genWorld(seed)
	buildTreeGrid(G.world)
	G.S = blankState(seed)
	G.S.tribes = TRIBE_IDS.map(createTribe)
	G.resumed = false
	resetTransient()
	for (const T of G.S.tribes) placeLandmark(T)
	rebuildRoads()
}

export function load() {
	const d = params.nosave ? null : store.get<SaveV4>(SAVE_KEY)
	if (!d || d.v !== 4) return newGame()
	try {
		G.world = genWorld(d.seed)
		buildTreeGrid(G.world)
		const S = (G.S = blankState(d.seed))
		Object.assign(S, { time: d.time, dayTime: d.dayTime, nextId: d.nextId, relations: d.relations, craters: d.craters || [], history: d.history || [], lastGlobalEvent: d.lastGlobalEvent || 0 })
		const w = G.world
		w.rocks = d.rocks.map(([x, y, max, amt, rt, seed]) => ({ k: 1, x, y, max, amt, rt, res: 0, gone: 0, seed }))
		d.bushes.forEach(([ber, rt], i) => {
			const b = w.bushes[i]
			if (!b) return
			if (ber === 2) b.gone = 1
			else Object.assign(b, { ber, rt })
		})
		for (const [i, kind, val] of d.trees) {
			const t = w.trees[i]
			if (!t) continue
			if (kind === 2) t.gone = 1
			else if (kind === 1) Object.assign(t, { cut: 1, rt: val, g: 0 })
			else t.g = val
		}
		resetTransient()
		S.tribes = TRIBE_IDS.map((id) => {
			const T = createTribe(id)
			const st = d.tribes.find((t) => t.id === id)
			if (!st) return T
			Object.assign(T, {
				year: st.year, stock: st.stock, inventions: st.inventions, lastInventionYear: st.lastInventionYear, firsts: st.firsts, arrivals: st.arrivals,
				deaths: st.deaths, extraPop: st.extraPop, queue: st.queue, lastCounter: st.counterKey === counterKey(id) ? st.lastCounter : null,
				aiRate: st.aiRate, aiAcc: st.aiAcc, personality: st.personality, wins: st.wins, losses: st.losses, prestige: st.prestige, lastEventYear: st.lastEventYear,
			})
			for (const sb of st.buildings) {
				const cell = w.cellMap.get(sb.key)
				if (!cell) continue
				const b: Building = {
					k: 3, id: sb.id, tribe: id, type: sb.type, key: sb.key, ox: cell.ox, oy: cell.oy, v: sb.v, progress: sb.progress, delivered: sb.delivered,
					incoming: { wood: 0, stone: 0, food: 0 }, done: sb.done, field: null, repair: sb.repair, renovate: sb.renovate, graves: sb.graves, launched: sb.launched,
				}
				useCell(T, cell, b.id)
				if (sb.field) attachField(T, b, sb.field)
				T.buildings.push(b)
			}
			for (const [name, role, x, y, skin, android] of st.villagers) {
				const v = makeVillager(T, name, role, x, y, skin)
				v.android = !!android
				T.villagers.push(v)
			}
			if (st.sheep) addSheep(T, st.sheep)
			return T
		})
		for (const T of S.tribes) placeLandmark(T)
		rebuildRoads()
		G.resumed = S.tribes.some((t) => t.villagers.length > 0)
	} catch (e) {
		console.error('Could not load saved world, starting fresh', e)
		newGame()
	}
}
