import { params, SAVE_KEY, settings } from '../core/settings'
import { store } from '../core/util'
import type { BType, Role } from '../data/buildings'
import { attachField, rebuildRoads, useCell } from './buildings'
import { agents } from './agents'
import { initRivals } from './rivals'
import { G, newState, type Building, type Crater, type HistoryEntry, type Rec, type Rival } from './state'
import { resetTraffic } from './traffic'
import { addSheep, makeVillager } from './villagers'
import { buildTreeGrid, genWorld } from './worldgen'

interface SaveV3 {
	v: 3
	seed: number
	time: number
	year: number
	stock: Rec
	nextId: number
	lastCounter: number | null
	variable: string
	arrivals: number
	deaths: number
	extraPop: number
	queue: number
	firsts: Record<string, 1>
	inventions: string[]
	lastEventYear: number
	lastInventionYear: number
	lastRaidYear: number
	dayTime: number
	rivals: Rival[]
	craters: Crater[]
	history: HistoryEntry[]
	sheep: number
	villagers: [string, Role, number, number, string, number?][]
	buildings: { id: number; type: BType; ci: number; cj: number; v: number; progress: number; delivered: Rec; done: boolean; repair?: boolean; renovate?: boolean; graves?: number; launched?: boolean; field: [number, number][] | null }[]
	trees: [number, number, number][]
	rocks: [number, number, number, number, number, number][]
	bushes: [number, number][]
}

export function save() {
	const S = G.S, w = G.world
	if (params.nosave || !S) return
	const stock = { ...S.stock }
	for (const v of S.villagers) if (v.claim) stock[v.claim.r] += v.claim.n
	const trees: [number, number, number][] = []
	w.trees.forEach((t, i) => {
		if (t.gone) trees.push([i, 2, 0])
		else if (t.cut) trees.push([i, 1, Math.round(t.rt)])
		else if (t.g < 1) trees.push([i, 0, +t.g.toFixed(2)])
	})
	const data: SaveV3 = {
		v: 3, seed: S.seed, time: Math.round(S.time), year: S.year, stock, nextId: S.nextId, lastCounter: S.lastCounter,
		variable: settings.variable, arrivals: S.arrivals, deaths: S.deaths, extraPop: S.extraPop, queue: S.queue, firsts: S.firsts,
		inventions: S.inventions, lastEventYear: S.lastEventYear, lastInventionYear: S.lastInventionYear, lastRaidYear: S.lastRaidYear,
		dayTime: +S.dayTime.toFixed(4), rivals: S.rivals, craters: S.craters, history: S.history.slice(-200), sheep: S.sheep.length,
		villagers: S.villagers.map((v) => [v.name, v.role, +v.x.toFixed(2), +v.y.toFixed(2), v.skin, v.android ? 1 : 0]),
		buildings: S.buildings.map((b) => ({
			id: b.id, type: b.type, ci: b.ci, cj: b.cj, v: b.v, progress: b.progress, delivered: b.delivered, done: b.done,
			repair: b.repair, renovate: b.renovate, graves: b.graves, launched: b.launched, field: b.field ? b.field.patches.map((p): [number, number] => [p.s, Math.round(p.t)]) : null,
		})),
		trees,
		rocks: w.rocks.filter((k) => !k.gone).map((k) => [+k.x.toFixed(2), +k.y.toFixed(2), k.max, k.amt, Math.round(k.rt), k.seed]),
		bushes: w.bushes.map((b) => [b.gone ? 2 : b.ber, Math.round(b.rt)]),
	}
	store.set(SAVE_KEY, data)
}

export function newGame() {
	const seed = Math.floor(Math.random() * 1e9)
	G.world = genWorld(seed)
	buildTreeGrid(G.world)
	G.S = newState(seed)
	G.resumed = false
	agents.length = 0
	resetTraffic()
	initRivals()
	rebuildRoads()
}

export function load() {
	const d = params.nosave ? null : store.get<SaveV3>(SAVE_KEY)
	if (!d || d.v !== 3) return newGame()
	try {
		G.world = genWorld(d.seed)
		buildTreeGrid(G.world)
		const S = (G.S = newState(d.seed))
		Object.assign(S, {
			time: d.time || 0, year: d.year || 0, stock: d.stock, nextId: d.nextId,
			lastCounter: d.variable === settings.variable ? d.lastCounter : null,
			arrivals: d.arrivals || 0, deaths: d.deaths || 0, extraPop: d.extraPop || 0, queue: d.queue || 0, firsts: d.firsts || {},
			inventions: d.inventions || [], lastEventYear: d.lastEventYear || 0, lastInventionYear: d.lastInventionYear || 0,
			lastRaidYear: d.lastRaidYear || 0, dayTime: d.dayTime ?? 0.3, rivals: d.rivals || [], craters: d.craters || [], history: d.history || [],
		})
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
		for (const sb of d.buildings) {
			const cell = w.cellMap.get(sb.ci + ',' + sb.cj)
			if (!cell) continue
			const b: Building = {
				k: 3, id: sb.id, type: sb.type, ci: sb.ci, cj: sb.cj, ox: cell.ox, oy: cell.oy, v: sb.v, progress: sb.progress,
				delivered: sb.delivered, incoming: { wood: 0, stone: 0, food: 0 }, done: sb.done, field: null, repair: sb.repair,
				renovate: sb.renovate, graves: sb.graves, launched: sb.launched,
			}
			useCell(cell, b.id)
			if (sb.field) attachField(b, sb.field)
			S.buildings.push(b)
		}
		for (const [name, role, x, y, skin, android] of d.villagers) {
			const v = makeVillager(name, role, x, y, skin)
			v.android = !!android
			S.villagers.push(v)
		}
		agents.length = 0
		resetTraffic()
		initRivals()
		if (d.sheep) addSheep(d.sheep)
		rebuildRoads()
		G.resumed = S.villagers.length > 0
	} catch (e) {
		console.error('Could not load saved village, starting fresh', e)
		newGame()
	}
}
