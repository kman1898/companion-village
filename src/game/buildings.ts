import { B, costTotal, RES, SPECIAL_ORDER, type BType, type Res, type Role } from '../data/buildings'
import { dist2 } from '../core/util'
import { banner, ticker } from '../ui/notify'
import { emit } from '../render/particles'
import { CX, CY, G, has, idx, popCount, type Building, type Cell, type Patch } from './state'

export function roleCounts(): Record<Role, number> {
	const c: Record<Role, number> = { builder: 0, woodcutter: 0, mason: 0, farmer: 0 }
	for (const v of G.S.villagers) c[v.role]++
	return c
}

export function countType(t: BType) {
	let n = 0
	for (const b of G.S.buildings) if (b.type === t) n++
	return n
}

export function useCell(cell: Cell, owner: number) {
	G.S.used.set(cell.key, owner)
	const w = G.world
	for (const list of [w.trees, w.rocks, w.bushes])
		for (const o of list as { x: number; y: number; gone: 0 | 1 }[])
			if (o.x >= cell.ox - 1 && o.x < cell.ox + 3 && o.y >= cell.oy - 1 && o.y < cell.oy + 3.3) o.gone = 1
}

function cellBlocked(c: Cell) {
	if (c.park || G.S.used.has(c.key)) return true
	for (const cr of G.S.craters) if (cr.until > G.S.year && dist2(cr.x, cr.y, c.ox + 1, c.oy + 1) < (cr.r + 1.5) ** 2) return true
	return false
}

export function rebuildRoads() {
	const roads = new Set<number>()
	const ring = (ox: number, oy: number) => {
		for (let x = ox - 1; x <= ox + 2; x++) {
			roads.add(idx(x, oy - 1))
			roads.add(idx(x, oy + 2))
		}
		for (let y = oy; y <= oy + 1; y++) {
			roads.add(idx(ox - 1, y))
			roads.add(idx(ox + 2, y))
		}
	}
	for (const b of G.S.buildings) {
		ring(b.ox, b.oy)
		if (b.field) ring(b.field.ox, b.field.oy)
	}
	G.roads = roads
	G.terrainDirty = true
}

export function makeBuilding(type: BType, cell: Cell): Building {
	return {
		k: 3, id: G.S.nextId++, type, ci: cell.i, cj: cell.j, ox: cell.ox, oy: cell.oy, v: Math.floor(Math.random() * 12),
		progress: 0, delivered: { wood: 0, stone: 0, food: 0 }, incoming: { wood: 0, stone: 0, food: 0 }, done: false, field: null,
	}
}

export function placeBuilding(type: BType, quiet = false): Building | null {
	const cell = G.world.cells.find((c) => !cellBlocked(c))
	if (!cell) return null
	const b = makeBuilding(type, cell)
	useCell(cell, b.id)
	if (type === 'farm') attachField(b)
	G.S.buildings.push(b)
	rebuildRoads()
	if (!quiet) ticker(`Builders broke ground on a new ${B[type].name}`, '⚒')
	return b
}

export function attachField(b: Building, saved?: [number, number][]) {
	const opts = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]
	for (const [di, dj] of opts) {
		const c = G.world.cellMap.get(b.ci + di + ',' + (b.cj + dj))
		if (!c || cellBlocked(c)) continue
		useCell(c, b.id)
		b.field = {
			ci: c.i, cj: c.j, ox: c.ox, oy: c.oy,
			patches: [0, 1, 2, 3].map((n): Patch => ({ s: (saved ? saved[n][0] : 0) as Patch['s'], t: saved ? saved[n][1] : 0, res: 0, x: c.ox + (n % 2), y: c.oy + (n >> 1) })),
		}
		return
	}
}

export function need(site: Building, r: Res) {
	return (B[site.type].cost[r] || 0) - site.delivered[r] - site.incoming[r]
}

export function maxProgress(site: Building) {
	const total = costTotal(site.type)
	if (!total) return B[site.type].work
	const d = site.delivered.wood + site.delivered.stone + site.delivered.food
	return (B[site.type].work * d) / total
}

export function completeBuilding(b: Building) {
	b.done = true
	const def = B[b.type]
	emit(b.ox + 1, b.oy + 1.2, 'spark', 26)
	if (b.repair) {
		b.repair = false
		ticker(`${def.name} repaired`, '✦')
		return
	}
	if (!G.S.firsts[b.type] && b.type !== 'house') {
		banner(`The first ${def.name} is finished!`, `Year ${G.S.year} · ${popCount()} villagers`)
	}
	G.S.firsts[b.type] = 1
	ticker(`${def.name} completed`, '✦')
}

/** Knock a building back to a construction site that builders will repair */
export function damageBuilding(b: Building, severity: number) {
	if (b.type === 'graveyard') return
	const def = B[b.type]
	const keep = 1 - severity
	if (b.done) {
		b.done = false
		b.repair = true
	}
	b.progress = Math.min(b.progress, def.work * keep)
	for (const r of RES) b.delivered[r] = Math.min(b.delivered[r], Math.floor((def.cost[r] || 0) * keep))
	b.fire = 0
	emit(b.ox + 1, b.oy + 1.2, 'dust', 14)
	emit(b.ox + 1, b.oy + 1.2, 'debris', 10)
}

export function destroyBuilding(b: Building) {
	const S = G.S
	S.buildings.splice(S.buildings.indexOf(b), 1)
	S.used.delete(b.ci + ',' + b.cj)
	if (b.field) S.used.delete(b.field.ci + ',' + b.field.cj)
	rebuildRoads()
}

export function ignite(b: Building) {
	if (b.fire || b.type === 'graveyard' || b.type === 'fountain' || b.type === 'well') return false
	b.fire = has('fireBrigade') ? 7 : 15
	return true
}

export function updateFires(dt: number) {
	for (const b of G.S.buildings) {
		if (!b.fire) continue
		b.fire -= dt
		if (Math.random() < dt * 14) emit(b.ox + 1, b.oy + 1.0, 'flame', 1)
		if (Math.random() < dt * 4) emit(b.ox + 1, b.oy + 0.6, 'smoke', 1)
		if (Math.random() < dt * 3) emit(b.ox + 1, b.oy + 0.8, 'ember', 1)
		// fire may jump to a neighbour
		if (!has('fireBrigade') && Math.random() < dt * 0.05) {
			const near = G.S.buildings.find((o) => o !== b && !o.fire && dist2(o.ox, o.oy, b.ox, b.oy) <= 9.5 && o.done)
			if (near && ignite(near)) ticker(`The fire spread to the ${B[near.type].name}!`, '🔥', '#ff9a2e')
		}
		if (b.fire <= 0) {
			b.fire = 0
			damageBuilding(b, 0.6)
			ticker(`The ${B[b.type].name} burned down — builders will rebuild it`, '🔥', '#ff9a2e')
		}
	}
}

export function addGrave() {
	const S = G.S
	let gy = S.buildings.find((b) => b.type === 'graveyard' && (b.graves || 0) < 12)
	if (!gy) {
		gy = placeBuilding('graveyard', true) || undefined
		if (!gy) return
		gy.done = true
		gy.graves = 0
		gy.progress = 1
	}
	gy.graves = (gy.graves || 0) + 1
}

// ---------------------------------------------------------------------
// Planner: decides what to build next
// ---------------------------------------------------------------------
export function chooseBuilding(): BType | null {
	const S = G.S
	const pop = popCount(), c = roleCounts()
	let housing = 0
	for (const b of S.buildings) housing += B[b.type].cap || 0
	const houseType: BType = has('masonry') && pop >= 20 ? 'stonehouse' : 'house'
	if (housing < pop + 2) return houseType
	for (const t of SPECIAL_ORDER) {
		const def = B[t]
		if (def.inv && !has(def.inv)) continue
		if (pop < (def.u || 0)) continue
		if (countType(t) < (def.want ? def.want(pop, c) : 0)) return t
	}
	if (housing < pop * 1.5 + 6) return houseType
	if (S.stock.wood > 40 && S.stock.stone > 25 && housing < pop * 3 + 10) return houseType
	return null
}

export function planner() {
	const c = roleCounts()
	if (!c.builder) return
	let sites = 0
	for (const b of G.S.buildings) if (!b.done) sites++
	if (sites >= Math.min(6, 1 + Math.floor(c.builder / 3))) return
	const t = chooseBuilding()
	if (t) placeBuilding(t)
}

/** Bounding box of the built-up area (tiles) */
export function villageBounds() {
	let x0 = CX - 3, x1 = CX + 3, y0 = CY - 3, y1 = CY + 3
	for (const b of G.S.buildings) {
		x0 = Math.min(x0, b.ox - 1); x1 = Math.max(x1, b.ox + 3)
		y0 = Math.min(y0, b.oy - 1); y1 = Math.max(y1, b.oy + 3)
	}
	return { x0, x1, y0, y1 }
}
